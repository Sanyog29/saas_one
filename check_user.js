import { createAdminClient } from './frontend/utils/supabase/admin.js';

async function checkUser() {
    const supabase = createAdminClient();
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users.find(u => u.email === 'harsh.p@autopilotoffices.com' || u.user_metadata?.full_name?.includes('harsh'));
    
    if (!user) {
        console.log('User not found');
        return;
    }
    
    console.log('User ID:', user.id);
    
    const { data: propMem } = await supabase
        .from('property_memberships')
        .select('property_id, properties(name), role')
        .eq('user_id', user.id);
        
    console.log('Property Memberships:', JSON.stringify(propMem, null, 2));
    
    const { data: orgMem } = await supabase
        .from('organization_memberships')
        .select('organization_id, role')
        .eq('user_id', user.id);
        
    console.log('Org Memberships:', JSON.stringify(orgMem, null, 2));
}

checkUser();
