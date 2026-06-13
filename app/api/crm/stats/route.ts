import { createClient } from '@/frontend/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/crm/stats - Get dashboard stats
export async function GET(request: NextRequest) {
    const supabase = createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'rep'; // 'rep' or 'admin'
    const propertyId = searchParams.get('property_id');
    const userId = searchParams.get('user_id');

    // Check if user is admin
    const { data: membership } = await supabase
        .from('property_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

    const isAdmin = ['bd_admin', 'org_super_admin'].includes(membership?.role);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = new Date().toISOString().split('T')[0];

    if (type === 'rep' || !isAdmin) {
        // BD Representative Dashboard Stats
        const targetUserId = userId || user.id;

        // Get lead counts
        const { count: assignedLeads } = await supabase
            .from('crm_leads')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', targetUserId)
            .eq('is_archived', false);

        // Get open followups
        const { count: openFollowups } = await supabase
            .from('crm_leads')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', targetUserId)
            .eq('is_archived', false)
            .not('next_followup_date', 'is', null)
            .lte('next_followup_date', now.toISOString());

        // Get today's meetings
        const { count: meetingsToday } = await supabase
            .from('crm_events')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', targetUserId)
            .eq('event_type', 'meeting')
            .eq('status', 'scheduled')
            .gte('start_datetime', `${today}T00:00:00`)
            .lte('start_datetime', `${today}T23:59:59`);

        // Get proposals pending (Proposal Shared status)
        const { data: proposalStatus } = await supabase
            .from('crm_lead_statuses')
            .select('id')
            .eq('name', 'Proposal Shared')
            .single();

        const { count: proposalsPending } = await supabase
            .from('crm_leads')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', targetUserId)
            .eq('status', proposalStatus?.id)
            .eq('is_archived', false);

        // Get won this month
        const wonStatus = await supabase
            .from('crm_lead_statuses')
            .select('id')
            .eq('name', 'Won')
            .single();

        const { data: wonData } = await supabase
            .from('crm_leads')
            .select('deal_value')
            .eq('assigned_to', targetUserId)
            .eq('status', wonStatus?.id)
            .eq('is_archived', false)
            .gte('updated_at', startOfMonth);

        const wonThisMonth = wonData?.length || 0;
        const revenueClosed = wonData?.reduce((sum, l) => sum + (l.deal_value || 0), 0) || 0;

        // Pipeline value
        const { data: pipelineData } = await supabase
            .from('crm_leads')
            .select('deal_value')
            .eq('assigned_to', targetUserId)
            .eq('is_archived', false)
            .not('status', 'in', `(${wonStatus?.id || ''})`);

        const pipelineValue = pipelineData?.reduce((sum, l) => sum + (l.deal_value || 0), 0) || 0;

        // Target achievement
        const { data: target } = await supabase
            .from('crm_targets')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('month', now.getMonth() + 1)
            .eq('year', now.getFullYear())
            .single();

        const targetAchievement = target?.target_value
            ? Math.round((revenueClosed / Number(target.target_value)) * 100)
            : 0;

        return NextResponse.json({
            assigned_leads: assignedLeads || 0,
            open_followups: openFollowups || 0,
            meetings_today: meetingsToday || 0,
            proposals_pending: proposalsPending || 0,
            won_this_month: wonThisMonth,
            pipeline_value: pipelineValue,
            target_achievement_percent: targetAchievement,
            revenue_closed: revenueClosed
        });
    } else {
        // Admin Dashboard Stats
        // Get all leads by property
        let leadQuery = supabase
            .from('crm_leads')
            .select('*, property_info:properties(id, name), status_info:crm_lead_statuses(name)');

        if (propertyId) {
            leadQuery = leadQuery.eq('property_interest', propertyId);
        }

        const { data: allLeads } = await leadQuery;

        // Property-wise leads
        const propertyWise: Record<string, { count: number; value: number }> = {};
        const sourceWise: Record<string, number> = {};

        allLeads?.forEach(lead => {
            const propName = lead.property_info?.name || 'Unassigned';
            if (!propertyWise[propName]) {
                propertyWise[propName] = { count: 0, value: 0 };
            }
            propertyWise[propName].count++;
            propertyWise[propName].value += lead.deal_value || 0;

            if (lead.source_info?.name) {
                sourceWise[lead.source_info.name] = (sourceWise[lead.source_info.name] || 0) + 1;
            }
        });

        // User performance
        const { data: users } = await supabase
            .from('users')
            .select('id, full_name');

        const userPerformance = await Promise.all(
            (users || []).map(async (u) => {
                const { data: userLeads } = await supabase
                    .from('crm_leads')
                    .select('*, status_info:crm_lead_statuses(name)')
                    .eq('assigned_to', u.id);

                const meetings = await supabase
                    .from('crm_events')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', u.id)
                    .eq('event_type', 'meeting')
                    .eq('status', 'completed')
                    .gte('start_datetime', startOfMonth);

                const wonStatus = await supabase
                    .from('crm_lead_statuses')
                    .select('id')
                    .eq('name', 'Won')
                    .single();

                const won = userLeads?.filter(l => l.status === wonStatus?.id).length || 0;

                return {
                    user_id: u.id,
                    user_name: u.full_name,
                    leads: userLeads?.length || 0,
                    meetings: meetings.count || 0,
                    closures: won,
                    value: userLeads?.reduce((sum, l) => sum + (l.deal_value || 0), 0) || 0
                };
            })
        );

        return NextResponse.json({
            total_leads: allLeads?.length || 0,
            open_leads: allLeads?.filter(l => !['Won', 'Lost', 'Dropped'].includes(l.status_info?.name)).length || 0,
            pipeline_value: allLeads?.reduce((sum, l) => sum + (l.deal_value || 0), 0) || 0,
            property_wise_leads: Object.entries(propertyWise).map(([name, data]) => ({
                property_name: name,
                count: data.count,
                value: data.value
            })),
            lead_source_analytics: Object.entries(sourceWise).map(([name, count]) => ({
                source_name: name,
                count
            })),
            user_performance: userPerformance
        });
    }
}