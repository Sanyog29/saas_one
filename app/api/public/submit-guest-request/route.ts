import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@lib/supabase/admin';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { zoneId, sig, guestName, guestPhone, guestEmail, description, photoUrls, deviceInfo, locationData } = body;

        if (!zoneId || !sig || !guestName || !description) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Verify the signature matches the zone in the database
        const { data: zone, error: zoneError } = await supabaseAdmin
            .from('qr_facility_zones')
            .select('id, property_id, qr_signature')
            .eq('id', zoneId)
            .single();

        if (zoneError || !zone) {
            return NextResponse.json({ error: 'Invalid zone' }, { status: 404 });
        }

        if (zone.qr_signature !== sig) {
            return NextResponse.json({ error: 'Invalid QR signature' }, { status: 401 });
        }

        // 2. Perform AI Categorization (Placeholder for now)
        // In the future, send 'description' to OpenAI or GROQ to get category
        const aiCategory = 'General'; 

        // 3. Insert the guest request using Service Role to bypass RLS
        const { data: request, error: insertError } = await supabaseAdmin
            .from('guest_requests')
            .insert({
                property_id: zone.property_id,
                qr_zone_id: zone.id,
                guest_name: guestName,
                guest_phone: guestPhone,
                guest_email: guestEmail,
                description,
                photo_urls: photoUrls || [],
                device_info: deviceInfo || {},
                location_data: locationData || {},
                ai_category: aiCategory,
                status: 'PENDING'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error inserting guest request:', insertError);
            return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: request });
    } catch (error: any) {
        console.error('submit-guest-request API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
