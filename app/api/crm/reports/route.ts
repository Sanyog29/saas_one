import { createClient } from '@/frontend/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/crm/reports - Generate reports
export async function GET(request: NextRequest) {
    const supabase = createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'monthly';
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');
    const userId = searchParams.get('user_id');
    const propertyId = searchParams.get('property_id');

    // Check if user is admin
    const { data: membership } = await supabase
        .from('property_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

    const isAdmin = ['bd_admin', 'org_super_admin'].includes(membership?.role);

    // Build base query
    let query = supabase
        .from('crm_leads')
        .select(`
            *,
            status_info:crm_lead_statuses(id, name, color),
            source_info:crm_lead_sources(id, name),
            assigned_user:users!crm_leads_assigned_to_fkey(id, full_name),
            property_info:properties(id, name)
        `);

    if (dateFrom) {
        query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
        query = query.lte('created_at', dateTo);
    }
    if (userId) {
        query = query.eq('assigned_to', userId);
    }
    if (propertyId) {
        query = query.eq('property_interest', propertyId);
    }

    const { data: leads, error } = await query;

    if (error) {
        console.error('CRM Reports error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Process based on report type
    const reports: Record<string, any> = {};

    // Monthly/Quarterly Funnel
    if (type === 'monthly' || type === 'quarterly') {
        const funnel = {};
        leads?.forEach(lead => {
            const status = lead.status_info?.name || 'Unknown';
            if (!funnel[status]) {
                funnel[status] = { count: 0, value: 0 };
            }
            funnel[status].count++;
            funnel[status].value += lead.deal_value || 0;
        });
        reports.funnel = funnel;

        // Monthly trend
        const monthlyData: Record<string, { leads: number; value: number }> = {};
        leads?.forEach(lead => {
            const month = new Date(lead.created_at).toLocaleString('en-US', { month: 'short', year: 'numeric' });
            if (!monthlyData[month]) {
                monthlyData[month] = { leads: 0, value: 0 };
            }
            monthlyData[month].leads++;
            monthlyData[month].value += lead.deal_value || 0;
        });
        reports.monthly_trend = Object.entries(monthlyData)
            .map(([month, data]) => ({ month, ...data }))
            .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
    }

    // User Performance
    if (type === 'user' || !type) {
        const userData: Record<string, any> = {};
        leads?.forEach(lead => {
            const userName = lead.assigned_user?.full_name || 'Unassigned';
            if (!userData[userName]) {
                userData[userName] = {
                    name: userName,
                    total_leads: 0,
                    won_leads: 0,
                    lost_leads: 0,
                    pipeline_value: 0,
                    revenue_closed: 0
                };
            }
            userData[userName].total_leads++;
            userData[userName].pipeline_value += lead.deal_value || 0;
            if (lead.status_info?.name === 'Won') {
                userData[userName].won_leads++;
                userData[userName].revenue_closed += lead.deal_value || 0;
            } else if (lead.status_info?.name === 'Lost') {
                userData[userName].lost_leads++;
            }
        });
        reports.user_performance = Object.values(userData);
    }

    // Property Performance
    if (type === 'property') {
        const propertyData: Record<string, any> = {};
        leads?.forEach(lead => {
            const propName = lead.property_info?.name || 'Unassigned';
            if (!propertyData[propName]) {
                propertyData[propName] = {
                    name: propName,
                    total_leads: 0,
                    won_leads: 0,
                    pipeline_value: 0,
                    revenue_closed: 0
                };
            }
            propertyData[propName].total_leads++;
            propertyData[propName].pipeline_value += lead.deal_value || 0;
            if (lead.status_info?.name === 'Won') {
                propertyData[propName].won_leads++;
                propertyData[propName].revenue_closed += lead.deal_value || 0;
            }
        });
        reports.property_performance = Object.values(propertyData);
    }

    // Lead Source Analytics
    if (type === 'source') {
        const sourceData: Record<string, any> = {};
        leads?.forEach(lead => {
            const sourceName = lead.source_info?.name || 'Unknown';
            if (!sourceData[sourceName]) {
                sourceData[sourceName] = {
                    name: sourceName,
                    count: 0,
                    value: 0,
                    conversions: 0
                };
            }
            sourceData[sourceName].count++;
            sourceData[sourceName].value += lead.deal_value || 0;
            if (lead.status_info?.name === 'Won') {
                sourceData[sourceName].conversions++;
            }
        });
        reports.source_analytics = Object.values(sourceData);
    }

    // Status Distribution
    if (type === 'status') {
        const statusData: Record<string, any> = {};
        leads?.forEach(lead => {
            const statusName = lead.status_info?.name || 'Unknown';
            const statusColor = lead.status_info?.color || '#6B7280';
            if (!statusData[statusName]) {
                statusData[statusName] = {
                    name: statusName,
                    color: statusColor,
                    count: 0,
                    value: 0
                };
            }
            statusData[statusName].count++;
            statusData[statusName].value += lead.deal_value || 0;
        });
        reports.status_distribution = Object.values(statusData);
    }

    // Revenue Report
    if (type === 'revenue') {
        const wonLeads = leads?.filter(l => l.status_info?.name === 'Won') || [];
        reports.total_revenue = wonLeads.reduce((sum, l) => sum + (l.deal_value || 0), 0);
        reports.deals_won = wonLeads.length;
        reports.average_deal_size = wonLeads.length > 0
            ? reports.total_revenue / wonLeads.length
            : 0;
    }

    return NextResponse.json({
        type,
        generated_at: new Date().toISOString(),
        total_leads: leads?.length || 0,
        total_value: leads?.reduce((sum, l) => sum + (l.deal_value || 0), 0) || 0,
        ...reports
    });
}