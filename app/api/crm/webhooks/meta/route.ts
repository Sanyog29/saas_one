import { createClient } from '@/frontend/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/crm/webhooks/meta - Handle Meta Lead Ads webhook
export async function POST(request: NextRequest) {
    const supabase = createClient();

    try {
        const body = await request.json();

        // Validate webhook payload
        const { leadgen_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, form_id, form_name, created_time, adplayerform } = body;

        if (!leadgen_id) {
            return NextResponse.json({ error: 'Missing leadgen_id' }, { status: 400 });
        }

        // Check for duplicate
        const { data: existing } = await supabase
            .from('crm_meta_leads')
            .select('id')
            .eq('meta_lead_id', leadgen_id)
            .single();

        if (existing) {
            // Mark as duplicate
            await supabase
                .from('crm_meta_leads')
                .update({ status: 'duplicate', processed_at: new Date().toISOString() })
                .eq('id', existing.id);

            return NextResponse.json({ success: true, status: 'duplicate' });
        }

        // Store the meta lead
        const { data: metaLead, error: insertError } = await supabase
            .from('crm_meta_leads')
            .insert({
                meta_lead_id: leadgen_id,
                payload: body,
                campaign_id,
                campaign_name,
                adset_id,
                adset_name,
                ad_id,
                ad_name,
                form_id,
                form_name,
                status: 'pending'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Meta lead insert error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        // Extract lead data from payload
        const fullName = body.full_name || body.fullname || body.name;
        const email = body.email;
        const phone = body.phone_number || body.phone || body.mobile_number;
        const city = body.city || body.location;

        // Get default status
        const { data: defaultStatus } = await supabase
            .from('crm_lead_statuses')
            .select('id')
            .eq('name', 'New Lead')
            .single();

        // Get Meta lead source
        const { data: metaSource } = await supabase
            .from('crm_lead_sources')
            .select('id')
            .eq('name', 'Meta Lead Ads')
            .single();

        // Create CRM lead
        const leadData: Record<string, any> = {
            created_by: body.created_by || (await getSystemUserId(supabase)),
            company_name: fullName || 'Meta Lead',
            contact_person: fullName,
            contact_number: phone,
            email: email,
            location: city,
            status: defaultStatus?.id,
            priority: 'Medium',
            lead_source: metaSource?.id,
            meta_lead_id: leadgen_id,
            meta_campaign_id: campaign_id,
            meta_adset_id: adset_id,
            meta_ad_id: ad_id,
            meta_form_name: form_name
        };

        const { data: newLead, error: leadError } = await supabase
            .from('crm_leads')
            .insert(leadData)
            .select('id, assigned_to')
            .single();

        if (leadError) {
            console.error('CRM lead creation error:', leadError);
            await supabase
                .from('crm_meta_leads')
                .update({ status: 'failed', error_message: leadError.message })
                .eq('id', metaLead.id);

            return NextResponse.json({ error: leadError.message }, { status: 500 });
        }

        // Update meta lead with processed lead ID
        await supabase
            .from('crm_meta_leads')
            .update({
                status: 'processed',
                processed_lead_id: newLead.id,
                processed_at: new Date().toISOString()
            })
            .eq('id', metaLead.id);

        // Log activity
        await supabase
            .from('crm_activity_log')
            .insert({
                lead_id: newLead.id,
                user_id: leadData.created_by,
                activity_type: 'created',
                description: 'Lead created from Meta Lead Ads',
                metadata: { meta_lead_id: leadgen_id, form_name }
            });

        // TODO: Send notification to assigned user if applicable

        return NextResponse.json({
            success: true,
            lead_id: newLead.id,
            meta_lead_id: metaLead.id
        });
    } catch (error) {
        console.error('Meta webhook error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET /api/crm/webhooks/meta - Verify webhook endpoint
export async function GET() {
    return NextResponse.json({ status: 'ok', service: 'meta_lead_ads_webhook' });
}

// Helper to get system user ID (you may want to create a dedicated system user)
async function getSystemUserId(supabase: any): Promise<string> {
    // This should be configured based on your setup
    // For now, return empty and let the RLS handle it
    return '';
}