'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Users, Phone, Calendar, FileText, TrendingUp, DollarSign,
    Clock, Target, CheckCircle, ArrowRight, Plus, Bell
} from 'lucide-react';
import { motion } from 'framer-motion';
import KPICard from '@/frontend/components/dashboard/KPICard';
import StatTile from '@/frontend/components/dashboard/StatTile';
import { useAuth } from '@/frontend/context/AuthContext';

interface CRMDashboardStats {
    assigned_leads: number;
    open_followups: number;
    meetings_today: number;
    proposals_pending: number;
    won_this_month: number;
    pipeline_value: number;
    target_achievement_percent: number;
    revenue_closed: number;
}

interface PerformanceStats {
    leads_contacted: number;
    calls_completed: number;
    meetings_conducted: number;
    site_visits: number;
    proposals_sent: number;
    closures: number;
    win_ratio: number;
}

interface UpcomingTask {
    id: string;
    type: 'followup' | 'meeting' | 'call';
    title: string;
    lead_name: string;
    datetime: string;
    is_overdue: boolean;
}

export default function CRMDashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState<CRMDashboardStats | null>(null);
    const [performance, setPerformance] = useState<PerformanceStats | null>(null);
    const [tasks, setTasks] = useState<UpcomingTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [statsRes, tasksRes] = await Promise.all([
                fetch('/api/crm/stats?type=rep'),
                fetch('/api/crm/events?start_date=' + new Date().toISOString().split('T')[0])
            ]);

            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats(data);
            }

            if (tasksRes.ok) {
                const data = await tasksRes.json();
                // Transform events to tasks
                const upcomingTasks: UpcomingTask[] = (data.events || []).map((event: any) => ({
                    id: event.id,
                    type: event.event_type,
                    title: event.title,
                    lead_name: event.lead_info?.company_name || 'Unknown',
                    datetime: event.start_datetime,
                    is_overdue: new Date(event.start_datetime) < new Date()
                }));
                setTasks(upcomingTasks.slice(0, 5));
            }
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value);
    };

    if (isLoading) {
        return (
            <div className="animate-pulse space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-32 bg-slate-200 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">CRM Dashboard</h1>
                    <p className="text-sm text-text-secondary mt-1">
                        Welcome back! Here&apos;s your sales overview.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/crm/leads"
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors font-medium text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Lead
                    </Link>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link href="/crm/leads?filter=assigned">
                    <KPICard
                        title="Assigned Leads"
                        value={stats?.assigned_leads || 0}
                        icon={Users}
                        onClick={() => {}}
                    />
                </Link>
                <Link href="/crm/leads?filter=followups">
                    <KPICard
                        title="Open Follow-ups"
                        value={stats?.open_followups || 0}
                        icon={Bell}
                        trend={stats?.open_followups > 5 ? { value: 'Needs attention', direction: 'down' as const } : undefined}
                        onClick={() => {}}
                    />
                </Link>
                <Link href="/crm/calendar?view=today">
                    <KPICard
                        title="Meetings Today"
                        value={stats?.meetings_today || 0}
                        icon={Calendar}
                        onClick={() => {}}
                    />
                </Link>
                <Link href="/crm/leads?status=proposal">
                    <KPICard
                        title="Proposals Pending"
                        value={stats?.proposals_pending || 0}
                        icon={FileText}
                        onClick={() => {}}
                    />
                </Link>
            </div>

            {/* Pipeline & Performance Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pipeline Value */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-text-primary">Pipeline Overview</h2>
                        <Link href="/crm/reports" className="text-primary text-sm font-medium hover:underline flex items-center gap-1">
                            View Reports <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="flex items-end gap-4 mb-6">
                        <span className="text-4xl font-bold text-text-primary metric-number">
                            {formatCurrency(stats?.pipeline_value || 0)}
                        </span>
                        <span className="text-sm text-text-secondary pb-2">Total Pipeline</span>
                    </div>
                    <div className="flex items-end gap-4">
                        <span className="text-2xl font-bold text-success metric-number">
                            {formatCurrency(stats?.revenue_closed || 0)}
                        </span>
                        <span className="text-sm text-text-secondary pb-1">Won This Month</span>
                    </div>
                </div>

                {/* Target Achievement */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-text-primary">Target Achievement</h2>
                        <Target className="w-5 h-5 text-text-secondary" />
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="relative w-24 h-24">
                            <svg className="w-24 h-24 transform -rotate-90">
                                <circle
                                    cx="48"
                                    cy="48"
                                    r="40"
                                    stroke="#E5E7EB"
                                    strokeWidth="8"
                                    fill="none"
                                />
                                <circle
                                    cx="48"
                                    cy="48"
                                    r="40"
                                    stroke={stats?.target_achievement_percent >= 100 ? '#22C55E' : '#3B82F6'}
                                    strokeWidth="8"
                                    fill="none"
                                    strokeDasharray={`${(stats?.target_achievement_percent || 0) * 2.51} 251`}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xl font-bold text-text-primary">
                                    {stats?.target_achievement_percent || 0}%
                                </span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="text-sm text-text-secondary mb-2">Monthly Target</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-text-primary">
                                    {formatCurrency(stats?.revenue_closed || 0)}
                                </span>
                                <span className="text-sm text-text-tertiary">/ {formatCurrency((stats?.pipeline_value || 0) * 1.2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Performance Metrics */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <h2 className="text-lg font-semibold text-text-primary mb-4">Performance This Month</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <StatTile
                        label="Won Deals"
                        value={stats?.won_this_month || 0}
                        icon={CheckCircle}
                    />
                    <StatTile
                        label="Pipeline Value"
                        value={formatCurrency(stats?.pipeline_value || 0).replace('₹', '').replace(',00', '')}
                        subtitle="Crores"
                        icon={TrendingUp}
                    />
                    <StatTile
                        label="Avg. Closure"
                        value={Math.round((stats?.pipeline_value || 0) / Math.max(stats?.won_this_month || 1, 1))}
                        subtitle="Days"
                        icon={Clock}
                    />
                    <StatTile
                        label="Win Rate"
                        value={`${Math.round(((stats?.won_this_month || 0) / Math.max(stats?.assigned_leads || 1, 1)) * 100)}%`}
                        icon={Target}
                    />
                    <StatTile
                        label="Revenue"
                        value={formatCurrency(stats?.revenue_closed || 0).replace('₹', '').replace(',00', '')}
                        subtitle="This Month"
                        icon={DollarSign}
                    />
                </div>
            </div>

            {/* Upcoming Tasks */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-text-primary">My Tasks</h2>
                    <Link href="/crm/calendar" className="text-primary text-sm font-medium hover:underline flex items-center gap-1">
                        View Calendar <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
                {tasks.length === 0 ? (
                    <div className="text-center py-8 text-text-secondary">
                        <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p>No upcoming tasks</p>
                        <Link href="/crm/leads" className="text-primary text-sm font-medium hover:underline mt-2 inline-block">
                            Add a follow-up
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tasks.map((task) => (
                            <motion.div
                                key={task.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className={`flex items-center gap-4 p-4 rounded-xl border ${
                                    task.is_overdue
                                        ? 'bg-red-50 border-red-200'
                                        : 'bg-slate-50 border-slate-200'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                    task.is_overdue ? 'bg-red-100' : 'bg-blue-100'
                                }`}>
                                    {task.type === 'meeting' && <Calendar className={`w-5 h-5 ${task.is_overdue ? 'text-red-600' : 'text-blue-600'}`} />}
                                    {task.type === 'call' && <Phone className={`w-5 h-5 ${task.is_overdue ? 'text-red-600' : 'text-blue-600'}`} />}
                                    {task.type === 'followup' && <Bell className={`w-5 h-5 ${task.is_overdue ? 'text-red-600' : 'text-blue-600'}`} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-text-primary truncate">{task.title}</p>
                                    <p className="text-sm text-text-secondary truncate">{task.lead_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-medium ${task.is_overdue ? 'text-red-600' : 'text-text-primary'}`}>
                                        {new Date(task.datetime).toLocaleDateString('en-IN', {
                                            day: 'numeric',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                    {task.is_overdue && (
                                        <p className="text-xs text-red-600 font-medium">Overdue</p>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}