import { NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET readings for a specific month and meter group
export async function GET(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month'); // e.g. '2026-06'
        const categoryId = searchParams.get('categoryId');
        const { propertyId } = await params;

        if (!month || !categoryId) {
            return NextResponse.json({ error: 'Missing month or categoryId' }, { status: 400 });
        }

        const startDate = `${month}-01`;
        const nextMonthDate = new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + 1));
        const endDate = nextMonthDate.toISOString().split('T')[0];



        // 1.5 Get Category Type
        const { data: categoryData } = await supabase.from('facility_meter_categories').select('meter_type').eq('id', categoryId).single();
        const isElectricity = categoryData?.meter_type === 'electricity';

        // 1. Get all meters in this category
        const { data: groups } = await supabase.from('facility_meter_groups').select('id').eq('category_id', categoryId);
        const groupIds = groups?.map(g => g.id) || [];
        
        if (groupIds.length === 0) return NextResponse.json([]);

        const { data: meters } = await supabase.from('facility_meters').select('id').in('group_id', groupIds);
        const meterIds = meters?.map(m => m.id) || [];

        if (meterIds.length === 0) return NextResponse.json([]);

        let combinedReadings: any[] = [];

        if (isElectricity) {
            // For electricity, we use the unified electricity_readings table as source of truth
            const { data: readings, error } = await supabase
                .from('electricity_readings')
                .select('*')
                .in('meter_id', meterIds)
                .gte('reading_date', startDate)
                .lt('reading_date', endDate);
            
            if (error) throw error;

            const { data: prevReadings, error: prevError } = await supabase
                .from('electricity_readings')
                .select('*')
                .in('meter_id', meterIds)
                .lt('reading_date', startDate)
                .order('reading_date', { ascending: false });

            if (prevError) throw prevError;

            const latestPrevMap = new Map();
            if (prevReadings) {
                for (const pr of prevReadings) {
                    if (!latestPrevMap.has(pr.meter_id)) {
                        latestPrevMap.set(pr.meter_id, pr);
                    }
                }
            }

            const rawCombined = [...(readings || []), ...Array.from(latestPrevMap.values())];
            
            // Map electricity_readings schema back to spreadsheet expected schema
            combinedReadings = rawCombined.map(r => ({
                id: r.id,
                meter_id: r.meter_id,
                reading_date: r.reading_date,
                initial_reading: r.opening_reading,
                final_reading: r.closing_reading,
                consumption: r.final_units || r.computed_units,
                meter_constant_used: r.multiplier_value_used,
                is_rollover: false,
                created_at: r.created_at
            }));

        } else {
            // Standard generic facility_meter_readings
            const { data: readings, error } = await supabase
                .from('facility_meter_readings')
                .select('*')
                .in('meter_id', meterIds)
                .gte('reading_date', startDate)
                .lt('reading_date', endDate);

            if (error) throw error;

            const { data: prevReadings, error: prevError } = await supabase
                .from('facility_meter_readings')
                .select('*')
                .in('meter_id', meterIds)
                .lt('reading_date', startDate)
                .order('reading_date', { ascending: false });
                
            if (prevError) throw prevError;
            
            const latestPrevMap = new Map();
            if (prevReadings) {
                for (const pr of prevReadings) {
                    if (!latestPrevMap.has(pr.meter_id)) {
                        latestPrevMap.set(pr.meter_id, pr);
                    }
                }
            }

            combinedReadings = [...(readings || []), ...Array.from(latestPrevMap.values())];
        }

        return NextResponse.json(combinedReadings);

    } catch (error: any) {
        console.error('[Facility Readings GET Error]:', error);
        return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
    }
}

// BULK UPSERT readings
export async function POST(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { propertyId } = await params;
        const body = await request.json();
        const { readings } = body; // Array of { meter_id, reading_date, initial_reading, final_reading, consumption, meter_constant_used, is_rollover }

        if (!readings || !Array.isArray(readings)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }



        // Check if any of these meters belong to an electricity category
        let isElectricity = false;
        if (readings.length > 0) {
            const meterId = readings[0].meter_id;
            const { data: meterData } = await supabase
                .from('facility_meters')
                .select('group_id, group:facility_meter_groups(category:facility_meter_categories(meter_type))')
                .eq('id', meterId)
                .single();
            // @ts-ignore
            if (meterData?.group?.category?.meter_type === 'electricity') {
                isElectricity = true;
            }
        }

        if (isElectricity) {
            // Write to electricity_readings ONLY (unified table)
            const legacyPayload = readings.map((r: any) => ({
                property_id: propertyId,
                meter_id: r.meter_id,
                reading_date: r.reading_date,
                opening_reading: r.initial_reading,
                closing_reading: r.final_reading,
                final_units: r.consumption,
                computed_units: r.consumption,
                multiplier_value_used: r.meter_constant_used || 1.0,
                created_by: user.id,
                updated_at: new Date().toISOString()
            }));

            const { error: elecErr } = await supabase
                .from('electricity_readings')
                .upsert(legacyPayload, {
                    onConflict: 'meter_id,reading_date',
                    ignoreDuplicates: false
                });

            if (elecErr) throw elecErr;

            // Update last_reading on electricity_meters
            for (const r of readings) {
                await supabase
                    .from('electricity_meters')
                    .update({ last_reading: r.final_reading, updated_at: new Date().toISOString() })
                    .eq('id', r.meter_id);
            }

            return NextResponse.json({ success: true, count: legacyPayload.length });
        }

        // Standard facility writing
        const payload = readings.map((r: any) => ({
            meter_id: r.meter_id,
            reading_date: r.reading_date,
            initial_reading: r.initial_reading,
            final_reading: r.final_reading,
            consumption: r.consumption,
            meter_constant_used: r.meter_constant_used || 1.0,
            is_rollover: r.is_rollover || false,
            created_by: user.id,
            updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('facility_meter_readings')
            .upsert(payload, { 
                onConflict: 'meter_id,reading_date',
                ignoreDuplicates: false
            });

        if (error) throw error;

        return NextResponse.json({ success: true, count: payload.length });

    } catch (error: any) {
        console.error('[Facility Readings POST Error]:', error);
        return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
    }
}
