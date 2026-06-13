import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { resolveCrmAccess, isCrmAccessError, readOrgId } from '@/backend/lib/crm/access';

const MAX_ROWS = 5000;

// POST /api/crm/import - import leads from CSV
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    if (!body?.csv_data) return NextResponse.json({ error: 'csv_data is required' }, { status: 400 });

    const access = await resolveCrmAccess(request, readOrgId(request, body));
    if (isCrmAccessError(access)) return access;
    const org = access.organizationId;

    const parsed = Papa.parse(body.csv_data, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    });
    if (parsed.errors.length > 0) {
        return NextResponse.json({ error: 'Invalid CSV format', details: parsed.errors }, { status: 400 });
    }

    const rows = parsed.data as Record<string, string>[];
    if (rows.length > MAX_ROWS) {
        return NextResponse.json({ error: `CSV exceeds ${MAX_ROWS}-row limit (got ${rows.length})` }, { status: 413 });
    }

    const errors: { row: number; field: string; message: string }[] = [];
    const importedLeads: string[] = [];
    let skipped = 0;

    // Default status (org default -> global default).
    const { data: def } = await supabaseAdmin
        .from('crm_lead_statuses').select('id')
        .eq('is_default', true)
        .or(`organization_id.eq.${org},organization_id.is.null`)
        .order('organization_id', { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();
    const defaultStatusId = def?.id;
    if (!defaultStatusId) return NextResponse.json({ error: 'No default lead status configured' }, { status: 500 });

    // Lookup maps (org-scoped where applicable).
    const { data: sources } = await supabaseAdmin
        .from('crm_lead_sources').select('id, name').eq('is_active', true)
        .or(`organization_id.eq.${org},organization_id.is.null`);
    const sourceMap = new Map((sources || []).map((s) => [s.name.toLowerCase(), s.id]));

    const { data: properties } = await supabaseAdmin
        .from('properties').select('id, name').eq('organization_id', org);
    const propertyMap = new Map((properties || []).map((p) => [p.name.toLowerCase(), p.id]));

    // Only admins may assign imported leads to other members.
    let userMap = new Map<string, string>();
    if (access.isAdmin) {
        const [pm, om] = await Promise.all([
            supabaseAdmin.from('property_memberships').select('user_id').eq('organization_id', org).eq('is_active', true),
            supabaseAdmin.from('organization_memberships').select('user_id').eq('organization_id', org).eq('is_active', true),
        ]);
        const memberIds = [...new Set([...(pm.data || []), ...(om.data || [])].map((m: any) => m.user_id))];
        if (memberIds.length) {
            const { data: us } = await supabaseAdmin.from('users').select('id, full_name').in('id', memberIds);
            userMap = new Map((us || []).map((u) => [u.full_name.toLowerCase(), u.id]));
        }
    }

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
            const companyName = row['company_name'] || row['companyname'] || row['company'];
            const contactPerson = row['contact_person'] || row['contactperson'] || row['contact'];
            const contactNumber = row['contact_number'] || row['contactnumber'] || row['phone'] || row['mobile'];
            const email = row['email'] || row['emailid'] || row['email_id'];
            const location = row['location'] || row['city'];
            const requirement = row['requirement'] || row['note'] || row['notes'];
            const dealValueRaw = parseFloat(row['deal_value'] || row['dealvalue'] || row['value'] || '0');
            const dealValue = isNaN(dealValueRaw) || dealValueRaw < 0 ? 0 : dealValueRaw;
            const propertyInterest = row['property_interest'] || row['propertyinterest'] || row['property'];
            const leadSourceName = row['lead_source'] || row['leadsource'] || row['source'];
            const assignedTeam = row['assigned_team'] || row['assigneduser'] || row['assigned'];

            if (!companyName && !contactPerson && !email && !contactNumber) {
                errors.push({ row: rowNum, field: 'required', message: 'Need at least one of company_name, contact_person, email, contact_number' });
                continue;
            }

            // Dedup within the org by email or phone.
            if (email || contactNumber) {
                const ors: string[] = [];
                if (email) ors.push(`email.eq.${email}`);
                if (contactNumber) ors.push(`contact_number.eq.${contactNumber}`);
                const { data: dup } = await supabaseAdmin
                    .from('crm_leads').select('id').eq('organization_id', org).or(ors.join(',')).limit(1).maybeSingle();
                if (dup) { skipped++; continue; }
            }

            const leadData: Record<string, any> = {
                organization_id: org,
                created_by: access.user.id,
                assigned_to: access.isAdmin ? null : access.user.id,
                company_name: companyName || null,
                contact_person: contactPerson || null,
                contact_number: contactNumber || null,
                email: email || null,
                location: location || null,
                city: location || null,
                requirement: requirement || null,
                deal_value: dealValue,
                status: defaultStatusId,
                priority: 'Medium',
            };
            if (propertyInterest) {
                const pid = propertyMap.get(propertyInterest.toLowerCase());
                if (pid) leadData.property_interest = pid;
            }
            if (leadSourceName) {
                const sid = sourceMap.get(leadSourceName.toLowerCase());
                if (sid) leadData.lead_source = sid;
            }
            if (assignedTeam && access.isAdmin) {
                const uid = userMap.get(assignedTeam.toLowerCase());
                if (uid) leadData.assigned_to = uid;
            }

            const { data: newLead, error: insErr } = await supabaseAdmin
                .from('crm_leads').insert(leadData).select('id').single();
            if (insErr) errors.push({ row: rowNum, field: 'insert', message: insErr.message });
            else importedLeads.push(newLead.id);
        } catch (err: any) {
            errors.push({ row: rowNum, field: 'general', message: err?.message || 'Unknown error' });
        }
    }

    return NextResponse.json({
        total_rows: rows.length,
        success_count: importedLeads.length,
        skipped_duplicates: skipped,
        error_count: errors.length,
        errors: errors.slice(0, 100),
        imported_leads: importedLeads,
    });
}

// GET /api/crm/import - sample CSV template
export async function GET() {
    const template = `Company Name,Contact Person,Contact Number,Email Id,Assigned Team,Location,Requirement,Deal Value,Property Interest,Lead Source`;
    return new NextResponse(template, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="crm_leads_template.csv"',
        },
    });
}
