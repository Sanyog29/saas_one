'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    FileText, Download, Calendar, User, CheckCircle, AlertCircle,
    Loader2, RefreshCw, Filter, ChevronDown, FileSpreadsheet, Clock, Eye, Trash2, Upload,
    BarChart2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { createClient } from '@/frontend/utils/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string) {
    const [year, m] = month.split('-').map(Number);
    return new Date(year, m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function changeMonth(month: string, delta: number) {
    const [year, m] = month.split('-').map(Number);
    const d = new Date(year, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface SnagImport {
    id: string;
    property_id: string;
    organization_id: string;
    imported_by: string;
    filename: string;
    total_rows: number;
    valid_rows: number;
    error_rows: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
    completed_at: string | null;
    importer?: {
        full_name: string;
        email: string;
    };
    property?: {
        name: string;
        code: string;
    };
}

interface ImportReportsViewProps {
    propertyId?: string;
    organizationId: string;
}

const statusStyles: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    completed: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: CheckCircle },
    failed: { bg: 'bg-red-50', text: 'text-red-600', icon: AlertCircle },
    processing: { bg: 'bg-amber-50', text: 'text-amber-600', icon: Loader2 },
    pending: { bg: 'bg-slate-50', text: 'text-slate-600', icon: Clock },
};

export default function ImportReportsView({ propertyId, organizationId }: ImportReportsViewProps) {
    const router = useRouter();
    const [imports, setImports] = useState<SnagImport[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

    const supabase = createClient();

    useEffect(() => {
        fetchImports();
    }, [propertyId, organizationId, filterStatus]);

    const fetchImports = async () => {
        setIsLoading(true);
        setError(null);

        try {
            // First fetch the snag_imports
            let query = supabase
                .from('snag_imports')
                .select('*')
                .order('created_at', { ascending: false });

            // Apply filters based on scope
            if (propertyId && propertyId !== 'all') {
                query = query.eq('property_id', propertyId);
            } else if (organizationId) {
                query = query.eq('organization_id', organizationId);
            }

            if (filterStatus !== 'all') {
                query = query.eq('status', filterStatus);
            }

            const { data, error: fetchError } = await query;

            if (fetchError) {
                throw fetchError;
            }

            if (!data || data.length === 0) {
                setImports([]);
                return;
            }

            // Get unique user IDs from the imports
            const userIds = [...new Set(data.map(imp => imp.imported_by).filter(Boolean))];

            // Fetch user details separately
            let usersMap: Record<string, { full_name: string; email: string }> = {};

            if (userIds.length > 0) {
                const { data: users } = await supabase
                    .from('users')
                    .select('id, full_name, email')
                    .in('id', userIds);

                if (users) {
                    users.forEach(u => {
                        usersMap[u.id] = { full_name: u.full_name || '', email: u.email || '' };
                    });
                }
            }

            // Fetch property names separately for context
            const propertyIds = [...new Set(data.map(imp => imp.property_id).filter(Boolean))];
            let propsMap: Record<string, { name: string; code: string }> = {};

            if (propertyIds.length > 0) {
                const { data: props } = await supabase
                    .from('properties')
                    .select('id, name, code')
                    .in('id', propertyIds);

                if (props) {
                    props.forEach(p => {
                        propsMap[p.id] = { name: p.name, code: p.code };
                    });
                }
            }

            // Combine imports with user data and property data
            const importsWithUsers = data.map(imp => ({
                ...imp,
                importer: usersMap[imp.imported_by] || { full_name: 'Unknown', email: '' },
                property: propsMap[imp.property_id] || { name: 'Unknown', code: '' }
            }));

            setImports(importsWithUsers);
        } catch (err: any) {
            console.error('Error fetching imports:', err);
            // Show actual error message from Supabase
            const errorMessage = err?.message || err?.details || 'Failed to load import history';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportReport = async (importId: string, format: 'csv' | 'xlsx' = 'csv') => {
        setIsExporting(importId);

        try {
            // Fetch tickets associated with this import batch
            const { data: tickets, error: ticketsError } = await supabase
                .from('tickets')
                .select(`
                    id,
                    title,
                    description,
                    category,
                    status,
                    priority,
                    floor_number,
                    location,
                    created_at,
                    assigned_to,
                    assignee:assigned_to(full_name, email)
                `)
                .eq('import_batch_id', importId);

            if (ticketsError) {
                throw ticketsError;
            }

            if (!tickets || tickets.length === 0) {
                throw new Error('No tickets found for this import');
            }

            // Generate CSV content
            const headers = ['ticket id', 'title', 'description', 'category', 'floor', 'location', 'status', 'priority', 'assigned to', 'created at'];
            const rows = tickets.map(t => [
                t.id,
                t.title,
                t.description?.replace(/,/g, ';') || '',
                t.category,
                t.floor_number !== null ? `Floor ${t.floor_number}` : 'Unspecified',
                t.location || '-',
                t.status,
                t.priority,
                (t.assignee as any)?.full_name || 'Unassigned',
                new Date(t.created_at).toLocaleString()
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            // Download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `import_report_${importId.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (err) {
            console.error('Export error:', err);
            setError(err instanceof Error ? err.message : 'Failed to export report');
        } finally {
            setIsExporting(null);
        }
    };

    const handleExportAllReports = async () => {
        setIsExporting('all');

        try {
            // Fetch all imports with their associated tickets
            const importIds = imports.map(i => i.id);

            const { data: allTickets, error: ticketsError } = await supabase
                .from('tickets')
                .select(`
                    id,
                    title,
                    description,
                    category,
                    status,
                    priority,
                    floor_number,
                    location,
                    created_at,
                    import_batch_id,
                    assigned_to,
                    assignee:assigned_to(full_name, email)
                `)
                .in('import_batch_id', importIds);

            if (ticketsError) {
                throw ticketsError;
            }

            // Generate comprehensive CSV
            const headers = ['import date', 'filename', 'ticket id', 'title', 'description', 'category', 'floor', 'location', 'status', 'priority', 'assigned to', 'created at'];
            const rows: string[][] = [];

            imports.forEach(imp => {
                const importTickets = allTickets?.filter(t => t.import_batch_id === imp.id) || [];
                importTickets.forEach(t => {
                    rows.push([
                        new Date(imp.created_at).toLocaleDateString(),
                        imp.filename,
                        t.id,
                        t.title,
                        t.description?.replace(/,/g, ';') || '',
                        t.category,
                        t.floor_number !== null ? `Floor ${t.floor_number}` : 'Unspecified',
                        t.location || '-',
                        t.status,
                        t.priority,
                        (t.assignee as any)?.full_name || 'Unassigned',
                        new Date(t.created_at).toLocaleString()
                    ]);
                });
            });

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            // Download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `all_imports_report_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (err) {
            console.error('Export all error:', err);
            setError(err instanceof Error ? err.message : 'Failed to export all reports');
        } finally {
            setIsExporting(null);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const datePart = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const timePart = date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        return `${datePart} | ${timePart}`;
    };

    const handleDeleteImport = async (importId: string) => {
        if (!window.confirm('Are you sure you want to delete this import report? This will also delete all tickets created in this batch.')) {
            return;
        }

        try {
            const response = await fetch(`/api/reports/snag-report/${importId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete import');
            }

            setImports(prev => prev.filter(imp => imp.id !== importId));
        } catch (err) {
            console.error('Delete error:', err);
            setError(err instanceof Error ? err.message : 'Failed to delete import');
        }
    };

    return (
        <div className="space-y-4">
            {/* Monthly Requests Report Card */}
            <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                            <BarChart2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-text-primary lowercase">monthly requests report</h3>
                            <p className="text-[11px] text-text-tertiary font-medium mt-0.5">
                                view full report of all tickets raised for a selected month
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Month Picker */}
                            <div className="flex items-center gap-1 bg-muted border border-border rounded-xl px-3 py-2">
                                <button
                                    onClick={() => setSelectedMonth(prev => changeMonth(prev, -1))}
                                    className="p-0.5 hover:bg-border rounded transition-colors"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5 text-text-secondary" />
                                </button>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="text-xs font-bold text-text-primary bg-transparent outline-none w-[120px] text-center"
                                    max={getCurrentMonth()}
                                />
                                <button
                                    onClick={() => setSelectedMonth(prev => changeMonth(prev, 1))}
                                    disabled={selectedMonth >= getCurrentMonth()}
                                    className="p-0.5 hover:bg-border rounded transition-colors disabled:opacity-40"
                                >
                                    <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />
                                </button>
                            </div>
                            <button
                                onClick={() => propertyId && router.push(`/property/${propertyId}/reports/requests?month=${selectedMonth}`)}
                                disabled={!propertyId}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title={!propertyId ? 'Select a specific property first' : undefined}
                            >
                                <Eye className="w-3.5 h-3.5" />
                                view report
                            </button>
                        </div>
                        {!propertyId && (
                            <p className="text-[10px] text-text-tertiary font-medium">
                                select a specific property to view its monthly report
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-text-primary lowercase">import reports</h2>
                    <p className="text-text-tertiary text-sm font-medium mt-1">
                        view and export reports for all bulk imports
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Filter Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border rounded-xl text-sm font-bold text-text-secondary hover:bg-muted transition-colors"
                        >
                            <Filter className="w-4 h-4" />
                            {filterStatus === 'all' ? 'All Status' : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
                            <ChevronDown className="w-4 h-4" />
                        </button>
                        <AnimatePresence>
                            {showFilterDropdown && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute right-0 mt-2 w-40 bg-white border border-border rounded-xl shadow-lg z-10 overflow-hidden"
                                >
                                    {['all', 'completed', 'processing', 'pending', 'failed'].map(status => (
                                        <button
                                            key={status}
                                            onClick={() => {
                                                setFilterStatus(status);
                                                setShowFilterDropdown(false);
                                            }}
                                            className={`w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-muted transition-colors ${filterStatus === status ? 'bg-primary/10 text-primary' : 'text-text-secondary'
                                                }`}
                                        >
                                            {status.charAt(0).toUpperCase() + status.slice(1)}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={fetchImports}
                        disabled={isLoading}
                        className="p-2.5 bg-white border border-border rounded-xl text-text-secondary hover:bg-muted transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>

                    {/* Bulk Snags Button */}
                    <button
                        onClick={() => router.push(`/property/${propertyId}/snags/intake`)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-white rounded-xl text-sm font-bold hover:bg-secondary/90 transition-colors shadow-sm shadow-secondary/25"
                    >
                        <Upload className="w-4 h-4" />
                        bulk snags
                    </button>

                    {/* Export All Button */}
                    <button
                        onClick={handleExportAllReports}
                        disabled={isExporting !== null || imports.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        {isExporting === 'all' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                        export all
                    </button>
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <span className="text-red-700 font-medium">{error}</span>
                    <button
                        onClick={() => setError(null)}
                        className="ml-auto text-red-600 hover:text-red-800"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Loading State */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                    <p className="text-text-tertiary font-medium">Loading import history...</p>
                </div>
            ) : imports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-border">
                    <FileSpreadsheet className="w-16 h-16 text-slate-300 mb-4" />
                    <h3 className="text-lg font-bold text-text-primary mb-2">No Imports Found</h3>
                    <p className="text-text-tertiary text-sm">
                        {filterStatus !== 'all'
                            ? `No imports with status "${filterStatus}" found`
                            : 'Start by uploading a CSV or Excel file to bulk import snags'
                        }
                    </p>
                </div>
            ) : (
                /* Imports Table */
                <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50 border-b border-border">
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                                        Import Date
                                    </th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        File Details
                                    </th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        Imported By
                                    </th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        Rows
                                    </th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        Status
                                    </th>
                                    <th className="px-4 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {imports.map((imp, idx) => {
                                    const StatusIcon = statusStyles[imp.status]?.icon || Clock;
                                    return (
                                        <motion.tr
                                            key={imp.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="hover:bg-slate-50/50 transition-colors"
                                        >
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                                        <Calendar className="w-4 h-4 text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-text-primary whitespace-nowrap">
                                                            {formatDate(imp.created_at).split(' | ')[0]}
                                                        </p>
                                                        <p className="text-[10px] text-text-tertiary whitespace-nowrap">
                                                            {formatDate(imp.created_at).split(' | ')[1]}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col max-w-[180px]">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                                                        <span className="text-xs font-bold text-text-primary truncate" title={imp.filename}>
                                                            {imp.filename}
                                                        </span>
                                                    </div>
                                                    {(!propertyId || propertyId === 'all') && imp.property && (
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded truncate">
                                                                {imp.property.name}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <User className="w-3.5 h-3.5 text-text-tertiary" />
                                                    </div>
                                                    <div className="max-w-[120px]">
                                                        <p className="text-xs font-bold text-text-primary truncate">
                                                            {(imp.importer as any)?.full_name || 'System'}
                                                        </p>
                                                        <p className="text-[10px] text-text-tertiary truncate">
                                                            {(imp.importer as any)?.email || ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <div className="inline-flex flex-col items-center">
                                                    <span className="text-sm font-black text-text-primary">
                                                        {imp.valid_rows}
                                                    </span>
                                                    <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-tight">
                                                        Valid
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusStyles[imp.status]?.bg} ${statusStyles[imp.status]?.text}`}>
                                                    <StatusIcon className={`w-3 h-3 ${imp.status === 'processing' ? 'animate-spin' : ''}`} />
                                                    {imp.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => router.push(`/property/${imp.property_id}/reports/${imp.id}`)}
                                                        disabled={imp.status !== 'completed'}
                                                        className="p-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="View Report"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportReport(imp.id)}
                                                        disabled={isExporting !== null || imp.status !== 'completed'}
                                                        className="p-2 bg-slate-100 hover:bg-slate-200 text-text-primary rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Export CSV"
                                                    >
                                                        {isExporting === imp.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Download className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteImport(imp.id)}
                                                        className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs transition-colors"
                                                        title="Delete Import"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )
            }

            {/* Summary Cards */}
            {
                !isLoading && imports.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white rounded-xl p-4 border border-border shadow-sm">
                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                                Total Imports
                            </div>
                            <div className="text-xl font-black text-text-primary">{imports.length}</div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-border shadow-sm">
                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                                Snags Loaded
                            </div>
                            <div className="text-xl font-black text-text-primary">
                                {imports.reduce((acc, i) => acc + i.valid_rows, 0)}
                            </div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-border shadow-sm">
                            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">
                                Successful
                            </div>
                            <div className="text-xl font-black text-emerald-600">
                                {imports.filter(i => i.status === 'completed').length}
                            </div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-border shadow-sm">
                            <div className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">
                                Failed
                            </div>
                            <div className="text-xl font-black text-red-500">
                                {imports.filter(i => i.status === 'failed').length}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
