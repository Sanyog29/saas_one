// ===========================================
// CRM Module TypeScript Types
// ===========================================

export type LeadStatus =
    | 'New Lead'
    | 'Contacted'
    | 'Meeting Scheduled'
    | 'Site Visit Scheduled'
    | 'Proposal Shared'
    | 'Negotiation'
    | 'Won'
    | 'Lost'
    | 'Dropped'
    | 'On Hold';

export type LeadPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type ActivityType =
    | 'created'
    | 'updated'
    | 'call'
    | 'meeting'
    | 'site_visit'
    | 'proposal_sent'
    | 'followup_scheduled'
    | 'status_changed'
    | 'assigned'
    | 'note_added'
    | 'email_sent'
    | 'archived'
    | 'restored';

export type EventType = 'call' | 'meeting' | 'site_visit' | 'followup';

export type EventStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';

// ===========================================
// Database Entities
// ===========================================

export interface CRMTerritory {
    id: string;
    user_id: string;
    city: string;
    is_active: boolean;
    created_at: string;
}

export interface CRMTarget {
    id: string;
    user_id: string;
    month: number;
    year: number;
    target_value: number;
    target_leads: number;
    target_closures: number;
    created_at: string;
}

export interface CRMMetaLead {
    id: string;
    meta_lead_id: string;
    payload: Record<string, any>;
    campaign_id?: string;
    campaign_name?: string;
    adset_id?: string;
    adset_name?: string;
    ad_id?: string;
    ad_name?: string;
    form_id?: string;
    form_name?: string;
    status: 'pending' | 'processed' | 'failed' | 'duplicate';
    processed_lead_id?: string;
    error_message?: string;
    created_at: string;
    processed_at?: string;
}

// Lead Status
export interface LeadStatusConfig {
    id: string;
    name: string;
    color: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// Lead Source
export interface LeadSource {
    id: string;
    name: string;
    is_active: boolean;
    created_at: string;
}

// Property Mapping
export interface CRMPropertyMapping {
    id: string;
    property_id: string;
    crm_property_name: string;
    is_active: boolean;
    created_at: string;
}

// ===========================================
// Core CRM Entities
// ===========================================

export interface CRMLead {
    id: string;
    created_at: string;
    created_by: string;
    assigned_to?: string;
    company_name?: string;
    contact_person?: string;
    contact_number?: string;
    email?: string;
    location?: string;
    requirement?: string;
    property_interest?: string;
    lead_source?: string;
    deal_value: number;
    status: string;
    priority: LeadPriority;
    next_followup_date?: string;
    last_contacted?: string;
    remarks?: string;
    meta_lead_id?: string;
    meta_campaign_id?: string;
    meta_adset_id?: string;
    meta_ad_id?: string;
    meta_form_name?: string;
    is_archived: boolean;
    updated_at: string;
    // Joined data
    status_info?: LeadStatusConfig;
    source_info?: LeadSource;
    assigned_user?: CRMUser;
    creator?: CRMUser;
    property_info?: {
        id: string;
        name: string;
    };
}

export interface CRMActivity {
    id: string;
    lead_id: string;
    user_id: string;
    activity_type: ActivityType;
    description?: string;
    metadata: Record<string, any>;
    created_at: string;
    // Joined data
    user_info?: {
        id: string;
        full_name: string;
        email: string;
    };
}

export interface CRMEvent {
    id: string;
    lead_id?: string;
    user_id: string;
    title: string;
    description?: string;
    start_datetime: string;
    end_datetime?: string;
    event_type: EventType;
    status: EventStatus;
    created_at: string;
    updated_at: string;
    // Joined data
    lead_info?: {
        id: string;
        company_name: string;
        contact_person: string;
    };
}

export interface CRMNote {
    id: string;
    lead_id: string;
    user_id: string;
    note: string;
    created_at: string;
    // Joined data
    user_info?: {
        id: string;
        full_name: string;
        email: string;
    };
}

// ===========================================
// User Types
// ===========================================

export interface CRMUser {
    id: string;
    full_name: string;
    email: string;
    phone?: string;
    avatar_url?: string;
}

// ===========================================
// API Request/Response Types
// ===========================================

// Lead Filters
export interface LeadFilters {
    search?: string;
    status?: string[];
    priority?: LeadPriority[];
    assigned_to?: string[];
    property_interest?: string[];
    lead_source?: string[];
    date_from?: string;
    date_to?: string;
    is_archived?: boolean;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

// Lead Create/Update
export interface CreateLeadInput {
    company_name?: string;
    contact_person?: string;
    contact_number?: string;
    email?: string;
    location?: string;
    requirement?: string;
    property_interest?: string;
    lead_source?: string;
    deal_value?: number;
    status?: string;
    priority?: LeadPriority;
    next_followup_date?: string;
    remarks?: string;
    assigned_to?: string;
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
    is_archived?: boolean;
}

// Activity Create
export interface CreateActivityInput {
    lead_id: string;
    activity_type: ActivityType;
    description?: string;
    metadata?: Record<string, any>;
}

// Event Create/Update
export interface CreateEventInput {
    lead_id?: string;
    title: string;
    description?: string;
    start_datetime: string;
    end_datetime?: string;
    event_type: EventType;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
    status?: EventStatus;
}

// Note Create
export interface CreateNoteInput {
    lead_id: string;
    note: string;
}

// ===========================================
// Dashboard Types
// ===========================================

export interface CRMDashboardStats {
    assigned_leads: number;
    open_followups: number;
    meetings_today: number;
    proposals_pending: number;
    won_this_month: number;
    pipeline_value: number;
    target_achievement_percent: number;
    average_closure_time_days: number;
}

export interface CRMPerformanceStats {
    leads_contacted: number;
    calls_completed: number;
    meetings_conducted: number;
    site_visits: number;
    proposals_sent: number;
    closures: number;
    win_ratio: number;
    pipeline_value: number;
    revenue_closed: number;
    target_achievement: number;
}

export interface CRMAdminStats extends CRMPerformanceStats {
    property_wise_leads: {
        property_id: string;
        property_name: string;
        count: number;
        value: number;
    }[];
    lead_source_analytics: {
        source_id: string;
        source_name: string;
        count: number;
    }[];
    user_performance: {
        user_id: string;
        user_name: string;
        leads: number;
        meetings: number;
        closures: number;
        value: number;
    }[];
    territory_performance: {
        city: string;
        leads: number;
        value: number;
    }[];
}

// ===========================================
// Import Types
// ===========================================

export interface CSVImportResult {
    total_rows: number;
    success_count: number;
    error_count: number;
    errors: {
        row: number;
        field: string;
        message: string;
    }[];
    imported_leads: string[];
}

// ===========================================
// AI Insights Types
// ===========================================

export interface AILeadSummary {
    lead_id: string;
    last_interaction: string;
    current_status: string;
    pending_actions: string[];
    probability_of_closure: number;
}

export interface AITeamQuery {
    query: string;
    results: any;
}

// ===========================================
// Timeline Types
// ===========================================

export interface TimelineItem {
    id: string;
    type: 'activity' | 'note' | 'event' | 'status_change';
    timestamp: string;
    title: string;
    description?: string;
    icon: string;
    user?: {
        id: string;
        full_name: string;
    };
    metadata?: Record<string, any>;
}

// ===========================================
// Calendar Types
// ===========================================

export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end?: Date;
    type: EventType;
    status: EventStatus;
    lead_id?: string;
    lead_name?: string;
    color?: string;
}

// ===========================================
// Reports Types
// ===========================================

export interface ReportFilters {
    date_from?: string;
    date_to?: string;
    user_id?: string;
    territory?: string;
    property_id?: string;
    source_id?: string;
    status_id?: string;
}

export interface ReportData {
    type: 'user' | 'territory' | 'property' | 'source' | 'status' | 'revenue' | 'monthly_funnel' | 'quarterly_funnel';
    data: any;
    generated_at: string;
}
