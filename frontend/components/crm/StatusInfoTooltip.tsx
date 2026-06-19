'use client';

import React, { useState, useEffect } from 'react';
import { Info } from 'lucide-react';

const QUALIFICATION_INFO: Record<string, { label: string; color: string; criteria: string[] }> = {
    hot: {
        label: 'HOT',
        color: '#EF4444',
        criteria: [
            'Defined requirement (use, size, location, specs)',
            'Decision-maker engaged and responsive',
            'Budget / financing confirmed',
            'Timeline to decision within ~90 days',
            'Active deal action: tour done, proposal exchanged, or LOI in play',
        ],
    },
    warm: {
        label: 'WARM',
        color: '#F59E0B',
        criteria: [
            'Defined requirement',
            'Identified, responsive decision-maker',
            'At least one meeting or tour held',
            'Falls short of HOT on one axis (timeline 3–12mo or budget not proofed)',
            'No LOI yet',
        ],
    },
    cold: {
        label: 'COLD',
        color: '#38BDF8',
        criteria: [
            'Requirement vague or exploratory',
            'Timeline undefined or beyond 12 months',
            'Budget unknown',
            'Inquiry-only or low responsiveness; no meeting held',
        ],
    },
    ring: {
        label: 'RING',
        color: '#FB923C',
        criteria: [
            'Call attempt tracking (Ring 1-10)',
            'Each ring represents a successive call attempt to reach the prospect',
            'Higher ring numbers indicate more follow-up attempts',
            'If still unresponsive after several rings, consider marking Cold or Nurture',
        ],
    },
    future: {
        label: 'NURTURE / FUTURE',
        color: '#8B5CF6',
        criteria: [
            'Lead is real and reasonably qualified',
            'Trigger event known but distant (e.g., lease expires in 18 months)',
            'No current activity expected yet',
        ],
    },
    loss: {
        label: 'LOST',
        color: '#64748B',
        criteria: [
            'Reached real qualification but did not close',
            'Signed elsewhere, requirement cancelled, or went dark',
            'Must carry a reason code',
        ],
    },
};

interface StatusInfoTooltipProps {
    statusName: string;
    className?: string;
}

export default function StatusInfoTooltip({ statusName, className = '' }: StatusInfoTooltipProps) {
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        try {
            const orgId = window.location.pathname.split('/')[1];
            const stored = localStorage.getItem(`crm_show_info_tooltips_${orgId}`);
            if (stored === 'false') setEnabled(false);
        } catch {}
    }, []);

    const key = statusName.toLowerCase().trim();
    const info = QUALIFICATION_INFO[key] || (key.startsWith('ring') ? QUALIFICATION_INFO['ring'] : undefined);
    if (!info || !enabled) return null;

    return (
        <div className={`relative group inline-flex ${className}`}>
            <Info className="w-3 h-3 text-text-tertiary cursor-help" />
            <div className="absolute left-5 top-0 z-50 hidden group-hover:block w-64 p-3 bg-surface border border-border rounded-xl shadow-xl">
                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: info.color }}>
                    {info.label}
                </p>
                <ul className="space-y-0.5">
                    {info.criteria.map((c, i) => (
                        <li key={i} className="text-[10px] text-text-secondary flex items-start gap-1">
                            <span className="text-text-tertiary mt-px">·</span>
                            {c}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
