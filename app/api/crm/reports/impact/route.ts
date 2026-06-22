import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import {
    resolveCrmAccess, isCrmAccessError, readOrgId, scopeLeadsQuery,
} from '@/backend/lib/crm/access';

/**
 * GET /api/crm/reports/impact
 *
 * Decision-maker funnel report. Returns a single comprehensive payload the
 * CRM Reports page renders without further client-side aggregation.
 *
 * Query params:
 *   from=YYYY-MM-DD            (required)
 *   to=YYYY-MM-DD              (required)
 *   campaign_id=...            (optional, repeatable)
 *   property_id=...            (optional, repeatable)
 *   user_id=...                (optional, single rep filter; admins only)
 *   group_by=month|week        (default month)
 *   target_win_rate=20         (default 20%, used for chart reference line)
 */

const DEFAULT_TARGET_WIN_RATE = 20;
const STALE_PIPELINE_DAYS = 14;

export async function GET(request: NextRequest) {
    const access = await resolveCrmAccess(request, readOrgId(request));
    if (isCrmAccessError(access)) return access;

    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) {
        return NextResponse.json(
            { error: 'from and to query params are required (YYYY-MM-DD)' },
            { status: 400 }
        );
    }

    const campaignIds = url.searchParams.getAll('campaign_id');
    const propertyIds = url.searchParams.getAll('property_id');
    const userId = url.searchParams.get('user_id');
    const groupBy = (url.searchParams.get('group_by') || 'month') as 'month' | 'week';
    const targetWinRate = Math.max(
        0,
        Math.min(100, Number(url.searchParams.get('target_win_rate') || DEFAULT_TARGET_WIN_RATE))
    );

    // Reps are restricted to their own leads unless explicitly given the user_id
    // filter (which they're allowed to use for themselves).
    const effectiveUserId = access.isAdmin ? userId : (userId && userId === access.user.id ? userId : null);

    // ── 1. Status semantics ──────────────────────────────────────────────────
    const { data: statuses } = await supabaseAdmin
        .from('crm_lead_statuses')
        .select('id, name, color, is_won, is_lost, sort_order, is_terminal')
        .or(`organization_id.eq.${access.organizationId},organization_id.is.null`)
        .order('sort_order', { ascending: true });

    const wonIds = new Set((statuses || []).filter((s) => s.is_won).map((s) => s.id));
    const lostIds = new Set((statuses || []).filter((s) => s.is_lost).map((s) => s.id));

    // ── 2. Leads in range ────────────────────────────────────────────────────
    // For "leads received" we filter by created_at in range.
    // For "won/lost" we also want leads whose closed_at is in range, even if
    // created earlier — otherwise deals closed this month from old leads disappear.
    //
    // NOTE on campaign join: crm_leads has NO foreign key to crm_campaigns (the
    // 'campaign' column is a freeform TEXT label, usually the campaign name).
    // We fetch campaigns in a parallel query and join in JS by name. This
    // avoids the PostgREST "Could not find a relationship" error that would
    // otherwise come from a fake FK embed.
    let leadsQuery = supabaseAdmin
        .from('crm_leads')
        .select(`
            id, status, deal_value, priority, created_at, updated_at, closed_at,
            last_contacted, lead_source, campaign, organization_id, assigned_to, created_by,
            city, property_interest, is_archived, lost_reason, lost_reason_notes,
            status_info:crm_lead_statuses(id, name, color, is_won, is_lost),
            source_info:crm_lead_sources(id, name),
            assigned_user:users!crm_leads_assigned_to_fkey(id, full_name, email)
        `)
        .eq('is_archived', false)
        // Pre-filter to a 24-month lookback window. Covers any reasonable period
        // and keeps the working set bounded. The in-JS filter then narrows precisely.
        .gte('created_at', new Date(new Date(from + 'T00:00:00Z').getTime() - 730 * 86400_000).toISOString());
    leadsQuery = scopeLeadsQuery(leadsQuery, access);

    // Fetch campaigns in parallel — we need the full list anyway for the
    // campaign filter dropdown + for the name→id map.
    const campaignsQuery = supabaseAdmin
        .from('crm_campaigns')
        .select('id, name, channel, budget_total, budget_period, start_date, end_date, status, created_at')
        .eq('organization_id', access.organizationId)
        .order('created_at', { ascending: false });

    const [{ data: rawLeads, error: leadsErr }, { data: orgCampaigns }] = await Promise.all([
        leadsQuery,
        campaignsQuery,
    ]);
    if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });

    // Build a name→campaign map (lowercase compare) so leads carrying the
    // campaign NAME in their `campaign` text column resolve to the right id.
    const campaignByName = new Map<string, any>();
    for (const c of orgCampaigns || []) {
        if (c.name) campaignByName.set(c.name.trim().toLowerCase(), c);
    }

    // Build an id set for filter matching (when caller passes UUIDs)
    const campaignIdSet = new Set((orgCampaigns || []).map((c) => c.id));
    const validCampaignIds = campaignIds.filter((id) => campaignIdSet.has(id));

    const fromMs = new Date(from + 'T00:00:00Z').getTime();
    const toMs = new Date(to + 'T23:59:59.999Z').getTime();

    const leads = (rawLeads || []).filter((l) => {
        const createdMs = new Date(l.created_at).getTime();
        const closedMs = l.closed_at ? new Date(l.closed_at).getTime() : null;
        const inRange = createdMs >= fromMs && createdMs <= toMs;
        const closedInRange = closedMs != null && closedMs >= fromMs && closedMs <= toMs;
        return inRange || closedInRange;
    });

    // Resolve each lead's campaign from its text label.
    // `leadCampaignId` will be set when the lead's `campaign` text matches a
    // real campaign name; null otherwise.
    for (const l of leads as any[]) {
        // No FK exists between crm_leads and crm_campaigns, so we cannot embed.
        // Try the text label first — if it matches a campaign name, attach the row.
        let ci: any = null;
        if (l.campaign) {
            const match = campaignByName.get(String(l.campaign).trim().toLowerCase());
            if (match) ci = match;
        }
        l._campaignInfo = ci;
        l._campaignId = ci?.id ?? null;
    }

    // Apply campaign / property / user filters
    const filteredLeads = leads.filter((l: any) => {
        if (validCampaignIds.length > 0) {
            if (!l._campaignId || !validCampaignIds.includes(l._campaignId)) return false;
        }
        if (propertyIds.length > 0) {
            if (!propertyIds.includes(l.property_interest ?? '')) return false;
        }
        if (effectiveUserId) {
            if (l.assigned_to !== effectiveUserId) return false;
        }
        return true;
    });

    // ── 3. Spend in range ────────────────────────────────────────────────────
    // Pull spend for the selected campaigns (or all if no campaign filter).
    // We already fetched `orgCampaigns` in parallel with leads above, so reuse it.
    const campaignIdFilter = validCampaignIds.length > 0
        ? validCampaignIds
        : (orgCampaigns || []).map((c: any) => c.id);

    const { data: spendRows } = campaignIdFilter.length > 0
        ? await supabaseAdmin
            .from('crm_campaign_spend')
            .select('id, campaign_id, spend_date, amount, source')
            .eq('organization_id', access.organizationId)
            .in('campaign_id', campaignIdFilter)
            .gte('spend_date', from)
            .lte('spend_date', to)
        : { data: [] };

    // Performance metrics (Meta / Google API): impressions, clicks, CTR, CPC, CPM.
    // Pulled in parallel — they live in a separate table.
    const { data: metricsRows } = campaignIdFilter.length > 0
        ? await supabaseAdmin
            .from('crm_campaign_metrics')
            .select('campaign_id, metric_date, impressions, clicks, ctr, cpc, cpm')
            .eq('organization_id', access.organizationId)
            .in('campaign_id', campaignIdFilter)
            .gte('metric_date', from)
            .lte('metric_date', to)
        : { data: [] };

    // If no granular spend entries exist, derive from crm_campaigns.budget_total
    // proportional to days overlapping the period. Use the orgCampaigns list
    // already loaded.
    const campaigns = (orgCampaigns || []).filter((c: any) =>
        campaignIdFilter.length === 0 || campaignIdFilter.includes(c.id)
    );

    const derivedSpend = computeDerivedSpend(campaigns || [], from, to);
    const totalSpend = (spendRows || []).reduce((s, r) => s + Number(r.amount || 0), 0) + derivedSpend;

    // ── 4. Aggregate ─────────────────────────────────────────────────────────
    const result = aggregate({
        leads: filteredLeads,
        statuses: statuses || [],
        wonIds,
        lostIds,
        spendRows: spendRows || [],
        metricsRows: metricsRows || [],
        totalSpend,
        fromMs,
        toMs,
        groupBy,
        targetWinRate,
        orgId: access.organizationId,
        staleDays: STALE_PIPELINE_DAYS,
    });

    // ── 5. Filter dropdowns (properties only — campaigns list is reused from
    //        the parallel fetch above as `orgCampaigns`)
    const { data: properties } = await supabaseAdmin
        .from('properties')
        .select('id, name')
        .eq('organization_id', access.organizationId)
        .order('name');
    const allCampaigns = orgCampaigns || [];

    return NextResponse.json({
        period: { from, to, label: formatRangeLabel(from, to), group_by: groupBy },
        kpis: result.kpis,
        sparklines: result.sparklines,
        monthly_trend: result.monthlyTrend,
        status_distribution: result.statusDistribution,
        source_breakdown: result.sourceBreakdown,
        campaign_breakdown: result.campaignBreakdown,
        rep_performance: result.repPerformance,
        lost_reasons: result.lostReasons,
        insights: result.insights,
        filters: {
            campaigns: (allCampaigns || []).map((c) => ({
                id: c.id,
                name: c.name,
                channel: c.channel,
                budget_total: c.budget_total,
                budget_period: c.budget_period,
                start_date: c.start_date,
                end_date: c.end_date,
            })),
            properties: (properties || []).map((p) => ({ id: p.id, name: p.name })),
        },
        target_win_rate: targetWinRate,
        generated_at: new Date().toISOString(),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation
// ─────────────────────────────────────────────────────────────────────────────

interface AggInput {
    leads: any[];
    statuses: any[];
    wonIds: Set<string>;
    lostIds: Set<string>;
    spendRows: any[];
    metricsRows: any[];
    totalSpend: number;
    fromMs: number;
    toMs: number;
    groupBy: 'month' | 'week';
    targetWinRate: number;
    orgId: string;
    staleDays: number;
}

function aggregate(input: AggInput) {
    const { leads, wonIds, lostIds, totalSpend, groupBy, targetWinRate, staleDays } = input;
    const fromMs = input.fromMs;
    const toMs = input.toMs;

    // Build the time buckets that fall within the period
    const buckets = buildBuckets(fromMs, toMs, groupBy);
    const bucketIndex = (ms: number) => {
        for (let i = buckets.length - 1; i >= 0; i--) {
            if (ms >= buckets[i].startMs) return i;
        }
        return 0;
    };

    // Per-bucket stats
    const monthly: Array<{
        key: string;
        label: string;
        leads: number;
        connected: number;
        meetings: number;
        won: number;
        lost: number;
        revenue: number;
        lostRevenue: number;
        topSource: string;
        spend: number;
    }> = buckets.map((b) => ({
        key: b.key,
        label: b.label,
        leads: 0,
        connected: 0,
        meetings: 0,
        won: 0,
        lost: 0,
        revenue: 0,
        lostRevenue: 0,
        topSource: '',
        spend: 0,
    }));

    const sourceAgg: Record<string, { id: string | null; name: string; count: number; value: number; won: number; wonValue: number }> = {};
    const campaignAgg: Record<string, { id: string; name: string; leads: number; connected: number; won: number; revenue: number; spend: number }> = {};
    const repAgg: Record<string, { id: string; name: string; leads: number; connected: number; won: number; lost: number; pipeline: number; revenue: number; closeTimes: number[] }> = {};
    const statusAgg: Record<string, { id: string; name: string; color: string; count: number; value: number; isWon: boolean; isLost: boolean }> = {};
    const lostReasonAgg: Record<string, { reason: string; count: number; value: number }> = {};

    let activePipelineValue = 0;
    let staleCount = 0;
    let staleValue = 0;
    const staleCutoffMs = Date.now() - staleDays * 86400_000;
    const totalCloseTimes: number[] = [];

    for (const l of leads as any[]) {
        // Normalize PostgREST embed arrays → single object.
        const sourceInfo = Array.isArray(l.source_info) ? l.source_info[0] : l.source_info;
        const statusInfo = Array.isArray(l.status_info) ? l.status_info[0] : l.status_info;
        const assignedUser = Array.isArray(l.assigned_user) ? l.assigned_user[0] : l.assigned_user;
        // Campaign was resolved in the outer setup loop (via name→id map).
        const campaignInfo = l._campaignInfo;
        const createdMs = new Date(l.created_at).getTime();
        const inRange = createdMs >= fromMs && createdMs <= toMs;
        const closedMs = l.closed_at ? new Date(l.closed_at).getTime() : null;
        const closedInRange = closedMs != null && closedMs >= fromMs && closedMs <= toMs;

        // ── Bucket assignment
        // Leads created in range go to the created-month bucket.
        if (inRange) {
            const bIdx = bucketIndex(createdMs);
            if (bIdx >= 0 && bIdx < monthly.length) {
                monthly[bIdx].leads++;
            }
        }

        // Won / lost close events: use closed_at if available, fall back to updated_at.
        const isWon = wonIds.has(l.status);
        const isLost = lostIds.has(l.status);

        if (isWon || isLost) {
            const eventMs = closedMs ?? new Date(l.updated_at).getTime();
            if (eventMs >= fromMs && eventMs <= toMs) {
                const bIdx = bucketIndex(eventMs);
                if (bIdx >= 0 && bIdx < monthly.length) {
                    if (isWon) {
                        monthly[bIdx].won++;
                        monthly[bIdx].revenue += Number(l.deal_value || 0);
                    } else {
                        monthly[bIdx].lost++;
                        monthly[bIdx].lostRevenue += Number(l.deal_value || 0);
                    }
                }
            }

            // Time-to-close tracking (use created → closed, in days)
            if (closedMs && isWon) {
                totalCloseTimes.push((closedMs - createdMs) / 86400_000);
            }
        }

        // Active pipeline: not won, not lost, in any time (or in range)
        if (!isWon && !isLost && l.status) {
            activePipelineValue += Number(l.deal_value || 0);
        }

        // Connected: leads with last_contacted in the bucket
        if (l.last_contacted) {
            const lcMs = new Date(l.last_contacted).getTime();
            if (lcMs >= fromMs && lcMs <= toMs) {
                const bIdx = bucketIndex(lcMs);
                if (bIdx >= 0 && bIdx < monthly.length) monthly[bIdx].connected++;
            }
        }

        // Meetings: leads that have a "meeting" event in the period — kept simple,
        // meeting activity comes from crm_activity_log. We approximate: any lead
        // with a non-null last_contacted AND status_info name like "Meeting..."
        // For accuracy we'd join activity_log. For the MVP this gives a reasonable
        // proxy. We mark 0 if no meetings data is plumbed; the meetings column
        // will show in the table as a separate signal.

        // Source breakdown (only leads created in range, to keep "attribution" clean)
        if (inRange) {
            const srcKey = sourceInfo?.id || 'unknown';
            const srcName = sourceInfo?.name || 'Unknown';
            if (!sourceAgg[srcKey]) {
                sourceAgg[srcKey] = { id: sourceInfo?.id ?? null, name: srcName, count: 0, value: 0, won: 0, wonValue: 0 };
            }
            sourceAgg[srcKey].count++;
            sourceAgg[srcKey].value += Number(l.deal_value || 0);
            if (isWon) {
                sourceAgg[srcKey].won++;
                sourceAgg[srcKey].wonValue += Number(l.deal_value || 0);
            }
        }

        // Campaign breakdown (only leads created in range, attributable to a campaign)
        if (inRange && campaignInfo?.id) {
            const cid = campaignInfo.id;
            const cname = campaignInfo.name || 'Unknown campaign';
            if (!campaignAgg[cid]) {
                campaignAgg[cid] = { id: cid, name: cname, leads: 0, connected: 0, won: 0, revenue: 0, spend: 0 };
            }
            campaignAgg[cid].leads++;
            if (isWon) {
                campaignAgg[cid].won++;
                campaignAgg[cid].revenue += Number(l.deal_value || 0);
            }
        }

        // Rep performance (reps with assigned_to set; creators also count)
        const repId = l.assigned_to || l.created_by;
        if (repId && inRange) {
            if (!repAgg[repId]) {
                repAgg[repId] = {
                    id: repId,
                    name: assignedUser?.full_name || 'Unassigned',
                    leads: 0, connected: 0, won: 0, lost: 0,
                    pipeline: 0, revenue: 0, closeTimes: [],
                };
            }
            repAgg[repId].leads++;
            repAgg[repId].pipeline += Number(l.deal_value || 0);
            if (isWon) {
                repAgg[repId].won++;
                repAgg[repId].revenue += Number(l.deal_value || 0);
                if (closedMs) repAgg[repId].closeTimes.push((closedMs - createdMs) / 86400_000);
            } else if (isLost) {
                repAgg[repId].lost++;
            }
        }

        // Status distribution (count ALL leads in the period, not just in-range created)
        if (inRange || closedInRange) {
            const sid = l.status || 'unknown';
            if (!statusAgg[sid]) {
                statusAgg[sid] = {
                    id: sid,
                    name: statusInfo?.name || 'Unknown',
                    color: statusInfo?.color || '#6B7280',
                    count: 0,
                    value: 0,
                    isWon: wonIds.has(sid),
                    isLost: lostIds.has(sid),
                };
            }
            statusAgg[sid].count++;
            statusAgg[sid].value += Number(l.deal_value || 0);
        }

        // Lost reason tally
        if (isLost && l.lost_reason) {
            if (!lostReasonAgg[l.lost_reason]) {
                lostReasonAgg[l.lost_reason] = { reason: l.lost_reason, count: 0, value: 0 };
            }
            lostReasonAgg[l.lost_reason].count++;
            lostReasonAgg[l.lost_reason].value += Number(l.deal_value || 0);
        }

        // Stale pipeline: open leads not contacted in >14 days
        if (!isWon && !isLost && l.status) {
            const last = l.last_contacted ? new Date(l.last_contacted).getTime() : createdMs;
            if (last < staleCutoffMs) {
                staleCount++;
                staleValue += Number(l.deal_value || 0);
            }
        }
    }

    // Distribute spend into monthly buckets
    for (const row of input.spendRows) {
        const ms = new Date(row.spend_date + 'T00:00:00Z').getTime();
        const bIdx = bucketIndex(ms);
        if (bIdx >= 0 && bIdx < monthly.length) monthly[bIdx].spend += Number(row.amount || 0);
    }

    // Top source per month
    const monthlySource: Record<number, Record<string, number>> = {};
    for (let i = 0; i < monthly.length; i++) monthlySource[i] = {};
    for (const l of leads as any[]) {
        const sourceInfo = Array.isArray(l.source_info) ? l.source_info[0] : l.source_info;
        const createdMs = new Date(l.created_at).getTime();
        if (createdMs < fromMs || createdMs > toMs) continue;
        const bIdx = bucketIndex(createdMs);
        if (bIdx < 0 || bIdx >= monthly.length) continue;
        const srcName = sourceInfo?.name || 'Unknown';
        monthlySource[bIdx][srcName] = (monthlySource[bIdx][srcName] || 0) + 1;
    }
    for (let i = 0; i < monthly.length; i++) {
        const top = Object.entries(monthlySource[i]).sort((a, b) => b[1] - a[1])[0];
        monthly[i].topSource = top ? top[0] : '—';
    }

    // ── KPIs
    const totalLeads = monthly.reduce((s, m) => s + m.leads, 0);
    const totalWon = monthly.reduce((s, m) => s + m.won, 0);
    const totalLost = monthly.reduce((s, m) => s + m.lost, 0);
    const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
    const totalLostRevenue = monthly.reduce((s, m) => s + m.lostRevenue, 0);
    const totalConnected = monthly.reduce((s, m) => s + m.connected, 0);
    const winRate = totalLeads > 0 ? (totalWon / totalLeads) * 100 : 0;
    const avgDealSize = totalWon > 0 ? totalRevenue / totalWon : 0;
    const avgTimeToClose = totalCloseTimes.length
        ? totalCloseTimes.reduce((a, b) => a + b, 0) / totalCloseTimes.length
        : null;

    // Sparklines: per-bucket trends
    const sparklines = {
        leads:    monthly.map((m) => m.leads),
        won:      monthly.map((m) => m.won),
        lost:     monthly.map((m) => m.lost),
        revenue:  monthly.map((m) => m.revenue),
        connected:monthly.map((m) => m.connected),
    };

    // Attach spend to campaignAgg (sum spend for each campaign)
    for (const row of input.spendRows) {
        if (campaignAgg[row.campaign_id]) {
            campaignAgg[row.campaign_id].spend += Number(row.amount || 0);
        }
    }

    // Aggregate Meta/Google performance metrics per campaign. CTR / CPC / CPM
    // are simple averages across days (weighted averages would over-weight low-volume
    // days; this matches what Meta Business Manager shows at the campaign level).
    // CPM (cost-per-mille) and CTR are also computable from totals for accuracy.
    const metricsAgg: Record<string, {
        impressions: number;
        clicks: number;
        ctr_sum: number;
        ctr_n: number;
        cpc_sum: number;
        cpc_n: number;
        cpm_sum: number;
        cpm_n: number;
    }> = {};
    for (const r of (input as any).metricsRows || []) {
        const cid = r.campaign_id;
        if (!metricsAgg[cid]) {
            metricsAgg[cid] = { impressions: 0, clicks: 0, ctr_sum: 0, ctr_n: 0, cpc_sum: 0, cpc_n: 0, cpm_sum: 0, cpm_n: 0 };
        }
        const m = metricsAgg[cid];
        m.impressions += Number(r.impressions || 0);
        m.clicks += Number(r.clicks || 0);
        if (r.ctr != null) { m.ctr_sum += Number(r.ctr); m.ctr_n++; }
        if (r.cpc != null) { m.cpc_sum += Number(r.cpc); m.cpc_n++; }
        if (r.cpm != null) { m.cpm_sum += Number(r.cpm); m.cpm_n++; }
    }

    // Status list, sorted by sort_order
    const statusDistribution = Object.values(statusAgg).sort((a, b) => b.count - a.count);

    // Source / campaign / rep lists
    const sourceBreakdown = Object.values(sourceAgg)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    const campaignBreakdown = Object.values(campaignAgg)
        .map((c: any) => {
            const m = metricsAgg[c.id];
            // Use totals to recompute CTR accurately (clicks/impressions)
            // instead of averaging daily CTR (which is what Meta's API returns
            // when called with time_increment=1 — it's the day's CTR).
            const ctr = m && m.impressions > 0 ? (m.clicks / m.impressions) * 100 : (m && m.ctr_n > 0 ? m.ctr_sum / m.ctr_n : null);
            return {
                ...c,
                spend: c.spend,
                roi: c.spend > 0 ? ((c.revenue - c.spend) / c.spend) * 100 : null,
                cpl: c.leads > 0 ? c.spend / c.leads : null,
                cpa: c.won > 0 ? c.spend / c.won : null,
                impressions: m?.impressions || 0,
                clicks: m?.clicks || 0,
                ctr,
                cpc: m && m.cpc_n > 0 ? m.cpc_sum / m.cpc_n : null,
                cpm: m && m.cpm_n > 0 ? m.cpm_sum / m.cpm_n : null,
            };
        })
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 10);
    const repPerformance = Object.values(repAgg)
        .map((r) => ({
            ...r,
            win_rate: r.leads > 0 ? (r.won / r.leads) * 100 : 0,
            avg_days_to_close: r.closeTimes.length
                ? r.closeTimes.reduce((a, b) => a + b, 0) / r.closeTimes.length
                : null,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);

    // Insights
    const topCampaign = [...campaignBreakdown]
        .filter((c) => c.roi != null)
        .sort((a, b) => (b.roi || 0) - (a.roi || 0))[0] || null;

    const underperformer = [...repPerformance]
        .filter((r) => r.leads >= 5)
        .sort((a, b) => a.win_rate - b.win_rate)[0] || null;

    const lostReasons = Object.values(lostReasonAgg)
        .sort((a, b) => b.count - a.count);

    return {
        kpis: {
            leads_received: totalLeads,
            leads_connected: totalConnected,
            active_pipeline_value: activePipelineValue,
            won_revenue: totalRevenue,
            lost_revenue: totalLostRevenue,
            win_rate: winRate,
            avg_deal_size: avgDealSize,
            avg_time_to_close_days: avgTimeToClose,
            total_spend: totalSpend,
            cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
            cpa: totalWon > 0 ? totalSpend / totalWon : 0,
            roi: totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0,
            stale_pipeline: { count: staleCount, value: staleValue, days: staleDays },
            // Meta/Google ad performance totals for the period.
            impressions: Object.values(metricsAgg).reduce((s, m) => s + (m?.impressions || 0), 0),
            clicks: Object.values(metricsAgg).reduce((s, m) => s + (m?.clicks || 0), 0),
            ctr: (() => {
                const totalImpr = Object.values(metricsAgg).reduce((s, m) => s + (m?.impressions || 0), 0);
                const totalClicks = Object.values(metricsAgg).reduce((s, m) => s + (m?.clicks || 0), 0);
                return totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
            })(),
        },
        sparklines,
        monthlyTrend: monthly,
        statusDistribution,
        sourceBreakdown,
        campaignBreakdown,
        repPerformance,
        lostReasons,
        insights: {
            top_campaign: topCampaign,
            underperformer,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildBuckets(fromMs: number, toMs: number, groupBy: 'month' | 'week'): Array<{ key: string; label: string; startMs: number; endMs: number }> {
    const buckets: Array<{ key: string; label: string; startMs: number; endMs: number }> = [];
    if (groupBy === 'week') {
        const start = new Date(fromMs);
        start.setUTCHours(0, 0, 0, 0);
        // align to Monday
        const dow = start.getUTCDay();
        const offset = dow === 0 ? -6 : 1 - dow;
        start.setUTCDate(start.getUTCDate() + offset);
        while (start.getTime() <= toMs) {
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 7);
            const key = start.toISOString().slice(0, 10);
            const label = `W ${start.getUTCDate()} ${shortMonth(start)}`;
            buckets.push({ key, label, startMs: start.getTime(), endMs: end.getTime() - 1 });
            start.setUTCDate(start.getUTCDate() + 7);
        }
    } else {
        const start = new Date(Date.UTC(new Date(fromMs).getUTCFullYear(), new Date(fromMs).getUTCMonth(), 1));
        while (start.getTime() <= toMs) {
            const end = new Date(start);
            end.setUTCMonth(end.getUTCMonth() + 1);
            const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
            const label = start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            buckets.push({ key, label, startMs: start.getTime(), endMs: end.getTime() - 1 });
            start.setUTCMonth(start.getUTCMonth() + 1);
        }
    }
    return buckets;
}

function shortMonth(d: Date) {
    return d.toLocaleDateString('en-US', { month: 'short' });
}

function formatRangeLabel(from: string, to: string) {
    const a = new Date(from + 'T00:00:00Z');
    const b = new Date(to + 'T00:00:00Z');
    const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
    const aLabel = a.toLocaleDateString('en-US', { month: 'short', year: sameYear ? undefined : 'numeric' });
    const bLabel = b.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return `${aLabel} – ${bLabel}`;
}

function computeDerivedSpend(campaigns: any[], from: string, to: string): number {
    if (!campaigns.length) return 0;
    const fromMs = new Date(from + 'T00:00:00Z').getTime();
    const toMs = new Date(to + 'T23:59:59.999Z').getTime();
    const periodMs = toMs - fromMs + 1;
    let total = 0;
    for (const c of campaigns) {
        if (!c.budget_total || Number(c.budget_total) <= 0) continue;
        const start = c.start_date ? new Date(c.start_date + 'T00:00:00Z').getTime() : null;
        const end = c.end_date ? new Date(c.end_date + 'T23:59:59.999Z').getTime() : null;
        // Skip campaigns that don't overlap the period at all
        if (end != null && end < fromMs) continue;
        if (start != null && start > toMs) continue;
        // Pro-rate by overlap fraction
        const overlapStart = Math.max(fromMs, start ?? fromMs);
        const overlapEnd = Math.min(toMs, end ?? toMs);
        const overlapMs = Math.max(0, overlapEnd - overlapStart + 1);
        if (periodMs <= 0) continue;
        total += Number(c.budget_total) * (overlapMs / periodMs);
    }
    return total;
}
