import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { resolveCrmAccess, isCrmAccessError, readOrgId } from '@/backend/lib/crm/access';
import { resolveDistributionAssignee } from '@/backend/lib/crm/distribution';

const GRAPH_VERSION = 'v19.0';

function cleanPhone(raw: string | null): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    return digits.replace(/^91/, '') || null;
}

async function graphGet(path: string, token: string) {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}&access_token=${encodeURIComponent(token)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `Graph error on ${path}`);
    return json;
}

async function fetchAllPages(path: string, token: string): Promise<any[]> {
    const results: any[] = [];
    let url: string | null = `https://graph.facebook.com/${GRAPH_VERSION}/${path}&access_token=${encodeURIComponent(token)}`;
    while (url) {
        const res: Response = await fetch(url);
        const json: any = await res.json();
        if (!res.ok) break;
        results.push(...(json.data || []));
        url = json.paging?.next || null;
        // Safety cap — avoid infinite loops on huge datasets
        if (results.length > 2000) break;
    }
    return results;
}

export async function POST(request: NextRequest) {
    const access = await resolveCrmAccess(request, readOrgId(request));
    if (isCrmAccessError(access)) return access;
    if (!access.isAdmin && !access.isMasterAdmin) {
        return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const formIdFilter: string | null = body.form_id || null;

    // Get org's Meta config
    const { data: config } = await supabaseAdmin
        .from('crm_meta_config')
        .select('*')
        .eq('organization_id', access.organizationId)
        .eq('is_active', true)
        .maybeSingle();

    if (!config?.page_access_token) {
        return NextResponse.json({ error: 'No active Meta config or page access token' }, { status: 400 });
    }

    const token = config.page_access_token;
    const pageId = config.page_id;

    // Fetch all lead forms for this page
    const formsData = await graphGet(`${pageId}/leadgen_forms?fields=id,name,status&limit=100`, token).catch(e => ({ data: [] }));
    const forms: Array<{ id: string; name: string }> = (formsData.data || []).filter((f: any) => !formIdFilter || f.id === formIdFilter);

    if (forms.length === 0) {
        return NextResponse.json({ error: 'No forms found', forms: formsData });
    }

    // Resolve a system user for created_by
    const { data: adminUser } = await supabaseAdmin
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', access.organizationId)
        .in('role', ['bd_admin', 'org_super_admin', 'org_admin'])
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
    const createdBy = config.default_assignee || adminUser?.user_id;
    if (!createdBy) return NextResponse.json({ error: 'No admin user found to own leads' }, { status: 400 });

    // Get default status
    const { data: defStatus } = await supabaseAdmin
        .from('crm_lead_statuses').select('id').eq('is_default', true)
        .or(`organization_id.eq.${access.organizationId},organization_id.is.null`)
        .order('organization_id', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();

    // Get Meta Lead Ads source id
    const { data: metaSrc } = await supabaseAdmin
        .from('crm_lead_sources').select('id').ilike('name', '%Meta%')
        .or(`organization_id.eq.${access.organizationId},organization_id.is.null`).limit(1).maybeSingle();

    const summary: Record<string, { inserted: number; skipped: number; failed: number }> = {};
    let totalInserted = 0;
    let totalSkipped = 0;

    for (const form of forms) {
        summary[form.name] = { inserted: 0, skipped: 0, failed: 0 };
        let formLeads: any[] = [];
        try {
            formLeads = await fetchAllPages(`${form.id}/leads?fields=id,created_time,field_data&limit=100`, token);
        } catch (e: any) {
            summary[form.name].failed++;
            continue;
        }

        for (const lead of formLeads) {
            const leadgenId = lead.id;
            // Check if already in crm_meta_leads (already processed)
            const { data: existingMeta } = await supabaseAdmin
                .from('crm_meta_leads').select('id, status').eq('meta_lead_id', leadgenId).maybeSingle();
            if (existingMeta?.status === 'processed') {
                summary[form.name].skipped++;
                totalSkipped++;
                continue;
            }

            // Parse field_data. Meta field names look like `what_is_your_seat_requirement?`
            // and values like `1_-_50`; normalize to alphanumerics for matching.
            const fields: Array<{ name: string; values: string[] }> = lead.field_data || [];
            const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const get = (...names: string[]) => {
                for (const n of names) {
                    const f = fields.find((x) => norm(x.name).includes(norm(n)));
                    if (f?.values?.[0]) return f.values[0];
                }
                return null;
            };
            const fullName = get('full_name', 'full name', 'name') || [get('first_name'), get('last_name')].filter(Boolean).join(' ') || null;
            const email = get('email', 'work email', 'work_email');
            const phone = get('phone_number', 'phone', 'mobile_number', 'mobile');
            const city = get('city', 'preferred location', 'location');
            const seatsRaw = get('seat requirement', 'seat_requirement', 'number of seats', 'seats');
            // Seat values are ranges ("1 - 50", "50 - 100"); use the upper bound as the
            // representative count for bucketing.
            const seatNums = (seatsRaw || '').match(/\d+/g)?.map((n) => parseInt(n)) || [];
            const seats = seatNums.length ? Math.max(...seatNums) : null;
            const moveIn = get('move in timeline', 'move_in_timeline', 'when do you want to move in', 'move in');
            const companyName = get('company name', 'company_name', 'organization');
            const jobTitle = get('job title', 'job_title', 'designation');

            // Build requirement string from Meta form responses (seats now stored
            // in its own column).
            const requirementParts = [
                seatsRaw ? `Seats: ${seatsRaw.replace(/_/g, ' ')}` : null,
                companyName ? `Company: ${companyName}` : null,
                jobTitle ? `Title: ${jobTitle}` : null,
            ].filter(Boolean);
            const requirement = requirementParts.length ? requirementParts.join(' | ') : null;

            const cleanedPhone = cleanPhone(phone);

            // Dedup check against existing crm_leads
            if (cleanedPhone || email) {
                const conditions: string[] = [];
                if (cleanedPhone) conditions.push(`contact_number.ilike.%${cleanedPhone}%`);
                if (email) conditions.push(`email.ilike.${email}`);
                const { data: existing } = await supabaseAdmin
                    .from('crm_leads').select('id').eq('organization_id', access.organizationId)
                    .or(conditions.join(',')).limit(1).maybeSingle();
                if (existing) {
                    // Mark as duplicate in meta_leads table
                    if (!existingMeta) {
                        await supabaseAdmin.from('crm_meta_leads').insert({
                            organization_id: access.organizationId,
                            meta_lead_id: leadgenId,
                            form_id: form.id,
                            payload: lead,
                            status: 'duplicate_contact',
                            processed_lead_id: existing.id,
                            processed_at: new Date().toISOString(),
                        });
                    }
                    summary[form.name].skipped++;
                    totalSkipped++;
                    continue;
                }
            }

            const distributionAssignee = await resolveDistributionAssignee(access.organizationId, form.name).catch(() => null);
            const assignedTo = distributionAssignee ?? config.default_assignee ?? createdBy;

            try {
                const { data: newLead } = await supabaseAdmin.from('crm_leads').insert({
                    organization_id: access.organizationId,
                    created_by: createdBy,
                    assigned_to: assignedTo,
                    company_name: companyName || fullName || 'Meta Lead',
                    contact_person: fullName,
                    contact_number: cleanedPhone || phone,
                    email,
                    city,
                    location: city,
                    seats,
                    move_in_timeline: moveIn ? moveIn.replace(/_/g, ' ') : null,
                    requirement,
                    status: defStatus?.id,
                    priority: 'Medium',
                    lead_source: metaSrc?.id ?? config.default_lead_source ?? null,
                    campaign: form.name,
                    meta_form_name: form.name,
                    meta_lead_id: leadgenId,
                }).select('id').single();

                // Log in crm_meta_leads
                await supabaseAdmin.from('crm_meta_leads').upsert({
                    organization_id: access.organizationId,
                    meta_lead_id: leadgenId,
                    form_id: form.id,
                    payload: lead,
                    status: 'processed',
                    processed_lead_id: newLead?.id,
                    processed_at: new Date().toISOString(),
                }, { onConflict: 'meta_lead_id' });

                summary[form.name].inserted++;
                totalInserted++;
            } catch (e: any) {
                summary[form.name].failed++;
            }
        }
    }

    return NextResponse.json({
        status: 'ok',
        total_inserted: totalInserted,
        total_skipped: totalSkipped,
        forms_processed: forms.length,
        summary,
    });
}
