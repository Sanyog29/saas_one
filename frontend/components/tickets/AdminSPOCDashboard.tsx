'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, RefreshCw, ChevronDown, User, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useDataCache } from '@/frontend/context/DataCacheContext';
import Skeleton from '@/frontend/components/ui/Skeleton';

interface Ticket {
    id: string;
    ticket_number: string;
    title: string;
    status: string;
    priority: string;
    sla_deadline: string | null;
    sla_breached: boolean;
    sla_paused: boolean;
    confidence_score: number;
    is_vague: boolean;
    category?: { id: string; name: string };
    assignee?: { full_name: string };
    creator?: { full_name: string };
    floor_number?: number;
}

interface Resolver {
    user_id: string;
    active_tickets: number;
    current_floor: number;
    is_available: boolean;
    score: number;
    user?: { full_name: string };
}

interface Activity {
    id: string;
    action: string;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
    user?: { full_name: string };
    ticket_id: string;
}

interface Category {
    id: string;
    code: string;
    name: string;
}

interface AdminSPOCDashboardProps {
    propertyId?: string; // Optional if viewing all properties
    organizationId?: string;
    propertyName?: string;
    adminUser?: { full_name: string; avatar_url?: string };
    initialStatusFilter?: string;
}

export default function AdminSPOCDashboard({
    propertyId,
    organizationId,
    propertyName,
    adminUser,
    initialStatusFilter = 'all',
}: AdminSPOCDashboardProps) {
    const router = useRouter();
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [assignTo, setAssignTo] = useState('');
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideCategory, setOverrideCategory] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all');
    const [timePeriod, setTimePeriod] = useState<'today' | 'all'>('all');

    const { getCachedData, setCachedData } = useDataCache();
    const cacheKey = `spoc-dashboard-${propertyId}-${statusFilter}`;

    const [tickets, setTickets] = useState<Ticket[]>(() => getCachedData(cacheKey)?.tickets || []);
    const [resolvers, setResolvers] = useState<Resolver[]>(() => getCachedData(cacheKey)?.resolvers || []);
    const [activities, setActivities] = useState<Activity[]>(() => getCachedData(cacheKey)?.activities || []);
    const [categories, setCategories] = useState<Category[]>(() => getCachedData(cacheKey)?.categories || []);
    const [loading, setLoading] = useState(!getCachedData(cacheKey));

    useEffect(() => {
        if (initialStatusFilter) {
            setStatusFilter(initialStatusFilter);
        }
    }, [initialStatusFilter]);

    // Consolidate fetchData effect at the end of the component

    const fetchData = useCallback(async () => {
        if (!loading && !tickets.length) setLoading(true);
        let fetchedTickets: Ticket[] = [];
        let fetchedActivities: Activity[] = [];
        let currentResolvers: Resolver[] = [];
        let currentCategories: Category[] = [];

        try {
            const params = new URLSearchParams();
            if (propertyId && propertyId !== 'undefined') params.append('propertyId', propertyId);
            if (organizationId && organizationId !== '' && organizationId !== 'undefined') params.append('organizationId', organizationId);
            if (statusFilter === 'client_raised') {
                params.append('raisedByRole', 'tenant');
            } else if (statusFilter !== 'all') {
                params.append('status', statusFilter);
            }
            if (timePeriod === 'today') {
                params.append('period', 'today');
            }

            console.log('[AdminSPOCDashboard] Fetching with params:', params.toString());

            // Fetch data with individual error handling to identify which one fails
            const fetchWithLog = async (url: string, name: string) => {
                try {
                    const res = await fetch(url);
                    if (!res.ok) {
                        console.error(`[AdminSPOCDashboard] ${name} fetch failed with status: ${res.status}`);
                    }
                    return res;
                } catch (err) {
                    console.error(`[AdminSPOCDashboard] ${name} fetch CRASHED:`, err);
                    throw err; // Re-throw to be caught by the outer try-catch
                }
            };

            const [ticketsRes, resolversRes, configRes] = await Promise.all([
                fetchWithLog(`/api/tickets?${params.toString()}`, 'Tickets'),
                fetchWithLog(`/api/resolvers/workload?${params.toString()}`, 'Resolvers'),
                (propertyId && propertyId !== 'undefined')
                    ? fetchWithLog(`/api/properties/${propertyId}/ticket-config`, 'Config')
                    : Promise.resolve(null)
            ]);

            if (ticketsRes.ok) {
                const data = await ticketsRes.json();
                fetchedTickets = data.tickets || [];
                setTickets(fetchedTickets);

                // Fetch activity for the first ticket if available
                if (fetchedTickets.length > 0 && fetchedTickets[0]?.id) {
                    try {
                        const actRes = await fetch(`/api/tickets/${fetchedTickets[0].id}/activity`);
                        if (actRes.ok) {
                            const actData = await actRes.json();
                            fetchedActivities = actData.activities?.slice(0, 5) || [];
                            setActivities(fetchedActivities);
                        } else {
                            console.warn(`[AdminSPOCDashboard] Activity fetch failed: ${actRes.status}`);
                        }
                    } catch (actErr) {
                        console.error('[AdminSPOCDashboard] Activity fetch CRASHED:', actErr);
                    }
                }
            }

            if (resolversRes.ok) {
                const data = await resolversRes.json();
                currentResolvers = (data.resolvers || []).sort((a: any, b: any) =>
                    (a.user?.full_name || '').localeCompare(b.user?.full_name || '')
                );
                setResolvers(currentResolvers);
            }

            if (configRes && configRes.ok) {
                const data = await configRes.json();
                currentCategories = data.categories || [];
                setCategories(currentCategories);
            } else if (!propertyId) {
                setCategories([]);
            }

            // Final cache update with everything
            setCachedData(cacheKey, {
                tickets: fetchedTickets,
                resolvers: currentResolvers,
                activities: fetchedActivities,
                categories: currentCategories
            });

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    }, [propertyId, organizationId, statusFilter, timePeriod]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // More frequent updates for "Live" board
        return () => clearInterval(interval);
    }, [fetchData]);

    const getSLAStatus = (deadline: string | null, breached: boolean, paused: boolean) => {
        if (paused) return { text: 'PAUSED', color: 'text-yellow-400 bg-yellow-500/20', urgent: false };
        if (breached) return { text: 'SLA BREACHED', color: 'text-red-400 bg-red-500/20', urgent: true };
        if (!deadline) return null;

        const diffMs = new Date(deadline).getTime() - Date.now();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 0) return { text: 'SLA BREACHED', color: 'text-red-400 bg-red-500/20', urgent: true };
        if (diffMins < 30) return { text: `${diffMins}m left`, color: 'text-red-400 bg-red-500/20', urgent: true };
        if (diffMins < 60) return { text: `${diffMins}m left`, color: 'text-orange-400 bg-orange-500/20', urgent: true };

        const hours = Math.floor(diffMins / 60);
        return { text: `${hours}h ${diffMins % 60}m`, color: 'text-gray-400 bg-gray-500/20', urgent: false };
    };

    // Force Assign
    const handleForceAssign = async () => {
        if (!selectedTicket || !assignTo) return;
        setActionLoading('assign');
        try {
            await fetch(`/api/tickets/${selectedTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assigned_to: assignTo }),
            });
            fetchData();
            setSelectedTicket(null);
            setAssignTo('');
        } catch (error) {
            console.error('Error assigning:', error);
        } finally {
            setActionLoading(null);
        }
    };

    // Pause/Resume SLA
    const handlePauseSLA = async (ticketId: string, pause: boolean) => {
        setActionLoading(`pause-${ticketId}`);
        try {
            await fetch(`/api/tickets/${ticketId}/pause-sla`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pause, reason: pause ? 'Paused by admin' : undefined }),
            });
            fetchData();
        } catch (error) {
            console.error('Error pausing SLA:', error);
        } finally {
            setActionLoading(null);
        }
    };

    // Trigger AI Re-eval
    const handleReclassify = async (ticketId: string) => {
        setActionLoading(`reclassify-${ticketId}`);
        try {
            await fetch(`/api/tickets/${ticketId}/reclassify`, { method: 'POST' });
            fetchData();
        } catch (error) {
            console.error('Error reclassifying:', error);
        } finally {
            setActionLoading(null);
        }
    };

    // Override Classification
    const handleOverrideClassification = async () => {
        if (!selectedTicket || !overrideCategory) return;
        setActionLoading('override');
        try {
            await fetch(`/api/tickets/${selectedTicket.id}/override-classification`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category_id: overrideCategory }),
            });
            fetchData();
            setShowOverrideModal(false);
            setOverrideCategory('');
        } catch (error) {
            console.error('Error overriding:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteTicket = async (e: React.MouseEvent, ticketId: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this ticket? This action is permanent.')) return;

        try {
            const response = await fetch(`/api/tickets/${ticketId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                fetchData();
            }
        } catch (error) {
            console.error('Error deleting ticket:', error);
        }
    };

    const waitlistTickets = tickets.filter(t => t.status === 'waitlist');
    const slaRiskTickets = tickets.filter(t => {
        if (!t.sla_deadline || t.sla_paused) return false;
        const diffMs = new Date(t.sla_deadline).getTime() - Date.now();
        return diffMs > 0 && diffMs < 60 * 60 * 1000;
    });
    const availableResolvers = resolvers.filter(r => r.is_available);

    // Real workload distribution for chart
    const workloadBuckets = [0, 0, 0, 0, 0]; // 0, 1-2, 3-4, 5-6, 7+ tasks
    resolvers.forEach(r => {
        if (r.active_tickets === 0) workloadBuckets[0]++;
        else if (r.active_tickets <= 2) workloadBuckets[1]++;
        else if (r.active_tickets <= 4) workloadBuckets[2]++;
        else if (r.active_tickets <= 6) workloadBuckets[3]++;
        else workloadBuckets[4]++;
    });

    return (
        <div className="min-h-full bg-transparent text-slate-900 p-0 lg:p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900">Request Board</h1>
                        <p className="text-slate-400 text-sm font-bold">{propertyName || 'All Properties'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white border border-slate-200 p-0.5 rounded-xl">
                        <button
                            onClick={() => setTimePeriod('today')}
                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all ${timePeriod === 'today'
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            Today
                        </button>
                        <button
                            onClick={() => setTimePeriod('all')}
                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all ${timePeriod === 'all'
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            All
                        </button>
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            const newFilter = e.target.value;
                            setStatusFilter(newFilter);
                            // Update URL with new filter
                            const url = new URL(window.location.href);
                            if (newFilter !== 'all') {
                                url.searchParams.set('filter', newFilter);
                            } else {
                                url.searchParams.delete('filter');
                            }
                            window.history.pushState({}, '', url.toString());
                        }}
                        className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    >
                        <option value="all">All Status</option>
                        <option value="open,assigned,in_progress,blocked">Open</option>
                        <option value="resolved,closed">Completed</option>
                        <option value="waitlist">Waitlist</option>
                        <option value="client_raised">Client Raised</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-5">
                {/* Live Ticket Board - Increased Size */}
                <div className="col-span-12 lg:col-span-6 bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm">
                    <h2 className="text-xs font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Live Ticket Board
                    </h2>

                    <div className="overflow-auto max-h-[400px]">
                        <table className="w-full text-xs">
                            <thead className="text-slate-400 sticky top-0 bg-white">
                                <tr>
                                    <th className="text-left py-2 font-black uppercase tracking-wider">ID</th>
                                    <th className="text-left py-2 font-black uppercase tracking-wider pl-2">Subject</th>
                                    <th className="text-left py-2 font-black uppercase tracking-wider pl-2">Status</th>
                                    <th className="text-right py-2 font-black uppercase tracking-wider">SLA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    // Skeleton rows
                                    [1, 2, 3, 4, 5].map((i) => (
                                        <tr key={i}>
                                            <td className="py-3"><Skeleton className="h-4 w-10" /></td>
                                            <td className="py-3 pl-2"><Skeleton className="h-4 w-32" /></td>
                                            <td className="py-3 pl-2"><Skeleton className="h-4 w-16 rounded" /></td>
                                            <td className="py-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                                        </tr>
                                    ))
                                ) : tickets.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="py-12 text-center text-slate-400 font-bold italic">
                                            No active tickets found.
                                        </td>
                                    </tr>
                                ) : (
                                    tickets.slice(0, 15).map((ticket) => {
                                        const sla = getSLAStatus(ticket.sla_deadline, ticket.sla_breached, ticket.sla_paused);
                                        return (
                                            <tr
                                                key={ticket.id}
                                                className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedTicket?.id === ticket.id ? 'bg-emerald-50' : ''
                                                    }`}
                                                onClick={() => router.push(`/tickets/${ticket.id}?from=requests`)}
                                            >
                                                <td className="py-3 text-slate-500 font-bold">{ticket.ticket_number?.slice(-5)}</td>
                                                <td className="py-3 text-slate-900 font-medium truncate max-w-[120px] pl-2">{ticket.title}</td>
                                                <td className="py-3 text-slate-900 font-medium pl-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-600' :
                                                        ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                                                            'bg-slate-100 text-slate-600'
                                                        }`}>
                                                        {ticket.status?.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-right flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={(e) => handleDeleteTicket(e, ticket.id)}
                                                        className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    {sla ? (
                                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${sla.color}`}>
                                                            {sla.text}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Resolver Load Map - Reduced Size per Request */}
                <div className="col-span-12 lg:col-span-2 bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm relative overflow-hidden">
                    <h2 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-widest">Resolver Load Map</h2>

                    {/* Coming Soon Overlay */}
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                        <div className="px-4 py-2 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-xl">
                            Coming Soon
                        </div>
                        <p className="text-slate-500 text-xs font-bold mt-2">Map view in development</p>
                    </div>

                    <div className="flex gap-4 opacity-50 pointer-events-none">
                        <div className="flex-1 bg-slate-50 rounded-2xl p-4 relative min-h-[200px] border border-slate-100">
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />

                            {resolvers.slice(0, 6).map((r, i) => (
                                <div
                                    key={`${r.user_id}-${i}`}
                                    className="absolute flex flex-col items-center"
                                    style={{
                                        left: `${15 + (i % 3) * 30}%`,
                                        top: `${20 + Math.floor(i / 3) * 45}%`,
                                    }}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${r.active_tickets === 0 ? 'bg-emerald-100 border-2 border-emerald-400 text-emerald-700' :
                                        r.active_tickets < 3 ? 'bg-amber-100 border-2 border-amber-400 text-amber-700' :
                                            'bg-rose-100 border-2 border-rose-400 text-rose-700'
                                        }`}>
                                        <User className="w-4 h-4" />
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-500 mt-1">{r.active_tickets}</span>
                                </div>
                            ))}
                        </div>

                        <div className="w-32 space-y-3">
                            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Active</p>
                                <p className="text-2xl font-black text-slate-900">{availableResolvers.length}</p>
                                <p className="text-[10px] font-bold text-emerald-500">Resolvers</p>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                                <div className="flex items-end gap-1 h-[40px]">
                                    {workloadBuckets.map((count, i) => (
                                        <div
                                            key={i}
                                            className="w-4 bg-slate-300 rounded-t-sm transition-all"
                                            style={{ height: `${Math.max(4, count * 10)}px` }}
                                        />
                                    ))}
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Load</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel */}
                <div className="col-span-12 lg:col-span-4 space-y-5">
                    {/* Waitlist */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-[24px] p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-100/50 rounded-full -mr-8 -mt-8" />

                        <div className="flex items-center justify-between mb-3 relative z-10">
                            <h2 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Waitlist</h2>
                            <span className="bg-white/50 px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-500">{waitlistTickets.length} Pending</span>
                        </div>

                        <p className="text-3xl font-black text-indigo-900 mb-2 relative z-10">{waitlistTickets.length}</p>
                        <p className="text-[10px] font-bold text-indigo-400 mb-4 uppercase tracking-widest relative z-10">Needs Classification</p>

                        <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2 relative z-10 custom-scrollbar">
                            {waitlistTickets.map(t => (
                                <div
                                    key={t.id}
                                    onClick={() => router.push(`/tickets/${t.id}?from=requests`)}
                                    className="flex items-center gap-2 text-xs bg-white/40 p-2 rounded-lg hover:bg-white/60 transition-colors cursor-pointer group"
                                >
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.confidence_score >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                    <span className="text-indigo-900 font-bold truncate flex-1 group-hover:text-indigo-600">{t.title}</span>
                                    <span className="text-indigo-400 font-bold">{t.confidence_score || '<40'}%</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                if (waitlistTickets[0]) {
                                    router.push(`/tickets/${waitlistTickets[0].id}?from=requests`);
                                }
                            }}
                            className="w-full mt-2 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 relative z-10"
                        >
                            Review & Classify
                        </button>
                    </div>

                    {/* Manual Assignment */}
                    <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm">
                        <h2 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-widest">Manual Assignment</h2>

                        {selectedTicket ? (
                            <div className="space-y-4">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Assiging Ticket</p>
                                    <p className="text-sm font-bold text-slate-900 line-clamp-2">{selectedTicket.title}</p>
                                </div>
                                <select
                                    value={assignTo}
                                    onChange={(e) => setAssignTo(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-100"
                                >
                                    <option value="">Select resolver...</option>
                                    {resolvers.map((r, i) => (
                                        <option key={`${r.user_id}-${i}`} value={r.user_id}>
                                            {r.user?.full_name} ({r.active_tickets} tasks)
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleForceAssign}
                                    disabled={!assignTo || actionLoading === 'assign'}
                                    className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-lg shadow-slate-200"
                                >
                                    {actionLoading === 'assign' ? 'Assigning...' : 'Force Assign'}
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-xs font-bold text-slate-400">Select a ticket to assign</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* SLA Risk Queue */}
                <div className="col-span-12 lg:col-span-6 bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm">
                    <h2 className="text-xs font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        SLA Risk Queue
                    </h2>

                    {slaRiskTickets.length === 0 ? (
                        <div className="text-center text-slate-400 py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <span className="text-xs font-bold">No tickets at SLA risk</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {slaRiskTickets.slice(0, 3).map(ticket => {
                                const sla = getSLAStatus(ticket.sla_deadline, false, false);
                                return (
                                    <div key={ticket.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{ticket.ticket_number}</p>
                                            <p className="text-xs text-slate-500 truncate max-w-[200px]">{ticket.title}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px] font-black uppercase tracking-wider">
                                                    {sla?.text} Left
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => router.push(`/tickets/${ticket.id}?from=requests`)}
                                            className="px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                                        >
                                            View
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Audit Log + Quick Actions */}
                <div className="col-span-12 lg:col-span-6 grid grid-cols-2 gap-5">
                    {/* Audit Log */}
                    <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm">
                        <h2 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-widest">Override & Audit Log</h2>

                        <div className="space-y-3 text-xs max-h-[150px] overflow-auto pr-2">
                            {activities.length === 0 ? (
                                <p className="text-slate-400 italic font-medium text-center py-4">No recent activity</p>
                            ) : (
                                activities.map(act => (
                                    <div key={act.id} className="flex items-start gap-3 text-slate-500">
                                        <div className="w-6 h-6 bg-slate-50 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Clock className="w-3 h-3 text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-700">
                                                {act.user?.full_name || 'System'}
                                            </p>
                                            <p className="text-[10px] leading-tight">
                                                {act.action.replace(/_/g, ' ')}
                                                {act.new_value && <span className="text-slate-900 font-medium"> → {act.new_value.slice(0, 20)}</span>}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <button
                            onClick={() => selectedTicket && router.push(`/tickets/${selectedTicket.id}?from=requests`)}
                            className="w-full mt-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl text-xs font-bold transition-colors uppercase tracking-wider"
                        >
                            Full Audit Trail
                        </button>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm">
                        <h2 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-widest">Quick Actions</h2>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => selectedTicket && handlePauseSLA(selectedTicket.id, !selectedTicket.sla_paused)}
                                disabled={!selectedTicket}
                                className="py-3 bg-cyan-50 text-cyan-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-cyan-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {selectedTicket?.sla_paused ? 'Resume SLA' : 'Pause SLA'}
                            </button>
                            <button
                                onClick={() => selectedTicket && handleReclassify(selectedTicket.id)}
                                disabled={!selectedTicket}
                                className="py-3 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                AI Re-eval
                            </button>
                            <button
                                onClick={() => {
                                    if (selectedTicket) {
                                        setShowOverrideModal(true);
                                    }
                                }}
                                disabled={!selectedTicket}
                                className="py-3 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Override
                            </button>
                            <button
                                onClick={() => router.push('/reports/tickets')}
                                className="py-3 bg-purple-50 text-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-100 transition-colors flex items-center justify-center gap-1"
                            >
                                Reports ✨
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Override Classification Modal */}
            <AnimatePresence>
                {showOverrideModal && selectedTicket && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowOverrideModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-black text-slate-900">Override Classification</h3>
                                <button onClick={() => setShowOverrideModal(false)} className="text-slate-400 hover:text-slate-900">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <p className="text-sm font-bold text-slate-900 mb-1">Ticket: {selectedTicket.title}</p>
                            <p className="text-xs text-slate-500 mb-5 font-medium">
                                Current Category: {
                                    ((selectedTicket as any).category && typeof (selectedTicket as any).category === 'string')
                                        ? (selectedTicket as any).category.replace(/_/g, ' ')
                                        : (selectedTicket.category?.name || 'Unclassified')
                                }
                            </p>

                            <select
                                value={overrideCategory}
                                onChange={(e) => setOverrideCategory(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-100 mb-5"
                            >
                                <option value="">Select new category...</option>
                                <option value="reset">Reset Classification</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowOverrideModal(false)}
                                    className="flex-1 py-3 bg-slate-100 rounded-xl text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleOverrideClassification}
                                    disabled={!overrideCategory || actionLoading === 'override'}
                                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 rounded-xl text-white text-xs font-black uppercase tracking-widest disabled:opacity-70 shadow-lg shadow-rose-200"
                                >
                                    {actionLoading === 'override' ? 'Saving...' : 'Override'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
