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



        // 1. Get all meters in this category
        const { data: groups } = await supabase.from('facility_meter_groups').select('id').eq('category_id', categoryId);
        const groupIds = groups?.map(g => g.id) || [];
        
        if (groupIds.length === 0) return NextResponse.json([]);

        const { data: meters } = await supabase.from('facility_meters').select('id').in('group_id', groupIds);
        const meterIds = meters?.map(m => m.id) || [];

        if (meterIds.length === 0) return NextResponse.json([]);

        // 2. Fetch readings for these meters within the date range
        const { data: readings, error } = await supabase
            .from('facility_meter_readings')
            .select('*')
            .in('meter_id', meterIds)
            .gte('reading_date', startDate)
            .lt('reading_date', endDate);

        if (error) throw error;

        // 3. Fetch the absolute latest reading BEFORE the month starts to carry forward the initial reading
        const { data: prevReadings, error: prevError } = await supabase
            .from('facility_meter_readings')
            .select('*')
            .in('meter_id', meterIds)
            .lt('reading_date', startDate)
            .order('reading_date', { ascending: false });
            
        if (prevError) throw prevError;
        
        // Only keep the most recent previous reading per meter
        const latestPrevMap = new Map();
        if (prevReadings) {
            for (const pr of prevReadings) {
                if (!latestPrevMap.has(pr.meter_id)) {
                    latestPrevMap.set(pr.meter_id, pr);
                }
            }
        }

        const combinedReadings = [...(readings || []), ...Array.from(latestPrevMap.values())];

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



        // Prepare bulk upsert payload
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

        // --- DUAL WRITE: Sync to Legacy electricity_readings for Card UI ---
        const legacyPayload = readings.map((r: any) => ({
            property_id: propertyId,
            meter_id: r.meter_id,
            reading_date: r.reading_date,
            opening_reading: r.initial_reading,
            closing_reading: r.final_reading,
            final_units: r.consumption,
            multiplier_value_used: r.meter_constant_used || 1.0,
            created_by: user.id,
            updated_at: new Date().toISOString()
        }));

        await supabase
            .from('electricity_readings')
            .upsert(legacyPayload, {
                onConflict: 'meter_id,reading_date',
                ignoreDuplicates: false
            });

        // Update last_reading on electricity_meters
        for (const r of readings) {
            await supabase
                .from('electricity_meters')
                .update({ last_reading: r.final_reading, updated_at: new Date().toISOString() })
                .eq('id', r.meter_id);
        }
        // -------------------------------------------------------------------

        return NextResponse.json({ success: true, count: payload.length });

    } catch (error: any) {
        console.error('[Facility Readings POST Error]:', error);
        return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
    }
}
