'use client';

import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Calendar, Users, Building2, TrendingUp, Target } from 'lucide-react';
import StatTile from '@/frontend/components/dashboard/StatTile';

type ReportType = 'user' | 'territory' | 'property' | 'source' | 'status' | 'revenue' | 'monthly' | 'quarterly';

export default function ReportsPage() {
    const [reportType, setReportType] = useState<ReportType>('monthly');
    const [dateRange, setDateRange] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });
    const [isLoading, setIsLoading] = useState(false);

    const reportTypes = [
        { id: 'monthly' as ReportType, label: 'Monthly Funnel', icon: Calendar },
        { id: 'quarterly' as ReportType, label: 'Quarterly', icon: Calendar },
        { id: 'user' as ReportType, label: 'User Wise', icon: Users },
        { id: 'property' as ReportType, label: 'Property Wise', icon: Building2 },
        { id: 'source' as ReportType, label: 'Lead Source', icon: TrendingUp },
        { id: 'status' as ReportType, label: 'Status Wise', icon: Target },
        { id: 'revenue' as ReportType, label: 'Revenue', icon: FileSpreadsheet },
    ];

    const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
        setIsLoading(true);
        try {
            // Fetch report data
            const res = await fetch(`/api/crm/reports?type=${reportType}&from=${dateRange.from}&to=${dateRange.to}`);
            if (res.ok) {
                const data = await res.json();
                // For now, show a toast message
                alert(`Report exported as ${format.toUpperCase()}`);
            }
        } catch (error) {
            console.error('Export error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">CRM Reports</h1>
                    <p className="text-sm text-text-secondary mt-1">
                        Analyze your sales performance and pipeline
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleExport('csv')}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-slate-50 transition-colors"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        CSV
                    </button>
                    <button
                        onClick={() => handleExport('excel')}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-slate-50 transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        Excel
                    </button>
                    <button
                        onClick={() => handleExport('pdf')}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        PDF
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-2">Report Type</label>
                        <div className="flex flex-wrap gap-2">
                            {reportTypes.map(type => (
                                <button
                                    key={type.id}
                                    onClick={() => setReportType(type.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        reportType === type.id
                                            ? 'bg-primary text-white'
                                            : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
                                    }`}
                                >
                                    <type.icon className="w-4 h-4" />
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-2">Date Range</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateRange.from}
                                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                            <span className="text-text-tertiary">to</span>
                            <input
                                type="date"
                                value={dateRange.to}
                                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Report Content */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                    {reportTypes.find(t => t.id === reportType)?.label} Report
                </h2>

                {/* Placeholder report content - in production this would be a chart or table */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <StatTile
                        label="Total Leads"
                        value="156"
                        icon={Users}
                    />
                    <StatTile
                        label="Conversions"
                        value="32"
                        subtitle="20.5%"
                        icon={Target}
                    />
                    <StatTile
                        label="Pipeline Value"
                        value="₹12.5 Cr"
                        icon={TrendingUp}
                    />
                    <StatTile
                        label="Revenue"
                        value="₹4.2 Cr"
                        icon={Building2}
                    />
                </div>

                <div className="mt-6 text-center py-12 text-text-secondary">
                    <p>Detailed report visualization would appear here</p>
                    <p className="text-sm mt-1">Data is based on the selected date range and report type</p>
                </div>
            </div>
        </div>
    );
}