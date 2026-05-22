const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    try {
        console.log('--- Searching for Users ---');
        const { data: users, error: uError } = await supabase
            .from('users')
            .select('id, full_name, email')
            .ilike('full_name', '%Harsh Patil%');

        if (uError) throw uError;
        console.table(users);

        for (const user of users) {
            console.log(`\n>>> Checking User: ${user.full_name} (${user.id})`);

            console.log('--- Organization Memberships ---');
            const { data: orgMems } = await supabase
                .from('organization_memberships')
                .select('organization_id, role, is_active')
                .eq('user_id', user.id);
            console.table(orgMems);

            console.log('--- Property Memberships ---');
            const { data: propMems } = await supabase
                .from('property_memberships')
                .select('property_id, role, is_active')
                .eq('user_id', user.id);
            console.table(propMems);

            if (orgMems && orgMems.length > 0) {
                const orgId = orgMems[0].organization_id;
                console.log(`--- Procurement Settings for Org: ${orgId} ---`);
                const { data: settings } = await supabase
                    .from('procurement_settings')
                    .select('property_id, price_visibility_roles, price_visibility_users')
                    .eq('organization_id', orgId);
                console.table(settings);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

check();
