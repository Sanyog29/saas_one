'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export interface LatestLead {
    id: string;
    full_name: string;
    company_name?: string | null;
    requirement?: string | null;
    location?: string | null;
    status_name?: string | null;
    created_at: string;
    last_contacted?: string | null;
}

function agoLabel(iso?: string | null): string {
    if (!iso) return '';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// Reusable "Latest Leads" card (mirrors the super-admin dashboard's New Leads
// panel) so reps and admins see the newest leads too. Newly-arrived leads
// (< 24h) are badged NEW.
export default function LatestLeadsCard({ orgId, leads }: { orgId: string; leads: LatestLead[] }) {
    return (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-sm font-black text-text-primary flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Latest Leads
                </h2>
                <Link
                    href={`/${orgId}/crm/leads`}
                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                >
                    View all <ArrowRight className="w-3 h-3" />
                </Link>
            </div>
            {leads.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-tertiary">No leads yet</div>
            ) : (
                <div className="divide-y divide-border">
                    {leads.map((l) => {
                        const isNew =
                            !!l.created_at && Date.now() - new Date(l.created_at).getTime() < 24 * 3600 * 1000;
                        const sub = l.requirement
                            ? l.requirement.slice(0, 36)
                            : l.company_name || l.location || '—';
                        return (
                            <Link
                                key={l.id}
                                href={`/${orgId}/crm/leads?lead=${l.id}`}
                                className="px-5 py-2.5 flex items-center gap-3 hover:bg-surface-elevated transition-colors"
                            >
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary flex-shrink-0">
                                    {(l.full_name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-text-primary truncate">
                                        {l.full_name}
                                        {isNew && (
                                            <span className="ml-2 text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                                                NEW
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-[10px] text-text-tertiary truncate">{sub}</p>
                                </div>
                                <span className="text-[10px] text-text-tertiary whitespace-nowrap">
                                    {agoLabel(l.created_at)}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
