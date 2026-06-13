import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { resolveCrmAccess, isCrmAccessError, readOrgId } from '@/backend/lib/crm/access';

// GET /api/crm/stats?type=rep|admin
export async function GET(request: NextRequest) {
    const access = await resolveCrmAccess(request, readOrgId(request));
    if (isCrmAccessError(access)) return access;

    const { searchParams } = new URL(request.url);
    const requestedType = searchParams.get('type') || 'rep';
    const propertyId = searchParams.get('property_id');
    const userId = searchParams.get('user_id');
    const org = access.organizationId;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = now.toISOString().split('T')[0];

    // Load this org's status semantics ONCE (org rows + global defaults).
    const { data: statuses } = await supabaseAdmin
        .from('crm_lead_statuses')
        .select('id, name, is_won, is_terminal')
        .or(`organization_id.eq.${org},organization_id.is.null`);
    const wonIds = new Set((statuses || []).filter((s) => s.is_won).map((s) => s.id));
    const terminalIds = new Set((statuses || []).filter((s) => s.is_terminal).map((s) => s.id));
    const proposalId = (statuses || []).find((s) => /proposal/i.test(s.name))?.id;

    // ---- Rep dashboard ---------------------------------------------------
    if (requestedType === 'rep' || !access.isAdmin) {
        const targetUserId = access.isAdmin && userId ? userId : access.user.id;

        const { data: leads } = await supabaseAdmin
            .from('crm_leads')
            .select('id, status, deal_value, next_followup_date, closed_at, is_archived')
            .eq('organization_id', org)
            .eq('assigned_to', targetUserId)
            .eq('is_archived', false);

        const all = leads || [];
        const assignedLeads = all.length;
        const openFollowups = all.filter(
            (l) => l.next_followup_date && new Date(l.next_followup_date) <= now && !terminalIds.has(l.status)
        ).length;
        const proposalsPending = proposalId ? all.filter((l) => l.status === proposalId).length : 0;
        const wonThisMonth = all.filter((l) => wonIds.has(l.status) && l.closed_at && l.closed_at >= startOfMonth);
        const revenueClosed = wonThisMonth.reduce((s, l) => s + Number(l.deal_value || 0), 0);
        const pipelineValue = all
            .filter((l) => !terminalIds.has(l.status))
            .reduce((s, l) => s + Number(l.deal_value || 0), 0);

        const { count: meetingsToday } = await supabaseAdmin
            .from('crm_events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', org)
            .eq('user_id', targetUserId)
            .eq('event_type', 'meeting')
            .eq('status', 'scheduled')
            .gte('start_datetime', `${today}T00:00:00`)
            .lte('start_datetime', `${today}T23:59:59`);

        const { data: target } = await supabaseAdmin
            .from('crm_targets')
            .select('target_value')
            .eq('user_id', targetUserId)
            .eq('month', now.getMonth() + 1)
            .eq('year', now.getFullYear())
            .maybeSingle();
        const targetAchievement = target?.target_value
            ? Math.round((revenueClosed / Number(target.target_value)) * 100)
            : 0;

        return NextResponse.json({
            assigned_leads: assignedLeads,
            open_followups: openFollowups,
            meetings_today: meetingsToday || 0,
            proposals_pending: proposalsPending,
            won_this_month: wonThisMonth.length,
            pipeline_value: pipelineValue,
            target_achievement_percent: targetAchievement,
            revenue_closed: revenueClosed,
        });
    }

    // ---- Admin dashboard (single pass, no N+1) ---------------------------
    let leadQ = supabaseAdmin
        .from('crm_leads')
        .select('id, status, deal_value, assigned_to, property_interest, city, closed_at, property_info:properties(id, name), source_info:crm_lead_sources(id, name)')
        .eq('organization_id', org)
        .eq('is_archived', false);
    if (propertyId) leadQ = leadQ.eq('property_interest', propertyId);
    const { data: allLeads } = await leadQ;
    const leads = allLeads || [];

    const propertyWise: Record<string, { count: number; value: number }> = {};
    const sourceWise: Record<string, number> = {};
    const cityWise: Record<string, { count: number; value: number }> = {};
    const perUser: Record<string, { leads: number; closures: number; value: number }> = {};

    for (const l of leads as any[]) {
        const propName = l.property_info?.name || 'Unassigned';
        (propertyWise[propName] ??= { count: 0, value: 0 });
        propertyWise[propName].count++;
        propertyWise[propName].value += Number(l.deal_value || 0);

        if (l.source_info?.name) sourceWise[l.source_info.name] = (sourceWise[l.source_info.name] || 0) + 1;

        const city = l.city || 'Unspecified';
        (cityWise[city] ??= { count: 0, value: 0 });
        cityWise[city].count++;
        cityWise[city].value += Number(l.deal_value || 0);

        if (l.assigned_to) {
            (perUser[l.assigned_to] ??= { leads: 0, closures: 0, value: 0 });
            perUser[l.assigned_to].leads++;
            perUser[l.assigned_to].value += Number(l.deal_value || 0);
            if (wonIds.has(l.status)) perUser[l.assigned_to].closures++;
        }
    }

    // One query for completed meetings this month, counted per user in JS.
    const { data: meetings } = await supabaseAdmin
        .from('crm_events')
        .select('user_id')
        .eq('organization_id', org)
        .eq('event_type', 'meeting')
        .eq('status', 'completed')
        .gte('start_datetime', startOfMonth);
    const meetingsByUser: Record<string, number> = {};
    for (const m of meetings || []) meetingsByUser[(m as any).user_id] = (meetingsByUser[(m as any).user_id] || 0) + 1;

    // Resolve user names in one query.
    const userIds = Object.keys(perUser);
    const { data: users } = userIds.length
        ? await supabaseAdmin.from('users').select('id, full_name').in('id', userIds)
        : { data: [] as any[] };
    const nameById = new Map((users || []).map((u: any) => [u.id, u.full_name]));

    return NextResponse.json({
        total_leads: leads.length,
        open_leads: leads.filter((l: any) => !terminalIds.has(l.status)).length,
        pipeline_value: leads.filter((l: any) => !terminalIds.has(l.status)).reduce((s, l: any) => s + Number(l.deal_value || 0), 0),
        revenue_closed: leads.filter((l: any) => wonIds.has(l.status)).reduce((s, l: any) => s + Number(l.deal_value || 0), 0),
        property_wise_leads: Object.entries(propertyWise).map(([name, v]) => ({ property_name: name, count: v.count, value: v.value })),
        lead_source_analytics: Object.entries(sourceWise).map(([name, count]) => ({ source_name: name, count })),
        territory_performance: Object.entries(cityWise).map(([city, v]) => ({ city, leads: v.count, value: v.value })),
        user_performance: Object.entries(perUser).map(([uid, v]) => ({
            user_id: uid,
            user_name: nameById.get(uid) || 'Unknown',
            leads: v.leads,
            meetings: meetingsByUser[uid] || 0,
            closures: v.closures,
            value: v.value,
        })),
    });
}
