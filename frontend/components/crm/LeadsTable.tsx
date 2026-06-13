'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Download, Plus, ChevronDown, MoreHorizontal, Phone, Mail, MapPin, Building, User, Calendar, ArrowUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/frontend/context/AuthContext';
import { CRMLead, LeadStatusConfig, LeadSource } from '@/frontend/types/crm';

interface LeadsTableProps {
    onLeadSelect?: (lead: CRMLead) => void;
    onCreateLead?: () => void;
    filters?: {
        status?: string[];
        assigned_to?: string[];
        property_interest?: string[];
    };
}

const STATUS_COLORS: Record<string, string> = {
    'New Lead': 'bg-blue-100 text-blue-700 border-blue-200',
    'Contacted': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    'Meeting Scheduled': 'bg-orange-100 text-orange-700 border-orange-200',
    'Site Visit Scheduled': 'bg-orange-100 text-orange-700 border-orange-200',
    'Proposal Shared': 'bg-purple-100 text-purple-700 border-purple-200',
    'Negotiation': 'bg-teal-100 text-teal-700 border-teal-200',
    'Won': 'bg-green-100 text-green-700 border-green-200',
    'Lost': 'bg-red-100 text-red-700 border-red-200',
    'Dropped': 'bg-gray-100 text-gray-600 border-gray-200',
    'On Hold': 'bg-slate-100 text-slate-600 border-slate-200'
};

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
        priority?: string[];
        assigned_to?: string[];
    }>({});
    const [statuses, setStatuses] = useState<LeadStatusConfig[]>([]);
    const [sources, setSources] = useState<LeadSource[]>([]);
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
            if (selectedFilters.priority?.length) {
                selectedFilters.priority.forEach(p => params.append('priority', p));
            }

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
            const res = await fetch('/api/crm/settings?type=all');
            if (res.ok) {
                const data = await res.json();
                setStatuses(data.statuses || []);
                setSources(data.sources || []);
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
        return (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[statusName] || 'bg-gray-100 text-gray-600'}`}>
                {statusName}
            </span>
        );
    };

    const getPriorityBadge = (priority: string) => {
        const colors = {
            'Low': 'bg-slate-100 text-slate-600',
            'Medium': 'bg-blue-100 text-blue-600',
            'High': 'bg-orange-100 text-orange-600',
            'Urgent': 'bg-red-100 text-red-600'
        };
        return (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[priority as keyof typeof colors] || colors.Medium}`}>
                {priority}
            </span>
        );
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 max-w-md">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                        <input
                            type="text"
                            placeholder="Search leads..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
                            showFilters ? 'bg-primary text-white border-primary' : 'border-slate-200 text-text-secondary hover:bg-slate-50'
                        }`}
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                        {Object.values(selectedFilters).some(v => v && v.length > 0) && (
                            <span className="w-2 h-2 bg-primary rounded-full" />
                        )}
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-slate-50 transition-colors">
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    {onCreateLead && (
                        <button
                            onClick={onCreateLead}
                            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
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
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Status Filter */}
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-2">Status</label>
                                    <select
                                        multiple
                                        value={selectedFilters.status || []}
                                        onChange={(e) => {
                                            const values = Array.from(e.target.selectedOptions, opt => opt.value);
                                            setSelectedFilters({ ...selectedFilters, status: values });
                                        }}
                                        className="w-full border border-slate-200 rounded-lg p-2 text-sm h-24"
                                    >
                                        {statuses.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                {/* Priority Filter */}
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-2">Priority</label>
                                    <select
                                        multiple
                                        value={selectedFilters.priority || []}
                                        onChange={(e) => {
                                            const values = Array.from(e.target.selectedOptions, opt => opt.value);
                                            setSelectedFilters({ ...selectedFilters, priority: values });
                                        }}
                                        className="w-full border border-slate-200 rounded-lg p-2 text-sm h-24"
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                        <option value="Urgent">Urgent</option>
                                    </select>
                                </div>
                                {/* Quick Actions */}
                                <div className="flex items-end">
                                    <button
                                        onClick={() => {
                                            setSelectedFilters({});
                                            setPage(1);
                                        }}
                                        className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
                                    >
                                        Clear Filters
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Lead</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Contact</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Location</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Assigned To</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Status</th>
                                <th className="text-right px-4 py-3 text-xs font-medium text-text-secondary">Deal Value</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Next Follow-up</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan={8} className="px-4 py-4">
                                            <div className="h-8 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : leads.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-text-secondary">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Search className="w-8 h-8 text-slate-400" />
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
                                        className="hover:bg-slate-50 cursor-pointer transition-colors"
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
                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(lead)}
                                                {getPriorityBadge(lead.priority)}
                                            </div>
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
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
                        <p className="text-sm text-text-secondary">
                            Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, totalCount)} of {totalCount} leads
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                            >
                                Previous
                            </button>
                            <span className="text-sm text-text-secondary">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
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