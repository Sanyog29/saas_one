import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { parentCity } from '@/backend/lib/crm/cityGroups';

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
 * TERRITORY SAFETY-NET: a rule's member pool can drift out of sync with reps'
 * territories (crm_territories). Before assigning, we drop any member whose
 * territory clearly does NOT cover the lead's market — so a Mumbai lead never
 * lands on a Bangalore rep even if the rule's members are mis-set. Reps with NO
 * territory configured are unconstrained (no behaviour change for orgs that don't
 * use territories). If the filter empties the pool, we return null (lead stays
 * unassigned for manual handling) rather than force a cross-territory assignment.
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

    let activeMembers = (rule.members || []).filter((m: any) => m.is_active !== false);
    if (activeMembers.length === 0) return null;

    // Territory safety-net: drop members whose territory can't cover this lead.
    activeMembers = await filterByTerritory(activeMembers, campaign, city);
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

/**
 * Keep only members whose configured territory could cover this lead's market.
 * A member is kept when:
 *   - they have NO territory rows (unconstrained), OR
 *   - the lead's city rolls up to one of their territory cities (parent-metro
 *     aware, so "Lower Parel" matches a "Mumbai" territory), OR
 *   - the lead's campaign matches one of their territory campaigns.
 */
async function filterByTerritory(members: any[], campaign: string | null, city?: string | null): Promise<any[]> {
    const userIds = [...new Set(members.map((m) => m.user_id).filter(Boolean))];
    if (userIds.length === 0) return members;

    const { data: terr } = await supabaseAdmin
        .from('crm_territories')
        .select('user_id, city, campaign')
        .in('user_id', userIds)
        .eq('is_active', true);

    // user_id -> { cities[], campaigns[] }
    const byUser = new Map<string, { cities: string[]; campaigns: string[] }>();
    for (const t of terr || []) {
        const e = byUser.get(t.user_id) || { cities: [], campaigns: [] };
        const camp = (t.campaign || '').trim();
        const cityVal = (t.city || '').trim();
        if (camp) e.campaigns.push(camp);
        else if (cityVal) e.cities.push(cityVal);
        byUser.set(t.user_id, e);
    }

    const leadParent = city ? parentCity(city).toLowerCase() : '';
    const leadCampaign = (campaign || '').toLowerCase();

    const covers = (uid: string): boolean => {
        const t = byUser.get(uid);
        // No territory configured → don't constrain this member.
        if (!t || (t.cities.length === 0 && t.campaigns.length === 0)) return true;
        if (leadParent && t.cities.some((c) => parentCity(c).toLowerCase() === leadParent)) return true;
        if (leadCampaign && t.campaigns.some((tc) => {
            const k = tc.toLowerCase();
            return k && (leadCampaign.includes(k) || k.includes(leadCampaign));
        })) return true;
        return false;
    };

    return members.filter((m) => covers(m.user_id));
}
