import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * Resolve the assigned user for an incoming lead based on distribution rules.
 *
 * Matching (first hit wins):
 *   1. Exact campaign rule (rule.campaign === campaign).
 *   2. Micro-market keyword: rule.campaign treated as a keyword (e.g. "andheri",
 *      "lower parel", "bengaluru", "noida") matched as a substring against the
 *      lead's campaign OR city. Robust to messy Meta form names like
 *      "Managed Office - Andheri (New)".
 *
 * Returns a user_id if a rule matches, or null (caller decides the fallback —
 * we intentionally do NOT dump unmatched leads on a default admin).
 */
export async function resolveDistributionAssignee(
    organizationId: string,
    campaign: string | null,
    city?: string | null,
): Promise<string | null> {
    const haystack = `${campaign || ''} ${city || ''}`.toLowerCase();
    if (!haystack.trim()) return null;

    const { data: rules } = await supabaseAdmin
        .from('crm_lead_distribution_rules')
        .select('id, campaign, mode, members:crm_lead_distribution_members(id, user_id, assigned_count, last_assigned_at, is_active)')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

    if (!rules || rules.length === 0) return null;

    // 1. Exact campaign match, then 2. keyword (substring) match.
    let rule = campaign ? rules.find((r: any) => r.campaign === campaign) : null;
    if (!rule) {
        rule = rules.find((r: any) => {
            const kw = (r.campaign || '').toLowerCase().trim();
            return kw && haystack.includes(kw);
        });
    }
    if (!rule) return null;

    const activeMembers = (rule.members || []).filter((m: any) => m.is_active !== false);
    if (activeMembers.length === 0) return null;

    if (rule.mode === 'exclusive') {
        return activeMembers[0].user_id;
    }

    // Round-robin: fewest assignments, ties broken by oldest last_assigned_at.
    activeMembers.sort((a: any, b: any) => {
        if (a.assigned_count !== b.assigned_count) return a.assigned_count - b.assigned_count;
        return (a.last_assigned_at || '1970-01-01').localeCompare(b.last_assigned_at || '1970-01-01');
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
