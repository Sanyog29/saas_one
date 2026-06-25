import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].replace(/['"]+/g, '').trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].replace(/['"]+/g, '').trim();

const supabase = createClient(url, key);

async function run() {
    const { data } = await supabase.from('electricity_meters').select('*').limit(1);
    console.log(Object.keys(data[0]||{}));
}

run();
