'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Download, Plus, ChevronDown, MoreHorizontal, Phone, Mail, MapPin, Building, User, Calendar, ArrowUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/frontend/context/AuthContext';
import { CRMLead, LeadStatusConfig, LeadSource } from '@/frontend/types/crm';
import { getStageVisual } from '@/frontend/lib/crm/stages';

interface LeadsTableProps {
    onLeadSelect?: (lead: CRMLead) => void;
    onCreateLead?: () => void;
    filters?: {
        status?: string[];
        assigned_to?: string[];
        property_interest?: string[];
    };
}

export default function LeadsTable({ onLeadSelect, onCreateLead, filters }: LeadsTableProps) {
    const { user } = useAuth();
    const [leads, setLeads] = useState<CRMLead[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedFilters, setSelectedFilters] = useState<{
        status?: string[];
        campaign?: string[];
        city?: string[];
        date_from?: string;
        date_to?: string;
    }>({});
    const [statuses, setStatuses] = useState<LeadStatusConfig[]>([]);
    const [sources, setSources] = useState<LeadSource[]>([]);
    const [campaigns, setCampaigns] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        fetchLeads();
        fetchConfigs();
    }, [page, search, selectedFilters, sortBy, sortOrder]);

    const fetchLeads = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                page_size: '20',
                sort_by: sortBy,
                sort_order: sortOrder
            });

            if (search) params.set('search', search);
            if (selectedFilters.status?.length) {
                selectedFilters.status.forEach(s => params.append('status', s));
            }
            if (selectedFilters.campaign?.length) {
                selectedFilters.campaign.forEach(c => params.append('campaign', c));
            }
            if (selectedFilters.city?.length) {
                selectedFilters.city.forEach(c => params.append('city', c));
            }
            if (selectedFilters.date_from) params.set('date_from', selectedFilters.date_from);
            if (selectedFilters.date_to) params.set('date_to', selectedFilters.date_to);

            const res = await fetch(`/api/crm/leads?${params}`);
            if (res.ok) {
                const data = await res.json();
                setLeads(data.leads || []);
                setTotalPages(data.pagination?.total_pages || 1);
                setTotalCount(data.pagination?.total || 0);
            }
        } catch (error) {
            console.error('Failed to fetch leads:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchConfigs = async () => {
        try {
            const [settingsRes, campaignsRes] = await Promise.all([
                fetch('/api/crm/settings?type=all'),
                fetch('/api/crm/campaigns'),
            ]);
            if (settingsRes.ok) {
                const data = await settingsRes.json();
                setStatuses(data.statuses || []);
                setSources(data.sources || []);
            }
            if (campaignsRes.ok) {
                const data = await campaignsRes.json();
                setCampaigns((data.campaigns || []).map((c: any) => c.name).filter(Boolean));
            }
        } catch (error) {
            console.error('Failed to fetch configs:', error);
        }
    };

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('desc');
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value);
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const getStatusBadge = (lead: CRMLead) => {
        const statusName = lead.status_info?.name || 'Unknown';
        const v = getStageVisual(statusName);
        const color = lead.status_info?.color || v.color;
        const Icon = v.icon;
        return (
            <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border"
                style={{ backgroundColor: `${color}1A`, color, borderColor: `${color}44` }}
            >
                <Icon className="w-3 h-3" />
                {statusName}
            </span>
        );
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-end gap-3">
                <div className="flex items-center gap-3">
                    <button
                        data-tour="leads-filters"
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-bold transition-colors ${
                            showFilters ? 'bg-primary text-white border-primary' : 'border-border text-text-secondary hover:bg-surface-elevated'
                        }`}
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                        {Object.values(selectedFilters).some(v => v && v.length > 0) && (
                            <span className="w-2 h-2 bg-primary rounded-full" />
                        )}
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm font-bold text-text-secondary hover:bg-surface-elevated transition-colors opacity-50 cursor-not-allowed" disabled title="Coming soon">
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    {onCreateLead && (
                        <button
                            data-tour="leads-add"
                            onClick={onCreateLead}
                            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Lead
                        </button>
                    )}
                </div>
            </div>

            {/* Filters Panel */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-surface-elevated rounded-xl p-4 border border-border space-y-4">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">Status</label>
                                    <div className="flex flex-wrap gap-2">
                                        {statuses.map(s => {
                                            const active = selectedFilters.status?.includes(s.id);
                                            return (
                                                <button
                                                    key={s.id}
                                                    onClick={() => {
                                                        const current = selectedFilters.status || [];
                                                        const next = active ? current.filter(v => v !== s.id) : [...current, s.id];
                                                        setSelectedFilters({ ...selectedFilters, status: next });
                                                        setPage(1);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                                        active
                                                            ? 'bg-primary text-white border-primary'
                                                            : 'bg-surface text-text-secondary border-border hover:border-primary/40'
                                                    }`}
                                                    style={active ? {} : { borderColor: s.color ? `${s.color}44` : undefined }}
                                                >
                                                    {active && <span className="mr-1">✓</span>}{s.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">Date Range</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date"
                                            value={selectedFilters.date_from || ''}
                                            onChange={(e) => { setSelectedFilters({ ...selectedFilters, date_from: e.target.value || undefined }); setPage(1); }}
                                            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                        <span className="text-xs text-text-tertiary">to</span>
                                        <input
                                            type="date"
                                            value={selectedFilters.date_to || ''}
                                            onChange={(e) => { setSelectedFilters({ ...selectedFilters, date_to: e.target.value || undefined }); setPage(1); }}
                                            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                </div>
                                {campaigns.length > 0 && (
                                <div>
                                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">Campaign</label>
                                    <div className="flex flex-wrap gap-2">
                                        {campaigns.map(c => {
                                            const active = selectedFilters.campaign?.includes(c);
                                            return (
                                                <button
                                                    key={c}
                                                    onClick={() => {
                                                        const current = selectedFilters.campaign || [];
                                                        const next = active ? current.filter(v => v !== c) : [...current, c];
                                                        setSelectedFilters({ ...selectedFilters, campaign: next });
                                                        setPage(1);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                                        active
                                                            ? 'bg-primary text-white border-primary'
                                                            : 'bg-surface text-text-secondary border-border hover:border-primary/40'
                                                    }`}
                                                >
                                                    {active && <span className="mr-1">✓</span>}{c}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">City</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['Mumbai', 'Bangalore', 'Noida'].map(c => {
                                            const active = selectedFilters.city?.includes(c);
                                            return (
                                                <button
                                                    key={c}
                                                    onClick={() => {
                                                        const current = selectedFilters.city || [];
                                                        const next = active ? current.filter(v => v !== c) : [...current, c];
                                                        setSelectedFilters({ ...selectedFilters, city: next });
                                                        setPage(1);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                                        active
                                                            ? 'bg-primary text-white border-primary'
                                                            : 'bg-surface text-text-secondary border-border hover:border-primary/40'
                                                    }`}
                                                >
                                                    {active && <span className="mr-1">✓</span>}{c}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">Ring</label>
                                    <div className="flex flex-wrap gap-2">
                                        {Array.from({ length: 10 }, (_, i) => i + 1).map(r => {
                                            const ringStatusIds = statuses.filter(s => s.name.toLowerCase() === `ring ${r}`).map(s => s.id);
                                            const active = ringStatusIds.some(id => selectedFilters.status?.includes(id));
                                            return (
                                                <button
                                                    key={r}
                                                    onClick={() => {
                                                        const current = selectedFilters.status || [];
                                                        const next = active
                                                            ? current.filter(v => !ringStatusIds.includes(v))
                                                            : [...current, ...ringStatusIds];
                                                        setSelectedFilters({ ...selectedFilters, status: next });
                                                        setPage(1);
                                                    }}
                                                    className={`w-9 h-9 rounded-xl text-xs font-bold border transition-colors ${
                                                        active
                                                            ? 'bg-orange-500 text-white border-orange-500'
                                                            : 'bg-surface text-text-secondary border-border hover:border-orange-400'
                                                    }`}
                                                >
                                                    {r}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => {
                                            setSelectedFilters({});
                                            setPage(1);
                                        }}
                                        className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table */}
            <div className="bg-surface rounded-xl border border-border overflow-hidden" data-tour="leads-table">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-surface-elevated border-b border-border">
                                <th className="text-left px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Lead</th>
                                <th className="text-left px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Contact</th>
                                <th className="text-left px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Location</th>
                                <th className="text-left px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Assigned To</th>
                                <th className="text-left px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Status</th>
                                <th className="text-right px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Deal Value</th>
                                <th className="text-left px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Follow-up</th>
                                <th className="text-left px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {isLoading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan={8} className="px-4 py-4">
                                            <div className="h-8 bg-muted rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : leads.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-text-secondary">
                                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Search className="w-8 h-8 text-text-tertiary" />
                                        </div>
                                        <p className="font-medium">No leads found</p>
                                        <p className="text-sm mt-1">Try adjusting your search or filters</p>
                                    </td>
                                </tr>
                            ) : (
                                leads.map((lead) => (
                                    <tr
                                        key={lead.id}
                                        onClick={() => onLeadSelect?.(lead)}
                                        className="hover:bg-surface-elevated cursor-pointer transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="font-medium text-text-primary text-sm">
                                                    {lead.company_name || lead.contact_person || 'Unnamed Lead'}
                                                </p>
                                                {lead.company_name && lead.contact_person && (
                                                    <p className="text-xs text-text-secondary">{lead.contact_person}</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                {lead.contact_number && (
                                                    <p className="text-sm text-text-primary flex items-center gap-1.5">
                                                        <Phone className="w-3 h-3 text-text-tertiary" />
                                                        {lead.contact_number}
                                                    </p>
                                                )}
                                                {lead.email && (
                                                    <p className="text-xs text-text-secondary flex items-center gap-1.5">
                                                        <Mail className="w-3 h-3 text-text-tertiary" />
                                                        {lead.email}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {lead.location && (
                                                <p className="text-sm text-text-primary flex items-center gap-1.5">
                                                    <MapPin className="w-3 h-3 text-text-tertiary" />
                                                    {lead.location}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {lead.assigned_user ? (
                                                <p className="text-sm text-text-primary">{lead.assigned_user.full_name}</p>
                                            ) : (
                                                <span className="text-xs text-text-tertiary">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {getStatusBadge(lead)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <p className="font-medium text-text-primary text-sm">
                                                {formatCurrency(lead.deal_value)}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            {lead.next_followup_date ? (
                                                <p className={`text-sm ${
                                                    new Date(lead.next_followup_date) < new Date()
                                                        ? 'text-red-600 font-medium'
                                                        : 'text-text-primary'
                                                }`}>
                                                    {formatDate(lead.next_followup_date)}
                                                </p>
                                            ) : (
                                                <span className="text-xs text-text-tertiary">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-text-secondary">{formatDate(lead.created_at)}</p>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                        <p className="text-sm text-text-secondary">
                            Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, totalCount)} of {totalCount} leads
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-elevated"
                            >
                                Previous
                            </button>
                            <span className="text-sm text-text-secondary">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-elevated"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}