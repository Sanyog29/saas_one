import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { resolveDistributionAssignee } from '@/backend/lib/crm/distribution';

/**
 * Meta Lead Ads webhook.
 *
 * Setup (per organization, configured under CRM → Settings → Integrations):
 *   1. Create a Meta App + a WhatsApp/Facebook Page, subscribe the Page to the
 *      `leadgen` webhook field.
 *   2. Callback URL:  https://<your-domain>/api/crm/webhooks/meta
 *   3. Verify Token:  the value saved in crm_meta_config.verify_token
 *   4. App Secret:    saved in crm_meta_config.app_secret  (validates payloads)
 *   5. Page Access Token: saved in crm_meta_config.page_access_token
 *      (used to fetch the submitted field data via the Graph API)
 *
 * GET  -> subscription verification handshake (echoes hub.challenge)
 * POST -> receives leadgen notifications, fetches field data, creates a lead
 */

const GRAPH_VERSION = 'v19.0';

// --- GET: Meta subscription verification --------------------------------
export async function GET(request: NextRequest) {
    const sp = new URL(request.url).searchParams;
    const mode = sp.get('hub.mode');
    const token = sp.get('hub.verify_token');
    const challenge = sp.get('hub.challenge');

    if (mode !== 'subscribe' || !token) {
        return NextResponse.json({ status: 'ok', service: 'meta_lead_ads_webhook' });
    }

    // Match the verify token against any org's active config.
    const { data: cfg } = await supabaseAdmin
        .from('crm_meta_config')
        .select('id')
        .eq('verify_token', token)
        .eq('is_active', true)
        .maybeSingle();

    if (!cfg) return new NextResponse('Forbidden', { status: 403 });
    // Meta expects the raw challenge string echoed back.
    return new NextResponse(challenge ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

// --- POST: leadgen notifications ----------------------------------------
export async function POST(request: NextRequest) {
    // Read the RAW body first — signature is computed over the exact bytes.
    const rawBody = await request.text();
    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
    if (entries.length === 0) {
        return NextResponse.json({ error: 'No entries' }, { status: 400 });
    }

    // Determine the page (and therefore the org config) from the payload.
    const pageId =
        entries[0]?.id ||
        entries[0]?.changes?.[0]?.value?.page_id ||
        null;
    if (!pageId) return NextResponse.json({ error: 'Missing page id' }, { status: 400 });

    const { data: config } = await supabaseAdmin
        .from('crm_meta_config')
        .select('*')
        .eq('page_id', pageId)
        .eq('is_active', true)
        .maybeSingle();

    if (!config) {
        // Unknown / unconfigured page — ack 200 so Meta doesn't retry forever,
        // but do nothing.
        console.warn('[Meta webhook] No active config for page', pageId);
        return NextResponse.json({ status: 'ignored', reason: 'unconfigured_page' });
    }

    // Verify X-Hub-Signature-256 against this org's app secret.
    const signature = request.headers.get('x-hub-signature-256') || '';
    if (!config.app_secret || !verifySignature(rawBody, signature, config.app_secret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const results: any[] = [];
    for (const entry of entries) {
        for (const change of entry.changes || []) {
            if (change.field && change.field !== 'leadgen') continue;
            const v = change.value || {};
            const leadgenId = v.leadgen_id;
            if (!leadgenId) continue;
            results.push(await processLeadgen(leadgenId, v, config));
        }
    }

    return NextResponse.json({ status: 'ok', processed: results });
}

function verifySignature(rawBody: string, header: string, appSecret: string): boolean {
    if (!header.startsWith('sha256=')) return false;
    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = header.slice('sha256='.length);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(received, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Resolve a user id to own webhook-created rows: configured assignee, else an org admin. */
async function resolveSystemUser(config: any): Promise<string | null> {
    if (config.default_assignee) return config.default_assignee;
    const [pm, om] = await Promise.all([
        supabaseAdmin.from('property_memberships').select('user_id').eq('organization_id', config.organization_id).in('role', ['bd_admin', 'org_super_admin', 'org_admin']).eq('is_active', true).limit(1),
        supabaseAdmin.from('organization_memberships').select('user_id').eq('organization_id', config.organization_id).in('role', ['bd_admin', 'org_super_admin', 'org_admin']).eq('is_active', true).limit(1),
    ]);
    return pm.data?.[0]?.user_id || om.data?.[0]?.user_id || null;
}

async function processLeadgen(leadgenId: string, value: any, config: any) {
    // Idempotency: skip if we've already recorded this leadgen id.
    const { data: existing } = await supabaseAdmin
        .from('crm_meta_leads').select('id, status').eq('meta_lead_id', leadgenId).maybeSingle();
    if (existing) {
        await supabaseAdmin.from('crm_meta_leads')
            .update({ status: 'duplicate', processed_at: new Date().toISOString() })
            .eq('id', existing.id);
        return { leadgen_id: leadgenId, status: 'duplicate' };
    }

    // Record the raw notification first.
    const { data: metaRow } = await supabaseAdmin
        .from('crm_meta_leads')
        .insert({
            organization_id: config.organization_id,
            meta_lead_id: leadgenId,
            payload: value,
            campaign_id: value.campaign_id ?? null,
            adset_id: value.adgroup_id ?? value.adset_id ?? null,
            ad_id: value.ad_id ?? null,
            form_id: value.form_id ?? null,
            status: 'pending',
        })
        .select('id')
        .single();

    try {
        // Fetch the submitted field data from the Graph API.
        const fields = await fetchLeadFields(leadgenId, config.page_access_token);
        const get = (...names: string[]) => {
            for (const n of names) {
                const f = fields.find((x) => x.name?.toLowerCase() === n);
                if (f?.values?.[0]) return f.values[0];
            }
            return null;
        };
        const fullName = get('full_name', 'name', 'full name') || get('first_name');
        const email = get('email');
        const phone = get('phone_number', 'phone', 'mobile_number');
        const city = get('city', 'location');

        const createdBy = await resolveSystemUser(config);
        if (!createdBy) throw new Error('No assignee/admin available to own the lead');

        // Resolve campaign from the Meta form name or ad metadata, then
        // check distribution rules for round-robin / exclusive assignment.
        const campaignName = value.campaign_name || value.form_name || null;
        const distributionAssignee = await resolveDistributionAssignee(
            config.organization_id,
            campaignName
        );

        // Default status + lead source.
        const { data: def } = await supabaseAdmin
            .from('crm_lead_statuses').select('id').eq('is_default', true)
            .or(`organization_id.eq.${config.organization_id},organization_id.is.null`)
            .order('organization_id', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        let sourceId = config.default_lead_source;
        if (!sourceId) {
            const { data: metaSrc } = await supabaseAdmin
                .from('crm_lead_sources').select('id').ilike('name', 'Meta Lead Ads')
                .or(`organization_id.eq.${config.organization_id},organization_id.is.null`).limit(1).maybeSingle();
            sourceId = metaSrc?.id ?? null;
        }

        const { data: lead, error: leadErr } = await supabaseAdmin
            .from('crm_leads')
            .insert({
                organization_id: config.organization_id,
                created_by: createdBy,
                assigned_to: distributionAssignee ?? config.default_assignee ?? createdBy,
                company_name: fullName || 'Meta Lead',
                contact_person: fullName,
                contact_number: phone,
                email,
                location: city,
                city,
                status: def?.id,
                priority: 'Medium',
                lead_source: sourceId,
                property_interest: config.default_property ?? null,
                campaign: campaignName,
                meta_lead_id: leadgenId,
                meta_campaign_id: value.campaign_id ?? null,
                meta_adset_id: value.adgroup_id ?? value.adset_id ?? null,
                meta_ad_id: value.ad_id ?? null,
                meta_form_name: value.form_id ?? null,
            })
            .select('id')
            .single();
        if (leadErr) throw leadErr;

        await supabaseAdmin.from('crm_meta_leads')
            .update({ status: 'processed', processed_lead_id: lead.id, processed_at: new Date().toISOString() })
            .eq('id', metaRow!.id);

        return { leadgen_id: leadgenId, status: 'processed', lead_id: lead.id };
    } catch (err: any) {
        console.error('[Meta webhook] processing error:', err);
        await supabaseAdmin.from('crm_meta_leads')
            .update({ status: 'failed', error_message: err?.message || 'unknown', processed_at: new Date().toISOString() })
            .eq('id', metaRow!.id);
        return { leadgen_id: leadgenId, status: 'failed', error: err?.message };
    }
}

async function fetchLeadFields(leadgenId: string, pageAccessToken: string | null): Promise<Array<{ name: string; values: string[] }>> {
    if (!pageAccessToken) throw new Error('page_access_token not configured');
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?fields=field_data,created_time&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `Graph API error (${res.status})`);
    return json.field_data || [];
}
