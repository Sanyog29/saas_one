'use client';

/**
 * AddEventModal — create a crm_events row tied to a lead (call / meeting /
 * site visit / follow-up). Posts to /api/crm/events; the server logs the
 * matching activity and the event shows on the CRM calendar + lead timeline.
 */
import React, { useState, useEffect } from 'react';
import { X, CalendarPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CRMEvent, EventType } from '@/frontend/types/crm';

interface AddEventModalProps {
    isOpen: boolean;
    leadId: string;
    organizationId?: string | null;
    leadName?: string;
    defaultType?: EventType;
    defaultTitle?: string;
    requireFuture?: boolean; // used by the "Future" stage hook
    onClose: () => void;
    onCreated: (event: CRMEvent) => void;
}

const EVENT_TYPES: { value: EventType; label: string }[] = [
    { value: 'call', label: 'Call' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'site_visit', label: 'Site Visit' },
    { value: 'followup', label: 'Follow-up' },
];

function localDefault(): string {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    // to yyyy-MM-ddTHH:mm in local time
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AddEventModal({
    isOpen, leadId, organizationId, leadName, defaultType = 'meeting',
    defaultTitle, requireFuture, onClose, onCreated,
}: AddEventModalProps) {
    const [eventType, setEventType] = useState<EventType>(defaultType);
    const [title, setTitle] = useState(defaultTitle || '');
    const [startDatetime, setStartDatetime] = useState(localDefault());
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setEventType(defaultType);
            setTitle(defaultTitle || '');
            setStartDatetime(localDefault());
            setDescription('');
            setError(null);
        }
    }, [isOpen, defaultType, defaultTitle]);

    const handleSubmit = async () => {
        if (!title.trim() || !startDatetime) { setError('Title and date/time are required.'); return; }
        const startIso = new Date(startDatetime).toISOString();
        if (requireFuture && new Date(startIso).getTime() <= Date.now()) {
            setError('Pick a future date for the reminder.'); return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/crm/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: leadId,
                    ...(organizationId ? { organization_id: organizationId } : {}),
                    title: title.trim(),
                    start_datetime: startIso,
                    event_type: eventType,
                    description: description.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) { setError(data?.error || 'Failed to create event.'); return; }
            onCreated(data.event);
            onClose();
        } catch {
            setError('Failed to create event.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                        <h3 className="font-bold text-text-primary flex items-center gap-2">
                            <CalendarPlus className="w-4 h-4 text-primary" />
                            {requireFuture ? 'Schedule future follow-up' : 'Add event'}
                            {leadName && <span className="text-sm font-normal text-text-tertiary">· {leadName}</span>}
                        </h3>
                        <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-slate-100 rounded-xl">
                            <X className="w-4 h-4 text-text-secondary" />
                        </button>
                    </div>

                    <div className="p-5 space-y-4">
                        <div>
                            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Type</label>
                            <div className="grid grid-cols-4 gap-2 mt-1.5">
                                {EVENT_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setEventType(t.value)}
                                        disabled={requireFuture && t.value !== 'followup'}
                                        className={`text-xs font-bold py-2 rounded-xl border transition-colors disabled:opacity-40 ${
                                            eventType === t.value
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white text-text-secondary border-slate-200 hover:border-primary/40'
                                        }`}
                                    >{t.label}</button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Title</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Site visit at Lower Parel"
                                className="w-full mt-1.5 border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Date & time</label>
                            <input
                                type="datetime-local"
                                value={startDatetime}
                                onChange={(e) => setStartDatetime(e.target.value)}
                                className="w-full mt-1.5 border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Notes <span className="font-normal lowercase">(optional)</span></label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                                className="w-full mt-1.5 border border-slate-200 rounded-xl p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                        </div>

                        {error && <p className="text-sm text-red-600">{error}</p>}
                    </div>

                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-text-secondary hover:bg-slate-100 rounded-xl">Cancel</button>
                        <button
                            onClick={handleSubmit}
                            disabled={saving}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                        >{saving ? 'Saving…' : 'Add event'}</button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
