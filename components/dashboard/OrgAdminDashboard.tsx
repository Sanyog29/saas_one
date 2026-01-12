'use client';

import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard, Building2, Users, Ticket, Settings, UserCircle,
    Search, Plus, Filter, Bell, LogOut, ChevronRight, MapPin, Edit, Trash2, X, Check, UsersRound,
    Coffee, IndianRupee, FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { HapticCard } from '@/components/ui/HapticCard';
import UserDirectory from './UserDirectory';
import SignOutModal from '@/components/ui/SignOutModal';
import AdminSPOCDashboard from '../tickets/AdminSPOCDashboard';

// Types
type Tab = 'overview' | 'properties' | 'requests' | 'users' | 'visitors' | 'cafeteria' | 'settings' | 'profile' | 'revenue';

interface Property {
    id: string;
    name: string;
    code: string;
    address: string;
    image_url?: string;
    created_at: string;
}

interface OrgUser {
    user_id: string;
    role?: string; // Org role
    is_active: boolean;
    user: {
        id: string;
        email: string;
        full_name: string;
    };
    propertyMemberships: {
        property_id: string;
        property_name?: string;
        role: string;
    }[];
}

interface Organization {
    id: string;
    name: string;
    code: string;
    logo_url?: string;
}

const OrgAdminDashboard = () => {
    const { user, signOut } = useAuth();
    const params = useParams();
    const router = useRouter();
    const orgSlugOrId = params?.orgId as string;

    // State
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [org, setOrg] = useState<Organization | null>(null);
    const [properties, setProperties] = useState<Property[]>([]);
    const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreatePropModal, setShowCreatePropModal] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | null>(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [selectedPropertyId, setSelectedPropertyId] = useState('all');

    // Derived state
    const activeProperty = selectedPropertyId === 'all'
        ? null
        : properties.find(p => p.id === selectedPropertyId);

    const supabase = createClient();

    useEffect(() => {
        if (orgSlugOrId) {
            fetchOrgDetails();
        }
    }, [orgSlugOrId]);

    useEffect(() => {
        if (org) {
            fetchProperties(); // ALWAYS fetch properties for the dropdown
            if (activeTab === 'users') fetchOrgUsers();
        }
    }, [activeTab, org]);

    const fetchOrgDetails = async () => {
        setIsLoading(true);
        setErrorMsg('');

        // 1. Decode URL param
        const decoded = decodeURIComponent(orgSlugOrId);

        // 2. Sanitize ID (Remove spaces/newlines that might have crept in)
        // This fixes the issue if the URL somehow looks like "uuid part 1 - uuid part 2"
        const cleanId = decoded.trim().replace(/\s+/g, '');

        console.log(`🔍 [Dashboard] Lookup Org ID: "${cleanId}" (Original: "${decoded}")`);

        // 3. Fetch strict by ID
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', cleanId)
            .is('deleted_at', null)
            .maybeSingle();

        if (error) {
            console.error('❌ [Dashboard] Supabase Error:', error);
            setErrorMsg(`Access Denied (403) or System Error. ID: ${cleanId}`);
        } else if (!data) {
            console.warn('⚠️ [Dashboard] Organization not found in DB.');
            setErrorMsg(`Organization not found. ID: ${cleanId}`);
        } else {
            console.log('✅ [Dashboard] Organization found:', data.name);
            setOrg(data);
        }
        setIsLoading(false);
    };

    const fetchProperties = async () => {
        if (!org) return;
        const { data, error } = await supabase
            .from('properties')
            .select('*')
            .eq('organization_id', org.id)
            .order('created_at', { ascending: false });

        if (!error && data) setProperties(data);
    };

    const fetchOrgUsers = async () => {
        if (!org) return;

        // 🔹 Step 1: Fetch ORG-level users
        const { data: orgUsers, error: orgError } = await supabase
            .from('organization_memberships')
            .select(`
                user_id,
                role,
                is_active,
                user:users (
                    id,
                    full_name,
                    email
                )
            `)
            .eq('organization_id', org.id)
            .eq('is_active', true);

        if (orgError) console.error('Error fetching org users:', orgError);

        // 🔹 Step 2: Fetch PROPERTY-level users for same org
        // 💡 !inner ensures only properties belonging to this org are included
        const { data: propertyUsers, error: propError } = await supabase
            .from('property_memberships')
            .select(`
                user_id,
                role,
                is_active,
                property:properties!inner (
                    id,
                    organization_id,
                    name
                ),
                user:users (
                    id,
                    full_name,
                    email
                )
            `)
            .eq('properties.organization_id', org.id)
            .eq('is_active', true);

        if (propError) console.error('Error fetching property users:', propError);

        // 🔹 Step 3: Merge + deduplicate users (CRITICAL)
        const userMap = new Map<string, OrgUser>();

        // Org users
        orgUsers?.forEach((row: any) => {
            userMap.set(row.user_id, {
                user_id: row.user_id,
                role: row.role,
                is_active: row.is_active,
                user: row.user,
                propertyMemberships: []
            });
        });

        // Property users
        propertyUsers?.forEach((row: any) => {
            const existing = userMap.get(row.user_id);

            if (existing) {
                existing.propertyMemberships.push({
                    property_id: row.property.id,
                    property_name: row.property.name,
                    role: row.role
                });
            } else {
                userMap.set(row.user_id, {
                    user_id: row.user_id,
                    role: undefined, // No org-level role
                    is_active: row.is_active,
                    user: row.user,
                    propertyMemberships: [{
                        property_id: row.property.id,
                        property_name: row.property.name,
                        role: row.role
                    }]
                });
            }
        });

        setOrgUsers(Array.from(userMap.values()));
    };

    const handleCreateProperty = async (propData: any) => {
        if (!org) return;
        const { error } = await supabase.from('properties').insert({
            ...propData,
            organization_id: org.id
        });
        if (!error) {
            fetchProperties();
            setShowCreatePropModal(false);
        } else {
            alert('Failed to create property: ' + error.message);
        }
    };

    const handleUpdateProperty = async (id: string, propData: any) => {
        const { error } = await supabase
            .from('properties')
            .update(propData)
            .eq('id', id);

        if (!error) {
            fetchProperties();
            setEditingProperty(null);
        } else {
            alert('Update failed: ' + error.message);
        }
    };

    const handleDeleteProperty = async (id: string) => {
        if (!confirm('Are you sure you want to delete this property? This cannot be undone.')) return;
        const { error } = await supabase
            .from('properties')
            .delete()
            .eq('id', id);

        if (!error) {
            fetchProperties();
        } else {
            alert('Delete failed: ' + error.message);
        }
    };

    const handleUpdateUser = async (userId: string, data: any) => {
        // Update user profile
        const { error: profileError } = await supabase
            .from('users')
            .update({
                full_name: data.full_name,
                phone: data.phone
            })
            .eq('id', userId);

        if (profileError) {
            alert('Failed to update profile: ' + profileError.message);
            return;
        }

        // Update org role if exists
        if (data.orgRole) {
            await supabase
                .from('organization_memberships')
                .update({ role: data.orgRole })
                .eq('user_id', userId)
                .eq('organization_id', org?.id);
        }

        fetchOrgUsers();
        setEditingUser(null);
        setShowUserModal(false);
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Remove this user from the organization?')) return;

        // Remove from org memberships
        await supabase
            .from('organization_memberships')
            .delete()
            .eq('user_id', userId)
            .eq('organization_id', org?.id);

        // Remove from property memberships
        await supabase
            .from('property_memberships')
            .delete()
            .eq('user_id', userId)
            .eq('organization_id', org?.id);

        fetchOrgUsers();
    };


    if (!org && !isLoading) return (
        <div className="p-10 text-center">
            <h2 className="text-xl font-bold text-red-600">Error Loading Dashboard</h2>
            <p className="text-slate-600 mt-2">{errorMsg || 'Organization not found.'}</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F8F9FC] flex font-inter text-slate-900">
            {/* Sidebar */}
            <aside className="w-72 bg-white border-r border-slate-100 flex flex-col fixed h-full z-10 transition-all duration-300">
                <div className="p-8 pb-4">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-slate-200">
                            {org?.name?.substring(0, 1) || 'O'}
                        </div>
                        <div>
                            <h2 className="font-bold text-sm leading-tight text-slate-900 truncate max-w-[150px]">{org?.name || 'Organization'}</h2>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Super Admin Console</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-4 overflow-y-auto">
                    {/* Core Operations */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-blue-500 rounded-full"></span>
                            Core Operations
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm ${activeTab === 'overview'
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                Dashboard
                            </button>
                            <button
                                onClick={() => setActiveTab('requests')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm ${activeTab === 'requests'
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <Ticket className="w-4 h-4" />
                                Requests
                            </button>
                        </div>
                    </div>

                    {/* Management Hub */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-blue-500 rounded-full"></span>
                            Management Hub
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => setActiveTab('users')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm ${activeTab === 'users'
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <Users className="w-4 h-4" />
                                User Management
                            </button>
                            <button
                                onClick={() => setActiveTab('properties')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm ${activeTab === 'properties'
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <Building2 className="w-4 h-4" />
                                Property Management
                            </button>
                            <button
                                onClick={() => setActiveTab('visitors')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm ${activeTab === 'visitors'
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <UsersRound className="w-4 h-4" />
                                Visitor Management
                            </button>
                            <button
                                onClick={() => setActiveTab('revenue')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm ${activeTab === 'revenue'
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <IndianRupee className="w-4 h-4" />
                                Cafeteria Revenue
                            </button>
                        </div>
                    </div>

                    {/* System & Personal */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-blue-500 rounded-full"></span>
                            System & Personal
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => setActiveTab('settings')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm ${activeTab === 'settings'
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <Settings className="w-4 h-4" />
                                Settings
                            </button>
                        </div>
                    </div>
                </nav>

                <div className="pt-6 border-t border-slate-100 p-6">
                    {/* User Profile Section */}
                    <div className="flex items-center gap-3 px-2 mb-6">
                        <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-slate-200">
                            {user?.email?.[0].toUpperCase() || 'O'}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="font-bold text-sm text-slate-900 truncate">
                                {user?.user_metadata?.full_name || 'Super Admin'}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate font-medium">
                                {user?.email}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowSignOutModal(true)}
                        className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl w-full transition-all duration-200 text-sm font-bold group"
                    >
                        <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        Sign Out
                    </button>
                </div>
            </aside>

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />

            {/* Main Content */}
            <main className={`flex-1 ml-72 overflow-y-auto min-h-screen ${activeTab === 'overview' ? '' : 'p-8 lg:p-12'}`}>
                {/* Only show header for non-overview tabs */}
                {activeTab !== 'overview' && (
                    <header className="flex justify-between items-center mb-10">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight capitalize">{activeTab}</h1>
                            <p className="text-slate-500 text-sm font-medium mt-1">Manage your organization's resources.</p>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Property Selector for Requests/Other tabs */}
                            {properties.length > 0 && (
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                                    <Building2 className="w-4 h-4 text-slate-400" />
                                    <select
                                        className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer"
                                        value={selectedPropertyId}
                                        onChange={(e) => setSelectedPropertyId(e.target.value)}
                                    >
                                        <option value="all">All Properties</option>
                                        {properties.map(prop => (
                                            <option key={prop.id} value={prop.id}>{prop.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="hidden md:flex flex-col items-end">
                                <span className="text-sm font-black text-slate-900 tracking-tight">System Status</span>
                                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Online</span>
                            </div>
                        </div>
                    </header>
                )}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeTab === 'overview' && (
                            <OverviewTab
                                properties={properties}
                                orgId={org?.id || ''}
                                selectedPropertyId={selectedPropertyId}
                                setSelectedPropertyId={setSelectedPropertyId}
                            />
                        )}
                        {activeTab === 'revenue' && <RevenueTab properties={properties} />}
                        {activeTab === 'properties' && (
                            <PropertiesTab
                                properties={properties}
                                onCreate={() => setShowCreatePropModal(true)}
                                onEdit={(p: any) => setEditingProperty(p)}
                                onDelete={handleDeleteProperty}
                            />
                        )}
                        {activeTab === 'requests' && (
                            <div className="h-full">
                                <AdminSPOCDashboard
                                    organizationId={org?.id || ''}
                                    propertyId={selectedPropertyId === 'all' ? undefined : selectedPropertyId}
                                    propertyName={selectedPropertyId === 'all' ? 'All Properties' : activeProperty?.name}
                                    adminUser={{
                                        full_name: user?.user_metadata?.full_name || 'Super Admin',
                                        avatar_url: '' // Add avatar if available
                                    }}
                                />
                            </div>
                        )}
                        {activeTab === 'users' && (
                            <UserDirectory
                                orgId={org?.id}
                                properties={properties.map(p => ({ id: p.id, name: p.name }))}
                                onUserUpdated={fetchOrgUsers}
                            />
                        )}
                        {activeTab === 'visitors' && <VisitorsTab properties={properties} />}
                        {activeTab === 'cafeteria' && (
                            <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center shadow-sm">
                                <Coffee className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Cafeteria Management</h3>
                                <p className="text-slate-500">Cafeteria management module coming soon.</p>
                            </div>
                        )}
                        {activeTab === 'settings' && (
                            <ProfileSettingsTab user={user} supabase={supabase} />
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Modals */}
            {
                (showCreatePropModal || editingProperty) && (
                    <PropertyModal
                        property={editingProperty}
                        onClose={() => { setShowCreatePropModal(false); setEditingProperty(null); }}
                        onSave={editingProperty ? (data: any) => handleUpdateProperty(editingProperty.id, data) : handleCreateProperty}
                    />
                )
            }

            {
                showUserModal && (
                    <UserModal
                        user={editingUser}
                        onClose={() => { setShowUserModal(false); setEditingUser(null); }}
                        onSave={(data: any) => editingUser && handleUpdateUser(editingUser.user_id, data)}
                    />
                )
            }
        </div >
    );
};

// Sub-components
const OverviewTab = ({
    properties,
    orgId,
    selectedPropertyId,
    setSelectedPropertyId
}: {
    properties: Property[],
    orgId: string,
    selectedPropertyId: string,
    setSelectedPropertyId: (id: string) => void
}) => {
    const [isLoading, setIsLoading] = useState(true);

    // Real data from org APIs
    const [ticketSummary, setTicketSummary] = useState({
        total_tickets: 0,
        open_tickets: 0,
        in_progress: 0,
        resolved: 0,
        sla_breached: 0,
        avg_resolution_hours: 0,
    });

    const [dieselSummary, setDieselSummary] = useState({
        total_consumption: 0,
        change_percentage: 0,
        properties: [] as any[],
    });

    const [vmsSummary, setVmsSummary] = useState({
        total_visitors_today: 0,
        checked_in: 0,
        checked_out: 0,
    });

    const [vendorSummary, setVendorSummary] = useState({
        total_revenue: 0,
        total_commission: 0,
        total_vendors: 0,
    });

    // Fetch all org summaries
    useEffect(() => {
        if (!orgId) return;

        const fetchSummaries = async () => {
            setIsLoading(true);

            try {
                // Tickets summary
                const ticketsRes = await fetch(`/api/organizations/${orgId}/tickets-summary?period=month`);
                if (ticketsRes.ok) {
                    const data = await ticketsRes.json();
                    setTicketSummary(data);
                }

                // Diesel summary
                const dieselRes = await fetch(`/api/organizations/${orgId}/diesel-summary?period=month`);
                if (dieselRes.ok) {
                    const data = await dieselRes.json();
                    setDieselSummary({
                        total_consumption: data.total_consumption || 0,
                        change_percentage: data.change_percentage || 0,
                        properties: data.properties || [],
                    });
                }

                // VMS summary
                const vmsRes = await fetch(`/api/organizations/${orgId}/vms-summary?period=today`);
                if (vmsRes.ok) {
                    const data = await vmsRes.json();
                    setVmsSummary({
                        total_visitors_today: data.total_visitors || 0,
                        checked_in: data.checked_in || 0,
                        checked_out: data.checked_out || 0,
                    });
                }

                // Vendor summary
                const vendorRes = await fetch(`/api/organizations/${orgId}/vendor-summary?period=month`);
                if (vendorRes.ok) {
                    const data = await vendorRes.json();
                    setVendorSummary({
                        total_revenue: data.total_revenue || 0,
                        total_commission: data.total_commission || 0,
                        total_vendors: data.total_vendors || 0,
                    });
                }
            } catch (error) {
                console.error('Error fetching org summaries:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSummaries();
    }, [orgId]);

    const activeProperty = selectedPropertyId === 'all'
        ? null
        : properties.find(p => p.id === selectedPropertyId);

    // Calculated metrics
    const completionRate = ticketSummary.total_tickets > 0
        ? Math.round((ticketSummary.resolved / ticketSummary.total_tickets) * 100 * 10) / 10
        : 0;

    return (
        <div className="min-h-screen">
            {/* Header Section */}
            <div className="bg-slate-900 px-8 lg:px-12 py-8 rounded-b-[40px]">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-black text-white">Unified Dashboard</h1>
                        <select
                            className="bg-slate-800 text-white text-sm font-bold px-4 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                            value={selectedPropertyId}
                            onChange={(e) => setSelectedPropertyId(e.target.value)}
                        >
                            <option value="all">All Properties</option>
                            {properties.map(prop => (
                                <option key={prop.id} value={prop.id}>{prop.name}</option>
                            ))}
                        </select>
                        <span className="bg-slate-700 text-white text-xs font-bold px-3 py-1 rounded-lg">
                            {selectedPropertyId === 'all' ? properties.length : 1}
                        </span>
                    </div>
                    <div className="flex items-center gap-6">
                        <Search className="w-6 h-6 text-slate-400 cursor-pointer hover:text-white transition-colors" />
                    </div>
                </div>

                {/* Breadcrumb */}
                <div className="flex items-center gap-2 mb-6">
                    <span className="text-yellow-400 text-sm font-bold">Dashboard /Home</span>
                </div>

                {/* KPI Cards Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {/* Active Requests */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                        <div className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Open Tickets</div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-green-400">{ticketSummary.open_tickets + ticketSummary.in_progress}</span>
                            <span className="text-xs text-white/60 font-bold">{ticketSummary.sla_breached} SLA breached</span>
                        </div>
                    </div>

                    {/* Resolved */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                        <div className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Resolved</div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white">{ticketSummary.resolved}</span>
                            <span className="text-xs text-white/60 font-bold">Avg {ticketSummary.avg_resolution_hours}h resolution</span>
                        </div>
                    </div>

                    {/* Completion Rate */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                        <div className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Completion Rate</div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white">{completionRate}%</span>
                            <span className="text-xs text-white/60 font-bold">{ticketSummary.resolved} of {ticketSummary.total_tickets} closed</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid - with padding */}
            <div className="px-8 lg:px-12 py-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Diesel Consumption */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black text-slate-900">Diesel Consumption</h3>
                            </div>
                            <div className="text-amber-500 text-xs font-bold mb-4">This Month</div>

                            {/* Gauge Placeholder */}
                            <div className="flex justify-center mb-4">
                                <div className="w-24 h-24 rounded-full border-8 border-amber-400 border-t-transparent flex items-center justify-center">
                                    <span className="text-lg font-black text-slate-900">{dieselSummary.total_consumption}</span>
                                </div>
                            </div>

                            <div className="text-slate-400 text-xs font-bold mb-1">Total consumption</div>
                            <div className="text-3xl font-black text-slate-900 mb-1">{dieselSummary.total_consumption.toLocaleString()} L</div>
                            <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm ${dieselSummary.change_percentage >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {dieselSummary.change_percentage >= 0 ? '+' : ''}{dieselSummary.change_percentage}%
                                </span>
                            </div>
                        </div>

                        {/* Vendor Revenue */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-2">Vendor Revenue</h3>
                            <div className="text-slate-400 text-xs font-bold mb-2">This Month</div>
                            <div className="text-3xl font-black text-slate-900">₹ {vendorSummary.total_revenue.toLocaleString()}</div>
                            <div className="text-xs text-slate-500 mt-2">
                                Commission: ₹ {vendorSummary.total_commission.toLocaleString()} from {vendorSummary.total_vendors} vendors
                            </div>
                        </div>
                    </div>

                    {/* Center Column - Property Card */}
                    <div className="lg:col-span-4">
                        <div className="bg-yellow-400 rounded-3xl p-6 h-full relative overflow-hidden">
                            <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center text-white font-bold text-sm">
                                {properties.length}
                            </div>

                            <h3 className="text-2xl font-black text-slate-900 mb-2 truncate">
                                {activeProperty ? activeProperty.name : 'All Properties'}
                            </h3>
                            <div className="text-red-600 text-sm font-bold mb-6 truncate">
                                {activeProperty ? `Property: ${activeProperty.code}` : 'Multi-Property View'}
                            </div>

                            {/* Building Image Placeholder */}
                            <div className="bg-yellow-500/50 rounded-2xl h-40 mb-6 flex items-center justify-center">
                                <Building2 className="w-16 h-16 text-yellow-600" />
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="text-slate-700 text-xs font-bold">Visitors Today</div>
                                    <div className="text-2xl font-black text-slate-900">{vmsSummary.total_visitors_today}</div>
                                </div>
                                <div>
                                    <div className="text-slate-700 text-xs font-bold">Checked In / Out</div>
                                    <div className="text-2xl font-black text-slate-900">{vmsSummary.checked_in} / {vmsSummary.checked_out}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* Property Breakdown */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-4">Tickets by Property</h3>
                            <div className="space-y-3 max-h-48 overflow-y-auto">
                                {(ticketSummary as any).properties?.slice(0, 5).map((prop: any, idx: number) => (
                                    <div key={prop.property_id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                        <div>
                                            <div className="font-bold text-slate-900 text-sm">{prop.property_name}</div>
                                            <div className="text-xs text-slate-500">{prop.open} open · {prop.resolved} resolved</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-slate-900">{prop.total}</div>
                                            <div className="text-xs text-slate-400">total</div>
                                        </div>
                                    </div>
                                ))}
                                {!(ticketSummary as any).properties?.length && (
                                    <div className="text-center text-slate-400 py-4">No ticket data available</div>
                                )}
                            </div>
                        </div>

                        {/* Module Summary */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-4">Module Summary</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-blue-50 rounded-xl">
                                    <div className="text-xs font-bold text-blue-600 mb-1">Tickets</div>
                                    <div className="text-2xl font-black text-blue-900">{ticketSummary.total_tickets}</div>
                                </div>
                                <div className="p-4 bg-emerald-50 rounded-xl">
                                    <div className="text-xs font-bold text-emerald-600 mb-1">Visitors</div>
                                    <div className="text-2xl font-black text-emerald-900">{vmsSummary.total_visitors_today}</div>
                                </div>
                                <div className="p-4 bg-amber-50 rounded-xl">
                                    <div className="text-xs font-bold text-amber-600 mb-1">Diesel (L)</div>
                                    <div className="text-2xl font-black text-amber-900">{dieselSummary.total_consumption}</div>
                                </div>
                                <div className="p-4 bg-purple-50 rounded-xl">
                                    <div className="text-xs font-bold text-purple-600 mb-1">Vendors</div>
                                    <div className="text-2xl font-black text-purple-900">{vendorSummary.total_vendors}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


        </div>
    );
};

const PropertiesTab = ({ properties, onCreate, onEdit, onDelete }: any) => (
    <div className="space-y-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search properties..."
                    className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-100 w-64"
                />
            </div>
            <button
                onClick={onCreate}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
            >
                <Plus className="w-4 h-4" /> Add Property
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((prop: any) => (
                <div key={prop.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group relative overflow-hidden">
                    <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 transition-transform group-hover:scale-110">
                            <Building2 className="w-6 h-6" />
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onEdit(prop)} className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                                <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => onDelete(prop.id)} className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">{prop.name}</h3>
                    <div className="flex items-center gap-1 text-slate-400 text-xs font-medium mb-6">
                        <MapPin className="w-3 h-3" />
                        {prop.address || 'No address provided'}
                    </div>
                    <button className="w-full py-3 border border-slate-100 text-slate-600 font-bold rounded-xl text-xs hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all">
                        Manage Property
                    </button>
                </div>
            ))}
        </div>
    </div>
);

const UsersTab = ({ users, orgId, allProperties, onEdit, onDelete }: any) => (
    <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h3 className="font-black text-slate-900">User Directory</h3>
            <div className="flex gap-2">
                <button className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:text-slate-900 transition-colors">
                    <Filter className="w-4 h-4" />
                </button>
            </div>
        </div>
        <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Role</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Properties</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {users.map((u: any) => (
                    <tr key={`${u.user_id}-${orgId}`} className="hover:bg-slate-50/30 transition-colors group">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-xs">
                                    {u.user?.full_name?.substring(0, 1) || 'U'}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-900 text-sm">{u.user?.full_name || 'Unknown'}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">{u.user?.email}</p>
                                </div>
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            {u.role ? (
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide ${u.role === 'org_super_admin' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-900 text-white'
                                    }`}>
                                    {u.role?.replace(/_/g, ' ')}
                                </span>
                            ) : u.propertyMemberships?.[0] ? (
                                <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-indigo-50 text-indigo-600 border border-indigo-100">
                                    {u.propertyMemberships[0].role?.replace(/_/g, ' ')}
                                </span>
                            ) : (
                                <span className="text-[10px] font-bold text-slate-400 italic uppercase tracking-wider">
                                    No Assignment
                                </span>
                            )}
                        </td>
                        <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                                {u.role === 'org_super_admin' ? (
                                    // Super Admins see all properties
                                    allProperties.map((p: any) => (
                                        <div key={p.id} className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-[9px] font-black border border-emerald-100 flex items-center gap-1">
                                            <Building2 className="w-3 h-3" />
                                            {p.name}
                                            <span className="opacity-50 text-[8px] tracking-tighter ml-1 font-bold">ALL ACCESS</span>
                                        </div>
                                    ))
                                ) : (
                                    // Others see assigned properties with their specific roles
                                    u.propertyMemberships?.map((pm: any) => (
                                        <div key={pm.property_id} className="bg-slate-50 text-slate-600 px-2 py-1 rounded-md text-[9px] font-black border border-slate-100 flex items-center gap-1 group/chip hover:bg-white transition-colors">
                                            <Building2 className="w-3 h-3 text-slate-400" />
                                            {pm.property_name}
                                            <span className="bg-slate-200 text-slate-500 px-1 py-0.5 rounded text-[8px] ml-1 uppercase letter-spacing-tight">
                                                {pm.role?.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    ))
                                )}
                                {u.role !== 'org_super_admin' && (!u.propertyMemberships || u.propertyMemberships.length === 0) && (
                                    <span className="text-slate-300 text-[10px] italic">No directly assigned properties</span>
                                )}
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                                <button onClick={() => onEdit(u)} className="p-2 text-slate-400 hover:text-emerald-600 transition-colors">
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => onDelete(u.user_id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const PropertyModal = ({ property, onClose, onSave }: any) => {
    const [name, setName] = useState(property?.name || '');
    const [code, setCode] = useState(property?.code || '');
    const [address, setAddress] = useState(property?.address || '');

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl relative overflow-hidden"
            >
                <button onClick={onClose} className="absolute right-6 top-6 text-slate-300 hover:text-slate-900 transition-colors">
                    <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 leading-tight">
                            {property ? 'Edit Property' : 'Add Property'}
                        </h3>
                        <p className="text-slate-400 text-sm font-medium">Define your physical asset details.</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Property Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all" placeholder="e.g. Skyline Towers" />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Property Code</label>
                        <input type="text" value={code} onChange={e => setCode(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all" placeholder="e.g. SKY-01" />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Address</label>
                        <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all" placeholder="123 Main St, City" />
                    </div>

                    <div className="flex gap-3 mt-8">
                        <button onClick={onClose} className="flex-1 py-4 font-black text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors uppercase text-xs tracking-widest">Cancel</button>
                        <button onClick={() => onSave({ name, code, address })} className="flex-1 py-4 font-black text-white bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200 uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                            <Check className="w-4 h-4" /> {property ? 'Update' : 'Create'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

const UserModal = ({ user, onClose, onSave }: any) => {
    const [fullName, setFullName] = useState(user?.user?.full_name || '');
    const [phone, setPhone] = useState(user?.user?.phone || '');
    const [orgRole, setOrgRole] = useState(user?.role || 'org_admin');

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl relative"
            >
                <button onClick={onClose} className="absolute right-6 top-6 text-slate-300 hover:text-slate-900 transition-colors">
                    <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 leading-tight">Edit User</h3>
                        <p className="text-slate-400 text-sm font-medium">{user?.user?.email}</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Full Name</label>
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Phone Number</label>
                        <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Organization Role</label>
                        <select value={orgRole} onChange={e => setOrgRole(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100 appearance-none">
                            <option value="org_super_admin">Super Admin</option>
                            <option value="org_admin">Admin</option>
                        </select>
                    </div>

                    <div className="flex gap-3 mt-8">
                        <button onClick={onClose} className="flex-1 py-4 font-black text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors uppercase text-xs tracking-widest">Cancel</button>
                        <button onClick={() => onSave({ full_name: fullName, phone, orgRole })} className="flex-1 py-4 font-black text-white bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors uppercase text-xs tracking-widest">
                            Save Changes
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

const RevenueTab = ({ properties }: { properties: any[] }) => {
    const [vendors, setVendors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedProperty, setSelectedProperty] = useState('all');
    const supabase = createClient();

    useEffect(() => {
        fetchRevenueData();
    }, [selectedProperty]);

    const fetchRevenueData = async () => {
        setIsLoading(true);
        try {
            let query = supabase.from('vendors').select('*, properties(name), vendor_daily_revenue(*)');
            if (selectedProperty !== 'all') {
                query = query.eq('property_id', selectedProperty);
            }
            const { data, error } = await query;
            if (error) throw error;
            setVendors(data || []);
        } catch (err) {
            console.error('Error fetching revenue:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportAll = () => {
        const headers = ['Property', 'Shop Name', 'Owner', 'Commission %', 'Revenue', 'Commission Due'];
        const rows = vendors.map(v => {
            const rev = v.vendor_daily_revenue?.reduce((sum: number, r: any) => sum + r.revenue_amount, 0) || 0;
            const comm = (rev * (v.commission_rate / 100)).toFixed(2);
            return [v.properties?.name, v.shop_name, v.owner_name, v.commission_rate + '%', rev, comm];
        });

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `organization_revenue_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isLoading) return <div className="p-12 text-center text-slate-400 font-bold italic">Gathering intelligence...</div>;

    const totalRevenue = vendors.reduce((acc, v) => acc + (v.vendor_daily_revenue?.reduce((sum: number, r: any) => sum + r.revenue_amount, 0) || 0), 0);
    const totalCommission = vendors.reduce((acc, v) => {
        const rev = v.vendor_daily_revenue?.reduce((sum: number, r: any) => sum + r.revenue_amount, 0) || 0;
        return acc + (rev * (v.commission_rate / 100));
    }, 0);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-black text-slate-900 leading-tight">Revenue Analytics</h2>
                    <p className="text-slate-500 text-sm font-medium">Cross-property financial oversight.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                        value={selectedProperty}
                        onChange={(e) => setSelectedProperty(e.target.value)}
                        className="flex-1 md:flex-none p-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-black text-slate-900 text-xs focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                        <option value="all">All Properties</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button
                        onClick={handleExportAll}
                        className="p-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs hover:bg-slate-800 transition-all flex items-center gap-2"
                    >
                        <FileDown className="w-4 h-4" /> Export All
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Revenue</p>
                    <p className="text-3xl font-black text-slate-900 relative z-10">₹{totalRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50/50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Commission</p>
                    <p className="text-3xl font-black text-emerald-600 relative z-10">₹{totalCommission.toLocaleString()}</p>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50/50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Vendors</p>
                    <p className="text-3xl font-black text-slate-900 relative z-10">{vendors.length}</p>
                </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Property / Shop</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Comm %</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Revenue</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Commission</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {vendors.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-16 text-center text-slate-400 font-bold italic">No vendor data available.</td>
                                </tr>
                            ) : (
                                vendors.map((v) => {
                                    const rev = v.vendor_daily_revenue?.reduce((sum: number, r: any) => sum + r.revenue_amount, 0) || 0;
                                    const comm = rev * (v.commission_rate / 100);
                                    return (
                                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-8 py-6">
                                                <div>
                                                    <p className="font-black text-slate-900 text-sm group-hover:text-blue-600 transition-colors uppercase tracking-tight">{v.shop_name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{v.properties?.name}</p>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-sm font-bold text-slate-600">{v.owner_name}</td>
                                            <td className="px-8 py-6 text-center">
                                                <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-wider">{v.commission_rate}%</span>
                                            </td>
                                            <td className="px-8 py-6 text-right font-black text-sm text-slate-900">₹{rev.toLocaleString()}</td>
                                            <td className="px-8 py-6 text-right font-black text-sm text-emerald-600">₹{comm.toLocaleString()}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const VisitorsTab = ({ properties }: { properties: any[] }) => {
    const [visitors, setVisitors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedProperty, setSelectedProperty] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const supabase = createClient();

    useEffect(() => {
        fetchVisitors();
    }, [selectedProperty]);

    const fetchVisitors = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('visitor_logs')
                .select('*, properties(name)')
                .order('checkin_time', { ascending: false });

            if (selectedProperty !== 'all') {
                query = query.eq('property_id', selectedProperty);
            }

            const { data, error } = await query;
            if (error) throw error;
            setVisitors(data || []);
        } catch (err) {
            console.error('Error fetching visitors:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredVisitors = visitors.filter(v =>
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.visitor_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.mobile && v.mobile.includes(searchTerm))
    );

    const handleExport = () => {
        const headers = ['Visitor ID', 'Property', 'Name', 'Mobile', 'Category', 'Host', 'Check In', 'Status'];
        const rows = filteredVisitors.map(v => [
            v.visitor_id,
            v.properties?.name || 'Unknown',
            v.name,
            v.mobile || '-',
            v.category,
            v.whom_to_meet,
            new Date(v.checkin_time).toLocaleString(),
            v.status
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "visitor_logs.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-black text-slate-900 leading-tight">Visitor Management</h2>
                    <p className="text-slate-500 text-sm font-medium">Track and manage visitors across all properties.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search visitors..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        />
                    </div>
                    <select
                        value={selectedProperty}
                        onChange={(e) => setSelectedProperty(e.target.value)}
                        className="p-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100"
                    >
                        <option value="all">All Properties</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button
                        onClick={handleExport}
                        className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-colors"
                    >
                        <FileDown className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Visitor Info</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Property</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Host / Purpose</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timing</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {isLoading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading visitors...</td></tr>
                            ) : filteredVisitors.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400">No visitors found matching your criteria.</td></tr>
                            ) : (
                                filteredVisitors.map((visitor) => (
                                    <tr key={visitor.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                                    {visitor.name?.[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{visitor.name}</div>
                                                    <div className="text-xs text-slate-500 font-medium">{visitor.mobile || 'No mobile'}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{visitor.visitor_id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-sm font-bold text-slate-700">{visitor.properties?.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-slate-900">{visitor.whom_to_meet}</div>
                                            <div className="text-xs text-slate-500 capitalize">{visitor.category}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-bold text-slate-900">
                                                In: {new Date(visitor.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            {visitor.checkout_time && (
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Out: {new Date(visitor.checkout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${visitor.status === 'checked_in'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {visitor.status === 'checked_in' ? 'On Premise' : 'Checked Out'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// Profile Settings Tab Component
type SettingsTabKey = 'basic' | 'notifications' | 'emergency' | 'advanced';

const ProfileSettingsTab = ({ user, supabase }: { user: any; supabase: any }) => {
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>('basic');
    const [saving, setSaving] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        officeNumber: '',
        department: 'administration',
        floor: '',
        zone: '',
        staffRoleReason: '',
    });

    const DEPARTMENT_OPTIONS = [
        { value: 'administration', label: 'Administration' },
        { value: 'operations', label: 'Operations' },
        { value: 'maintenance', label: 'Maintenance' },
        { value: 'security', label: 'Security' },
        { value: 'finance', label: 'Finance' },
        { value: 'hr', label: 'Human Resources' },
        { value: 'it', label: 'IT' },
    ];

    const SETTINGS_TABS = [
        { key: 'basic' as const, label: 'Basic', icon: UserCircle },
        { key: 'notifications' as const, label: 'Notifications', icon: Bell },
        { key: 'emergency' as const, label: 'Emergency', icon: X },
        { key: 'advanced' as const, label: 'Advanced', icon: Settings },
    ];

    useEffect(() => {
        const loadProfile = async () => {
            if (!user) return;

            try {
                const { data: profile, error } = await supabase
                    .from('users')
                    .select('id, full_name, email, created_at')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.log('Profile not found, using auth user data');
                    setFormData(prev => ({
                        ...prev,
                        email: user.email || '',
                        firstName: user.user_metadata?.full_name?.split(' ')[0] || '',
                        lastName: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
                    }));
                    return;
                }

                if (profile) {
                    setUserProfile(profile);
                    const nameParts = (profile.full_name || '').split(' ');
                    setFormData(prev => ({
                        ...prev,
                        firstName: nameParts[0] || '',
                        lastName: nameParts.slice(1).join(' ') || '',
                        email: profile.email || user.email || '',
                    }));
                }
            } catch (err) {
                console.error('Error loading profile:', err);
                // Fallback to auth user data
                setFormData(prev => ({
                    ...prev,
                    email: user.email || '',
                    firstName: user.user_metadata?.full_name?.split(' ')[0] || '',
                    lastName: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
                }));
            }
        };

        loadProfile();
    }, [user, supabase]);

    const handleSaveChanges = async () => {
        if (!user) return;
        setSaving(true);

        try {
            // Only update fields that exist in the users table
            const { error } = await supabase
                .from('users')
                .update({
                    full_name: `${formData.firstName} ${formData.lastName}`.trim(),
                })
                .eq('id', user.id);

            if (error) {
                console.error('Error updating profile:', error);
                alert('Failed to save changes: ' + error.message);
            } else {
                alert('Profile saved successfully!');
            }
        } catch (err) {
            console.error('Error saving changes:', err);
            alert('An error occurred while saving.');
        } finally {
            setSaving(false);
        }
    };

    const SettingsInput = ({
        label,
        value,
        onChange,
        placeholder,
        disabled = false,
        helperText,
    }: {
        label: string;
        value: string;
        onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
        placeholder?: string;
        disabled?: boolean;
        helperText?: string;
    }) => (
        <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-700 font-bold">{label}</label>
            <input
                type="text"
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                className={`
                    w-full px-4 py-3 rounded-xl 
                    bg-slate-50 border border-slate-200
                    text-slate-900 placeholder:text-slate-400
                    focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20
                    transition-all duration-200
                    ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''}
                `}
            />
            {helperText && (
                <p className="text-xs text-slate-500">{helperText}</p>
            )}
        </div>
    );

    return (
        <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-8">
                {/* Tabs */}
                <div className="flex gap-2 mb-8 bg-slate-100 p-1.5 rounded-xl w-fit">
                    {SETTINGS_TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeSettingsTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveSettingsTab(tab.key)}
                                className={`
                                    flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm
                                    transition-all duration-200
                                    ${isActive
                                        ? 'bg-yellow-400 text-slate-900 shadow-lg shadow-yellow-400/25'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-white'
                                    }
                                `}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                {activeSettingsTab === 'basic' && (
                    <div className="space-y-6 max-w-3xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <SettingsInput
                                label="First Name"
                                value={formData.firstName}
                                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                placeholder="Enter first name"
                            />
                            <SettingsInput
                                label="Last Name"
                                value={formData.lastName}
                                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                placeholder="Enter last name"
                            />
                        </div>

                        <SettingsInput
                            label="Email"
                            value={formData.email}
                            disabled
                            helperText="Email cannot be changed. Contact support for assistance."
                        />

                        {/* Save Button */}
                        <button
                            onClick={handleSaveChanges}
                            disabled={saving}
                            className="
                                w-full py-4 rounded-xl font-black text-slate-900 uppercase tracking-widest text-sm
                                bg-yellow-400
                                hover:bg-yellow-300
                                shadow-lg shadow-yellow-400/25
                                transition-all duration-200
                                disabled:opacity-50 disabled:cursor-not-allowed
                            "
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>

                        {/* Request Staff Role Section */}
                        <div className="mt-10 pt-8 border-t border-slate-200">
                            <h2 className="text-lg font-black text-slate-900 mb-2">
                                Request Staff Role
                            </h2>
                            <p className="text-sm text-slate-500 mb-6">
                                Submit a request to become a staff member. Your request will be reviewed by an administrator.
                            </p>

                            <div className="flex flex-col gap-2 mb-4">
                                <label className="text-sm text-slate-700 font-bold">Reason for Request</label>
                                <textarea
                                    value={formData.staffRoleReason}
                                    onChange={(e) => setFormData(prev => ({ ...prev, staffRoleReason: e.target.value }))}
                                    placeholder="Explain why you would like to become a staff member..."
                                    rows={4}
                                    className="
                                        w-full px-4 py-3 rounded-xl 
                                        bg-slate-50 border border-slate-200
                                        text-slate-900 placeholder:text-slate-400
                                        focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20
                                        transition-all duration-200 resize-none
                                    "
                                />
                            </div>

                            <button
                                disabled={!formData.staffRoleReason.trim()}
                                className="
                                    px-6 py-3 rounded-xl font-bold text-sm
                                    bg-slate-900 text-white
                                    hover:bg-slate-800
                                    transition-all duration-200
                                    disabled:opacity-50 disabled:cursor-not-allowed
                                "
                            >
                                Submit Request
                            </button>
                        </div>

                        {/* Role Info Card */}
                        {userProfile && (
                            <div className="mt-8 p-6 rounded-2xl bg-yellow-50 border border-yellow-200">
                                <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4">
                                    Your Role Information
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Role</p>
                                        <p className="text-sm font-bold text-slate-900 capitalize">
                                            {userProfile.role_key?.replace(/_/g, ' ') || 'User'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Status</p>
                                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${userProfile.status === 'active'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {userProfile.status || 'Pending'}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Role Level</p>
                                        <p className="text-sm font-bold text-slate-900">
                                            Level {userProfile.role_level ?? 0}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Member Since</p>
                                        <p className="text-sm font-bold text-slate-900">
                                            {userProfile.created_at
                                                ? new Date(userProfile.created_at).toLocaleDateString()
                                                : 'N/A'
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeSettingsTab === 'notifications' && (
                    <div className="text-center py-16">
                        <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Notification Preferences</h3>
                        <p className="text-slate-500">Configure your notification settings here.</p>
                    </div>
                )}

                {activeSettingsTab === 'emergency' && (
                    <div className="text-center py-16">
                        <X className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Emergency Contacts</h3>
                        <p className="text-slate-500">Add and manage your emergency contact information.</p>
                    </div>
                )}

                {activeSettingsTab === 'advanced' && (
                    <div className="text-center py-16">
                        <Settings className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Advanced Settings</h3>
                        <p className="text-slate-500">Configure advanced account settings.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrgAdminDashboard;
