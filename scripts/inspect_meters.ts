import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
    const { data: meters } = await supabase.from('electricity_meters').select('id, name').ilike('name', '%EB-1%');
    console.log("Legacy:", meters);

    const { data: facMeters } = await supabase.from('facility_meters').select('id, name').ilike('name', '%EB-1%');
    console.log("Facility:", facMeters);

    const { data: readings } = await supabase.from('electricity_readings').select('id, meter_id, reading_date, closing_reading').eq('reading_date', '2026-06-22');
    console.log("Readings Today:", readings);
}

run();
