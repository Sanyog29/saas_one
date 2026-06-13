-- ===========================================
-- CRM Roles Migration
-- Adds bd_rep and bd_admin roles
-- ===========================================

-- Note: Roles are stored as plain text strings in this application.
-- User UUIDs come from auth.users and are already generated.
-- Territories are created dynamically via the CRM settings UI or API.

-- ===========================================
-- Role Definitions:
--
-- bd_rep (BD Representative)
-- - Standard CRM user
-- - Can view assigned leads, create leads, edit own leads
-- - Can update lead stages, add notes, meetings, calls, follow-ups
-- - Can view personal dashboard
--
-- bd_admin (BD Admin)
-- - Everything in bd_rep plus:
-- - View all leads
-- - Reassign leads
-- - Configure territories, dashboard tiles, lead stages, status colors
-- - View team performance, property-wise performance
-- - Configure integrations
-- ===========================================

-- Create a roles reference table (optional - for documentation/admin UI)
CREATE TABLE IF NOT EXISTS crm_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_key TEXT NOT NULL UNIQUE,
    role_name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert CRM roles
INSERT INTO crm_roles (role_key, role_name, description) VALUES
    ('bd_rep', 'BD Representative', 'Standard CRM user with access to assigned leads'),
    ('bd_admin', 'BD Admin', 'CRM administrator with full access to all leads and settings')
ON CONFLICT (role_key) DO NOTHING;
