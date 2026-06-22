import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * Resolve the assigned user for an incoming lead based on distribution rules.
 * Returns a user_id if a rule matches, or null to fall back to default behavior.
 */
export async function resolveDistributionAssignee(
    organizationId: string,
    campaign: string | null
): Promise<string | null> {
    if (!campaign) return null;

    const { data: rule } = await supabaseAdmin
        .from('crm_lead_distribution_rules')
        .select('id, mode, members:crm_lead_distribution_members(id, user_id, assigned_count, last_assigned_at, is_active)')
        .eq('organization_id', organizationId)
        .eq('campaign', campaign)
        .eq('is_active', true)
        .single();

    if (!rule) return null;

    const activeMembers = (rule.members || []).filter((m: any) => m.is_active !== false);
    if (activeMembers.length === 0) return null;

    if (rule.mode === 'exclusive') {
        return activeMembers[0].user_id;
    }

    // Round-robin: pick the member with the fewest assignments,
    // breaking ties by oldest last_assigned_at.
    activeMembers.sort((a: any, b: any) => {
        if (a.assigned_count !== b.assigned_count) return a.assigned_count - b.assigned_count;
        const aTime = a.last_assigned_at || '1970-01-01';
        const bTime = b.last_assigned_at || '1970-01-01';
        return aTime.localeCompare(bTime);
    });

    const chosen = activeMembers[0];

    await supabaseAdmin
        .from('crm_lead_distribution_members')
        .update({
            assigned_count: (chosen.assigned_count || 0) + 1,
            last_assigned_at: new Date().toISOString(),
        })
        .eq('id', chosen.id);

    return chosen.user_id;
}
