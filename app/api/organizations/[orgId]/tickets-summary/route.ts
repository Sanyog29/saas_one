import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/organizations/[orgId]/tickets-summary
 * Organization-wide ticketing summary for Super Admin / Master Admin
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    try {
        const { orgId } = await params;
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const period = searchParams.get('period') || 'today'; // 'today' | 'week' | 'month'

        // Fetch all properties in the org
        const { data: properties, error: propError } = await supabase
            .from('properties')
            .select('id, name, code')
            .eq('organization_id', orgId);

        if (propError) {
            return NextResponse.json({ error: propError.message }, { status: 500 });
        }

        const propertyIds = properties?.map((p) => p.id) || [];

        // Fetch which properties have ticket_validation enabled
        const { data: validationFeatures } = await supabase
            .from('property_features')
            .select('property_id, is_enabled')
            .eq('feature_key', 'ticket_validation')
            .in('property_id', propertyIds);

        const validationMap = new Map((validationFeatures || []).map((f: any) => [f.property_id, f.is_enabled]));
        // Default to enabled if not explicitly set
        const propertiesWithValidation = propertyIds.filter(id => validationMap.get(id) !== false).length;

        if (propertyIds.length === 0) {
            return NextResponse.json({
                organization_id: orgId,
                period,
                total_tickets: 0,
                open_tickets: 0,
                in_progress: 0,
                resolved: 0,
                pending_validation: 0,
                validated_closed: 0,
                sla_breached: 0,
                avg_resolution_hours: 0,
                properties_with_validation: 0,
                properties: [],
            });
        }

        // Calculate date range
        let startDate = new Date();

        if (period === 'today') {
            startDate.setHours(0, 0, 0, 0);
        } else if (period === 'week') {
            startDate.setDate(startDate.getDate() - 7);
        } else if (period === 'month') {
            startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
        }

        // Fetch all tickets for these properties
        let query = supabase
            .from('tickets')
            .select('id, property_id, status, priority, sla_breached, created_at, resolved_at')
            .in('property_id', propertyIds);

        if (period !== 'all') {
            query = query.gte('created_at', startDate.toISOString());
        }

        const { data: tickets } = await query;

        // Calculate overall stats
        const totalTickets = tickets?.length || 0;
        const resolvedStatuses = ['resolved', 'closed'];

        // Open/In Progress combined should equal all non-resolved
        const openTickets = tickets?.filter(t => t.status === 'open' || t.status === 'waitlist' || t.status === 'blocked').length || 0;
        const waitlist = tickets?.filter(t => t.status === 'waitlist').length || 0;
        const inProgress = tickets?.filter(t => t.status === 'assigned' || t.status === 'in_progress' || t.status === 'paused' || t.status === 'work_started').length || 0;
        const resolved = tickets?.filter(t => resolvedStatuses.includes(t.status || '')).length || 0;
        const pendingValidation = tickets?.filter(t => t.status === 'pending_validation').length || 0;
        const validatedClosed = tickets?.filter(t => t.status === 'closed').length || 0;
        const urgentOpen = tickets?.filter(t => (t.priority === 'urgent' || t.priority === 'high' || t.priority === 'critical') && !resolvedStatuses.includes(t.status || '') && t.status !== 'pending_validation').length || 0;
        const slaBreached = tickets?.filter(t => t.sla_breached).length || 0;

        // Calculate average resolution time
        const resolvedTickets = tickets?.filter(t => t.resolved_at) || [];
        let totalResolutionMs = 0;
        resolvedTickets.forEach(t => {
            const created = new Date(t.created_at);
            const resolved = new Date(t.resolved_at);
            totalResolutionMs += resolved.getTime() - created.getTime();
        });
        const avgResolutionHours = resolvedTickets.length > 0
            ? Math.round(totalResolutionMs / resolvedTickets.length / (1000 * 60 * 60))
            : 0;

        // Build property breakdown
        const propertyBreakdown = properties?.map(prop => {
            const propTickets = tickets?.filter(t => t.property_id === prop.id) || [];
            const validationOn = validationMap.get(prop.id) !== false;
            return {
                property_id: prop.id,
                property_name: prop.name,
                property_code: prop.code,
                validation_enabled: validationOn,
                total: propTickets.length,
                open: propTickets.filter(t => t.status === 'open' || t.status === 'waitlist' || t.status === 'blocked').length,
                waitlist: propTickets.filter(t => t.status === 'waitlist').length,
                in_progress: propTickets.filter(t => t.status === 'assigned' || t.status === 'in_progress' || t.status === 'paused' || t.status === 'work_started').length,
                resolved: propTickets.filter(t => resolvedStatuses.includes(t.status || '')).length,
                pending_validation: propTickets.filter(t => t.status === 'pending_validation').length,
                validated_closed: propTickets.filter(t => t.status === 'closed').length,
                urgent_open: propTickets.filter(t => (t.priority === 'urgent' || t.priority === 'high' || t.priority === 'critical') && !resolvedStatuses.includes(t.status || '') && t.status !== 'pending_validation').length,
                sla_breached: propTickets.filter(t => t.sla_breached).length,
            };
        }) || [];

        // Sort by total tickets descending
        propertyBreakdown.sort((a, b) => b.total - a.total);

        return NextResponse.json({
            organization_id: orgId,
            period,
            total_tickets: totalTickets,
            open_tickets: openTickets,
            waitlist,
            in_progress: inProgress,
            resolved,
            pending_validation: pendingValidation,
            validated_closed: validatedClosed,
            urgent_open: urgentOpen,
            sla_breached: slaBreached,
            avg_resolution_hours: avgResolutionHours,
            properties_with_validation: propertiesWithValidation,
            properties: propertyBreakdown,
        });
    } catch (error) {
        console.error('Tickets summary error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
