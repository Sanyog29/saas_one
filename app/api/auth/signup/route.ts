import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const { email, password, fullName, role, organizationId } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        const supabase = await createClient();
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    role: role || 'bd_rep', // Default to bd_rep if no role specified
                },
            },
        });

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }

        // If organization and role are provided, add user to organization_memberships
        if (data.user && role && organizationId) {
            // Determine if this is an org-level role or property-level role
            const ORG_LEVEL_ROLES = ['org_super_admin', 'org_admin', 'bd_admin'];

            if (ORG_LEVEL_ROLES.includes(role)) {
                // Add to organization_memberships
                await supabase
                    .from('organization_memberships')
                    .insert({
                        user_id: data.user.id,
                        organization_id: organizationId,
                        role: role,
                        is_active: true
                    });
            } else {
                // For bd_rep, add to organization_memberships
                await supabase
                    .from('organization_memberships')
                    .insert({
                        user_id: data.user.id,
                        organization_id: organizationId,
                        role: role,
                        is_active: true
                    });
            }
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Signup API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
