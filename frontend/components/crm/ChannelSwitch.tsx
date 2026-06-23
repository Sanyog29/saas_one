'use client';

import React from 'react';
import { CHANNEL_OPTIONS, Channel } from '@/frontend/lib/crm/channels';

/**
 * Segmented control to filter ANY existing dashboard by ad channel.
 * Pass the selected value as ?channel= to the same data endpoint — no separate
 * Meta/LinkedIn dashboards. `value` of 'all' means no filter.
 */
export default function ChannelSwitch({
    value,
    onChange,
    className = '',
}: {
    value: Channel | 'all';
    onChange: (v: Channel | 'all') => void;
    className?: string;
}) {
    return (
        <div className={`inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl ${className}`}>
            {CHANNEL_OPTIONS.map((opt) => {
                const active = value === opt.key;
                return (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={() => onChange(opt.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            active ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
