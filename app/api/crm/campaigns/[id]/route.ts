import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { resolveCrmAccess, isCrmAccessError } from '@/backend/lib/crm/access';

async function loadCampaign(id: string) {
    const { data } = await supabaseAdmin.from('crm_campaigns').select('*').eq('id', id).maybeSingle();
    return data;
}

// GET /api/crm/campaigns/[id] - campaign + recipient breakdown
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const campaign = await loadCampaign(id);
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const access = await resolveCrmAccess(request, campaign.organization_id);
    if (isCrmAccessError(access)) return access;

    const { data: recipients } = await supabaseAdmin
        .from('crm_campaign_recipients')
        .select('id, lead_id, phone, step_index, status, scheduled_at, sent_at, error, lead_info:crm_leads(company_name, contact_person)')
        .eq('campaign_id', id)
        .order('scheduled_at', { ascending: true })
        .limit(1000);

    return NextResponse.json({ campaign, recipients: recipients || [] });
}

// PATCH /api/crm/campaigns/[id] - cancel a campaign (admin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const campaign = await loadCampaign(id);
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const access = await resolveCrmAccess(request, campaign.organization_id);
    if (isCrmAccessError(access)) return access;
    if (!access.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (body.action === 'cancel') {
        await supabaseAdmin.from('crm_campaigns').update({ status: 'cancelled' }).eq('id', id);
        // Cancel anything not yet sent.
        await supabaseAdmin.from('crm_campaign_recipients')
            .update({ status: 'skipped' }).eq('campaign_id', id).eq('status', 'pending');
        return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
