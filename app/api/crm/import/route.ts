import { createClient } from '@/frontend/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';

// POST /api/crm/import - Import leads from CSV
export async function POST(request: NextRequest) {
    const supabase = createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.csv_data) {
        return NextResponse.json({ error: 'csv_data is required' }, { status: 400 });
    }

    // Parse CSV
    const parsed = Papa.parse(body.csv_data, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_')
    });

    if (parsed.errors.length > 0) {
        return NextResponse.json({ error: 'Invalid CSV format', details: parsed.errors }, { status: 400 });
    }

    const rows = parsed.data as Record<string, string>[];
    const errors: { row: number; field: string; message: string }[] = [];
    const importedLeads: string[] = [];

    // Get default status
    const { data: defaultStatus } = await supabase
        .from('crm_lead_statuses')
        .select('id')
        .eq('name', 'New Lead')
        .single();

    // Get lead sources mapping
    const { data: sources } = await supabase
        .from('crm_lead_sources')
        .select('id, name')
        .eq('is_active', true);

    const sourceMap = new Map(sources?.map(s => [s.name.toLowerCase(), s.id]) || []);

    // Get properties mapping
    const { data: properties } = await supabase
        .from('properties')
        .select('id, name');

    const propertyMap = new Map(properties?.map(p => [p.name.toLowerCase(), p.id]) || []);

    // Get users for assignment
    const { data: users } = await supabase
        .from('users')
        .select('id, full_name');

    const userMap = new Map(users?.map(u => [u.full_name.toLowerCase(), u.id]) || []);

    // Process each row
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // Account for header row + 1-based indexing

        try {
            // Map columns
            const companyName = row['company_name'] || row['companyname'] || row['company'];
            const contactPerson = row['contact_person'] || row['contactperson'] || row['contact'];
            const contactNumber = row['contact_number'] || row['contactnumber'] || row['phone'] || row['mobile'];
            const email = row['email'] || row['emailid'] || row['email_id'];
            const location = row['location'] || row['city'];
            const requirement = row['requirement'] || row['note'] || row['notes'];
            const dealValue = parseFloat(row['deal_value'] || row['dealvalue'] || row['value'] || '0');
            const propertyInterest = row['property_interest'] || row['propertyinterest'] || row['property'];
            const leadSourceName = row['lead_source'] || row['leadsource'] || row['source'];
            const assignedTeam = row['assigned_team'] || row['assigneduser'] || row['assigned'];

            // Validate required fields
            if (!companyName && !contactPerson && !email) {
                errors.push({ row: rowNum, field: 'required', message: 'At least one of company_name, contact_person, or email is required' });
                continue;
            }

            // Build lead data
            const leadData: Record<string, any> = {
                created_by: user.id,
                company_name: companyName,
                contact_person: contactPerson,
                contact_number: contactNumber,
                email: email,
                location: location,
                requirement: requirement,
                deal_value: dealValue || 0,
                status: defaultStatus?.id,
                priority: 'Medium'
            };

            // Map property
            if (propertyInterest) {
                const propId = propertyMap.get(propertyInterest.toLowerCase());
                if (propId) {
                    leadData.property_interest = propId;
                }
            }

            // Map lead source
            if (leadSourceName) {
                const sourceId = sourceMap.get(leadSourceName.toLowerCase());
                if (sourceId) {
                    leadData.lead_source = sourceId;
                }
            }

            // Map assigned user
            if (assignedTeam) {
                const userId = userMap.get(assignedTeam.toLowerCase());
                if (userId) {
                    leadData.assigned_to = userId;
                }
            }

            // Insert lead
            const { data: newLead, error: insertError } = await supabase
                .from('crm_leads')
                .insert(leadData)
                .select('id')
                .single();

            if (insertError) {
                errors.push({ row: rowNum, field: 'insert', message: insertError.message });
            } else {
                importedLeads.push(newLead.id);
            }
        } catch (err: any) {
            errors.push({ row: rowNum, field: 'general', message: err.message });
        }
    }

    return NextResponse.json({
        total_rows: rows.length,
        success_count: importedLeads.length,
        error_count: errors.length,
        errors: errors.slice(0, 100), // Limit errors to first 100
        imported_leads: importedLeads
    });
}

// GET /api/crm/import/template - Get sample CSV template
export async function GET(request: NextRequest) {
    const template = `Sl No,Date,Company Name,Contact Person,Contact Number,Email Id,Assigned Team,Location,Requirement,FCPL Status,Deal Value,Property Interest,Lead Source`;

    return new NextResponse(template, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="crm_leads_template.csv"'
        }
    });
}