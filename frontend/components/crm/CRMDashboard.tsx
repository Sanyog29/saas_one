'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    Users, Phone, Calendar, FileText, TrendingUp, ArrowRight, Plus, Bell,
    Flame, XCircle, Briefcase, Zap, CheckCircle2, Clock, Home, MapPin, ChevronRight,
    ClipboardList, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/frontend/context/AuthContext';
import CrmStatTiles, { StatPeriod } from '@/frontend/components/crm/CrmStatTiles';
import StatusInfoTooltip from '@/frontend/components/crm/StatusInfoTooltip';
import { TextShimmer } from '@/frontend/components/ui/text-shimmer';
import BorderGlow from '@/frontend/components/ui/BorderGlow';

interface CampaignNewLeads {
    campaign: string;
    count: number;
}

interface FollowupLead {
    id: string;
    full_name: string;
    company_name: string;
    next_followup_date: string;
    followup_notes: string | null;
}

interface CRMDashboardStats {
    total_leads: number;
    hot_leads: number;
    warm_leads: number;
    lost_leads: number;
    deals_open: number;
    deals_in_progress: number;
    deals_closed: number;
    overdue_followups: number;
    action_required: number;
    meetings_today: number;
    new_leads: number;
    new_leads_by_campaign: CampaignNewLeads[];
    followups_needed: number;
    priority_leads: PriorityLead[];
    action_leads: ActionLead[];
    todays_followups?: FollowupLead[];
}

interface PriorityLead {
    id: string;
    full_name: string;
    company_name: string;
    location: string | null;
    campaign: string | null;
    status_name: string;
    last_update: string | null;
    next_followup_date: string | null;
    poc?: string | null;
}

interface ActionLead {
    id: string;
    full_name: string;
    company_name: string;
    location: string | null;
    status_name: string;
    last_update: string | null;
    next_followup_date: string | null;
}

function LeadRow({ lead, index, showCampaign = false }: { lead: PriorityLead | ActionLead; index: number; showCampaign?: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const router = useRouter();
    const params = useParams();
    const orgId = params?.orgId as string;
    const isHot = (lead as PriorityLead).status_name?.toLowerCase().includes('hot');
    const warmName = (lead as PriorityLead).status_name?.toLowerCase() || '';
    const isWarm = warmName.includes('warm') || warmName.includes('mql');

    const formatDate = (d: string | null) => {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
        catch { return d; }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="border-b border-border last:border-0"
        >
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors text-left"
            >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isHot ? 'bg-rose-500' : isWarm ? 'bg-amber-500' : 'bg-slate-400'}`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-text-primary truncate">{lead.full_name}</span>
                        {lead.company_name && (
                            <span className="text-xs text-text-secondary truncate">· {lead.company_name}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {lead.location && (
                            <span className="text-[10px] text-text-tertiary font-medium flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" /> {lead.location}
                            </span>
                        )}
                        {showCampaign && (lead as PriorityLead).campaign && (
                            <span className="text-[10px] text-indigo-500 font-medium">{(lead as PriorityLead).campaign}</span>
                        )}
                    </div>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg flex-shrink-0 flex items-center gap-1 ${
                    isHot ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : isWarm ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-surface-elevated text-text-secondary'
                }`}>
                    {lead.status_name}
                    <StatusInfoTooltip statusName={lead.status_name} />
                </span>
                <div className="text-right flex-shrink-0 w-20">
                    <span className="text-[10px] font-medium text-text-secondary">{formatDate(lead.last_update)}</span>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 text-text-tertiary flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-3 pl-9 space-y-2">
                            {(lead as PriorityLead).poc && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">POC:</span>
                                    <span className="text-xs font-medium text-text-primary">{(lead as PriorityLead).poc}</span>
                                </div>
                            )}
                            {lead.last_update && (
                                <div className="flex items-start gap-2">
                                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mt-0.5">Update:</span>
                                    <span className="text-xs text-text-secondary leading-relaxed">{lead.last_update}</span>
                                </div>
                            )}
                            {lead.next_followup_date && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Next:</span>
                                    <span className="text-xs font-medium text-text-primary">{formatDate(lead.next_followup_date)}</span>
                                </div>
                            )}
                            <button
                                onClick={() => router.push(`/${orgId}/crm/leads?lead=${lead.id}`)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline mt-1"
                            >
                                View Lead <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

const CITIES = ['Mumbai', 'Bangalore', 'Noida'];

export default function CRMDashboard() {
    const { user, membership } = useAuth();
    const params = useParams();
    const orgId = params?.orgId as string;
    const isBdRep = membership?.org_role === 'bd_rep';
    const [stats, setStats] = useState<CRMDashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState<StatPeriod>('all');
    const [selectedCity, setSelectedCity] = useState('all');
    const [isCityOpen, setIsCityOpen] = useState(false);
    const cityRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (cityRef.current && !cityRef.current.contains(e.target as Node)) setIsCityOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        setIsLoading(true);
        const cityParam = selectedCity !== 'all' ? `&city=${encodeURIComponent(selectedCity)}` : '';
        fetch(`/api/crm/stats?type=rep&period=${period}${cityParam}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { setStats(data); setIsLoading(false); })
            .catch(() => setIsLoading(false));
    }, [period, selectedCity]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center animate-pulse">
                    <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <TextShimmer duration={1.2} className="text-sm font-bold" baseColor="#64748b" gradientColor="#cbd5e1">
                    Loading CRM dashboard…
                </TextShimmer>
            </div>
        );
    }

    const s = stats || {
        total_leads: 0, hot_leads: 0, warm_leads: 0, lost_leads: 0,
        deals_open: 0, deals_in_progress: 0, deals_closed: 0,
        overdue_followups: 0, action_required: 0, meetings_today: 0,
        new_leads: 0, new_leads_by_campaign: [], followups_needed: 0,
        priority_leads: [], action_leads: [], todays_followups: [],
    };

    const todaysFollowups = s.todays_followups || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link
                            href={`/${orgId}/dashboard`}
                            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-text-tertiary hover:text-text-secondary transition-colors"
                        >
                            <Home className="w-3 h-3" />
                            FMS
                        </Link>
                        <span className="text-text-tertiary text-xs">/</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">CRM</span>
                    </div>
                    <h1 className="text-2xl font-black text-text-primary tracking-tight">CRM Dashboard</h1>
                    <p className="text-sm text-text-secondary mt-1">
                        {user?.user_metadata?.full_name || user?.email} · Performance Marketing
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {!isBdRep && (
                    <div ref={cityRef} className="relative">
                        <button
                            onClick={() => setIsCityOpen(!isCityOpen)}
                            className="flex items-center gap-2 px-4 py-2 bg-surface-elevated border border-border rounded-xl hover:border-primary transition-all text-sm font-bold text-text-primary min-w-[140px]"
                        >
                            <MapPin className="w-4 h-4 text-primary" />
                            <span className="truncate">{selectedCity === 'all' ? 'All Cities' : selectedCity}</span>
                            <ChevronRight className={`w-4 h-4 text-text-tertiary transition-transform ${isCityOpen ? 'rotate-90' : ''}`} />
                        </button>
                        <AnimatePresence>
                            {isCityOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-xl z-50 min-w-[180px] overflow-hidden"
                                >
                                    <button
                                        onClick={() => { setSelectedCity('all'); setIsCityOpen(false); }}
                                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${selectedCity === 'all' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-muted'}`}
                                    >
                                        <MapPin className="w-3.5 h-3.5" />
                                        All Cities
                                    </button>
                                    {CITIES.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => { setSelectedCity(c); setIsCityOpen(false); }}
                                            className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${selectedCity === c ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-muted'}`}
                                        >
                                            <MapPin className="w-3.5 h-3.5" />
                                            {c}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    )}
                    <Link
                        href={`/${orgId}/crm/leads`}
                        data-tour="crm-add-lead"
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors font-bold text-sm shadow-sm shadow-primary/20"
                    >
                        <Plus className="w-4 h-4" />
                        Add Lead
                    </Link>
                </div>
            </div>

            {/* 3-tile overview with Today / This Month / Total toggle */}
            <div data-tour="crm-stat-tiles">
            <CrmStatTiles
                total={s.total_leads}
                newLeads={s.new_leads}
                newLeadsByCampaign={s.new_leads_by_campaign}
                followups={s.followups_needed}
                period={period}
                onPeriodChange={setPeriod}
                orgId={orgId}
                loading={isLoading}
            />
            </div>

            {/* Two list panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Priority Target Leads (Hot + Warm) */}
                <div data-tour="crm-priority-leads">
                <BorderGlow
                    backgroundColor="var(--surface)"
                    glowColor="0 72 65"
                    colors={['#EF4444', '#F59E0B', '#708F96']}
                    fillOpacity={0.04}
                    borderRadius={16}
                    glowRadius={24}
                    glowIntensity={0.7}
                    coneSpread={30}
                    edgeSensitivity={50}
                >
                    <div className="overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-rose-50 to-amber-50 dark:from-rose-950/30 dark:to-amber-950/30">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-rose-100 dark:bg-rose-900/40 rounded-xl flex items-center justify-center">
                                    <Flame className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-text-primary">Priority Target Leads</h2>
                                    <p className="text-[10px] text-text-secondary font-medium">Hot & MQL · {s.priority_leads.length} leads</p>
                                </div>
                            </div>
                            <Link
                                href={`/${orgId}/crm/leads?status=hot,mql`}
                                className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                            >
                                View All <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>

                        {s.priority_leads.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-12 h-12 bg-surface-elevated rounded-2xl flex items-center justify-center mb-3">
                                    <Flame className="w-6 h-6 text-text-tertiary" />
                                </div>
                                <p className="text-sm font-bold text-text-secondary">No priority leads</p>
                                <p className="text-xs text-text-tertiary mt-1">Hot & MQL leads will appear here</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                                {s.priority_leads.map((lead, i) => (
                                    <LeadRow key={lead.id} lead={lead} index={i} showCampaign />
                                ))}
                            </div>
                        )}
                    </div>
                </BorderGlow>
                </div>

                {/* Action Required (Hold + Missing Status) */}
                <div data-tour="crm-action-leads">
                <BorderGlow
                    backgroundColor="var(--surface)"
                    glowColor="35 92 55"
                    colors={['#F59E0B', '#708F96', '#64748B']}
                    fillOpacity={0.04}
                    borderRadius={16}
                    glowRadius={24}
                    glowIntensity={0.7}
                    coneSpread={30}
                    edgeSensitivity={50}
                >
                    <div className="overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-amber-50 to-slate-50 dark:from-amber-950/30 dark:to-slate-950/30">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/40 rounded-xl flex items-center justify-center">
                                    <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-text-primary">Action Required</h2>
                                    <p className="text-[10px] text-text-secondary font-medium">Hold / Missing Status · {s.action_leads.length} leads</p>
                                </div>
                            </div>
                            <Link
                                href={`/${orgId}/crm/leads?status=hold,no_status`}
                                className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                            >
                                View All <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>

                        {s.action_leads.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mb-3">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                </div>
                                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">All clear!</p>
                                <p className="text-xs text-text-tertiary mt-1">No leads need attention right now</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                                {s.action_leads.map((lead, i) => (
                                    <LeadRow key={lead.id} lead={lead} index={i} />
                                ))}
                            </div>
                        )}
                    </div>
                </BorderGlow>
                </div>
            </div>

            {/* Today's Follow-ups Notes */}
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-elevated">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center">
                            <ClipboardList className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-text-primary">Today's Follow-ups</h2>
                            <p className="text-[10px] text-text-tertiary font-medium">
                                Scheduled for {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {todaysFollowups.length} planned
                            </p>
                        </div>
                    </div>
                    <Link
                        href={`/${orgId}/crm/calendar`}
                        className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                        Calendar <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>

                {todaysFollowups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="w-10 h-10 bg-surface-elevated rounded-xl flex items-center justify-center mb-2">
                            <CheckCircle2 className="w-5 h-5 text-text-tertiary" />
                        </div>
                        <p className="text-sm font-bold text-text-secondary">No follow-ups today</p>
                        <p className="text-xs text-text-tertiary mt-0.5">Schedule follow-ups from the lead detail view</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {todaysFollowups.map((fu) => (
                            <Link
                                key={fu.id}
                                href={`/${orgId}/crm/leads?lead=${fu.id}`}
                                className="flex items-start gap-3 px-5 py-3 hover:bg-surface-elevated transition-colors group"
                            >
                                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-text-primary truncate">{fu.full_name}</span>
                                        {fu.company_name && (
                                            <span className="text-xs text-text-tertiary truncate">· {fu.company_name}</span>
                                        )}
                                    </div>
                                    {fu.followup_notes && (
                                        <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                                            <MessageSquare className="w-3 h-3 inline-block mr-1 text-text-tertiary -mt-0.5" />
                                            {fu.followup_notes}
                                        </p>
                                    )}
                                </div>
                                <ChevronRight className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-secondary flex-shrink-0 mt-1" />
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}