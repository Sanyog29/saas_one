'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Phone, Mail, MapPin, Building, Calendar, User, DollarSign,
    Edit, Trash2, PhoneCall, Video, Map, FileText, MessageSquare,
    Clock, ChevronRight, Plus, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CRMLead, CRMActivity, CRMNote, CRMEvent, TimelineItem } from '@/frontend/types/crm';

interface LeadDetailDrawerProps {
    leadId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onLeadUpdate?: (lead: CRMLead) => void;
}

const ACTIVITY_ICONS: Record<string, any> = {
    created: Plus,
    updated: Edit,
    call: PhoneCall,
    meeting: Video,
    site_visit: Map,
    proposal_sent: FileText,
    followup_scheduled: Calendar,
    status_changed: CheckCircle,
    assigned: User,
    note_added: MessageSquare,
    email_sent: Mail,
    archived: Trash2,
    restored: CheckCircle
};

const STATUS_COLORS: Record<string, string> = {
    'New Lead': '#3B82F6',
    'Contacted': '#EAB308',
    'Meeting Scheduled': '#F97316',
    'Site Visit Scheduled': '#F97316',
    'Proposal Shared': '#A855F7',
    'Negotiation': '#14B8A6',
    'Won': '#22C55E',
    'Lost': '#EF4444',
    'Dropped': '#6B7280',
    'On Hold': '#374151'
};

export default function LeadDetailDrawer({ leadId, isOpen, onClose, onLeadUpdate }: LeadDetailDrawerProps) {
    const [lead, setLead] = useState<CRMLead | null>(null);
    const [activities, setActivities] = useState<CRMActivity[]>([]);
    const [notes, setNotes] = useState<CRMNote[]>([]);
    const [events, setEvents] = useState<CRMEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'activities' | 'notes'>('overview');
    const [newNote, setNewNote] = useState('');
    const [isAddingNote, setIsAddingNote] = useState(false);

    useEffect(() => {
        if (leadId && isOpen) {
            fetchLeadDetails();
        }
    }, [leadId, isOpen]);

    const fetchLeadDetails = async () => {
        if (!leadId) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/crm/leads/${leadId}`);
            if (res.ok) {
                const data = await res.json();
                setLead(data.lead);
                setActivities(data.activities || []);
                setNotes(data.notes || []);
                setEvents(data.events || []);
            }
        } catch (error) {
            console.error('Failed to fetch lead details:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddNote = async () => {
        if (!leadId || !newNote.trim()) return;
        setIsAddingNote(true);
        try {
            const res = await fetch('/api/crm/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead_id: leadId, note: newNote })
            });
            if (res.ok) {
                const data = await res.json();
                setNotes(prev => [data.note, ...prev]);
                setActivities(prev => [{
                    id: `temp-${Date.now()}`,
                    lead_id: leadId,
                    user_id: '',
                    activity_type: 'note_added',
                    description: 'Note added',
                    metadata: {},
                    created_at: new Date().toISOString(),
                    user_info: { id: '', full_name: 'You', email: '' }
                } as CRMActivity, ...prev]);
                setNewNote('');
            }
        } catch (error) {
            console.error('Failed to add note:', error);
        } finally {
            setIsAddingNote(false);
        }
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value);
    };

    const buildTimeline = (): TimelineItem[] => {
        const items: TimelineItem[] = [];

        activities.forEach(activity => {
            const Icon = ACTIVITY_ICONS[activity.activity_type] || Edit;
            items.push({
                id: activity.id,
                type: 'activity',
                timestamp: activity.created_at,
                title: activity.activity_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                description: activity.description,
                icon: Icon.name,
                user: activity.user_info
            });
        });

        return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50"
                onClick={onClose}
            />
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div>
                        <h2 className="text-lg font-bold text-text-primary">
                            {lead?.company_name || lead?.contact_person || 'Lead Details'}
                        </h2>
                        {lead?.status_info && (
                            <div className="flex items-center gap-2 mt-1">
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: STATUS_COLORS[lead.status_info.name] || '#6B7280' }}
                                />
                                <span className="text-sm text-text-secondary">{lead.status_info.name}</span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-text-secondary" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    {['overview', 'timeline', 'activities', 'notes'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                activeTab === tab
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-text-secondary hover:text-text-primary'
                            }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-32 bg-slate-100 rounded-xl" />
                            <div className="h-64 bg-slate-100 rounded-xl" />
                        </div>
                    ) : (
                        <>
                            {activeTab === 'overview' && lead && (
                                <div className="space-y-6">
                                    {/* Quick Actions */}
                                    <div className="grid grid-cols-4 gap-3">
                                        <button className="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                            <PhoneCall className="w-5 h-5 text-primary" />
                                            <span className="text-xs font-medium text-text-secondary">Call</span>
                                        </button>
                                        <button className="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                            <Video className="w-5 h-5 text-primary" />
                                            <span className="text-xs font-medium text-text-secondary">Meeting</span>
                                        </button>
                                        <button className="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                            <FileText className="w-5 h-5 text-primary" />
                                            <span className="text-xs font-medium text-text-secondary">Proposal</span>
                                        </button>
                                        <button className="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                            <MessageSquare className="w-5 h-5 text-primary" />
                                            <span className="text-xs font-medium text-text-secondary">Note</span>
                                        </button>
                                    </div>

                                    {/* Lead Info */}
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                                        <h3 className="font-semibold text-text-primary">Contact Information</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {lead.contact_person && (
                                                <div className="flex items-center gap-3">
                                                    <User className="w-4 h-4 text-text-tertiary" />
                                                    <div>
                                                        <p className="text-xs text-text-tertiary">Contact Person</p>
                                                        <p className="text-sm font-medium text-text-primary">{lead.contact_person}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {lead.contact_number && (
                                                <div className="flex items-center gap-3">
                                                    <Phone className="w-4 h-4 text-text-tertiary" />
                                                    <div>
                                                        <p className="text-xs text-text-tertiary">Phone</p>
                                                        <p className="text-sm font-medium text-text-primary">{lead.contact_number}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {lead.email && (
                                                <div className="flex items-center gap-3">
                                                    <Mail className="w-4 h-4 text-text-tertiary" />
                                                    <div>
                                                        <p className="text-xs text-text-tertiary">Email</p>
                                                        <p className="text-sm font-medium text-text-primary">{lead.email}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {lead.location && (
                                                <div className="flex items-center gap-3">
                                                    <MapPin className="w-4 h-4 text-text-tertiary" />
                                                    <div>
                                                        <p className="text-xs text-text-tertiary">Location</p>
                                                        <p className="text-sm font-medium text-text-primary">{lead.location}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Deal Info */}
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                                        <h3 className="font-semibold text-text-primary">Deal Information</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-xs text-text-tertiary">Deal Value</p>
                                                <p className="text-xl font-bold text-text-primary">{formatCurrency(lead.deal_value)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-text-tertiary">Priority</p>
                                                <p className={`text-sm font-medium ${
                                                    lead.priority === 'Urgent' ? 'text-red-600' :
                                                    lead.priority === 'High' ? 'text-orange-600' :
                                                    'text-text-primary'
                                                }`}>{lead.priority}</p>
                                            </div>
                                            {lead.property_info && (
                                                <div>
                                                    <p className="text-xs text-text-tertiary">Property Interest</p>
                                                    <p className="text-sm font-medium text-text-primary">{lead.property_info.name}</p>
                                                </div>
                                            )}
                                            {lead.source_info && (
                                                <div>
                                                    <p className="text-xs text-text-tertiary">Lead Source</p>
                                                    <p className="text-sm font-medium text-text-primary">{lead.source_info.name}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Assignment */}
                                    {lead.assigned_user && (
                                        <div className="bg-slate-50 rounded-xl p-4">
                                            <h3 className="font-semibold text-text-primary mb-3">Assigned To</h3>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <User className="w-5 h-5 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-text-primary">{lead.assigned_user.full_name}</p>
                                                    <p className="text-xs text-text-secondary">{lead.assigned_user.email}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Requirement */}
                                    {lead.requirement && (
                                        <div className="bg-slate-50 rounded-xl p-4">
                                            <h3 className="font-semibold text-text-primary mb-2">Requirement</h3>
                                            <p className="text-sm text-text-secondary">{lead.requirement}</p>
                                        </div>
                                    )}

                                    {/* Remarks */}
                                    {lead.remarks && (
                                        <div className="bg-slate-50 rounded-xl p-4">
                                            <h3 className="font-semibold text-text-primary mb-2">Remarks</h3>
                                            <p className="text-sm text-text-secondary">{lead.remarks}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'timeline' && (
                                <div className="space-y-4">
                                    {buildTimeline().length === 0 ? (
                                        <div className="text-center py-12 text-text-secondary">
                                            <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                            <p>No activity yet</p>
                                        </div>
                                    ) : (
                                        buildTimeline().map((item, index) => {
                                            const Icon = ACTIVITY_ICONS[item.icon] || Edit;
                                            return (
                                                <div key={item.id} className="flex gap-4">
                                                    <div className="flex flex-col items-center">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                                            {Icon && <Icon className="w-4 h-4 text-text-secondary" />}
                                                        </div>
                                                        {index < buildTimeline().length - 1 && (
                                                            <div className="w-px h-full bg-slate-200 mt-2" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 pb-4">
                                                        <div className="flex items-center justify-between">
                                                            <p className="font-medium text-text-primary text-sm">{item.title}</p>
                                                            <span className="text-xs text-text-tertiary">
                                                                {formatDate(item.timestamp)}
                                                            </span>
                                                        </div>
                                                        {item.description && (
                                                            <p className="text-sm text-text-secondary mt-1">{item.description}</p>
                                                        )}
                                                        {item.user && (
                                                            <p className="text-xs text-text-tertiary mt-1">by {item.user.full_name}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            {activeTab === 'activities' && (
                                <div className="space-y-4">
                                    {activities.length === 0 ? (
                                        <div className="text-center py-12 text-text-secondary">
                                            <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                            <p>No activities recorded</p>
                                        </div>
                                    ) : (
                                        activities.map(activity => {
                                            const Icon = ACTIVITY_ICONS[activity.activity_type] || Edit;
                                            return (
                                                <div key={activity.id} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl">
                                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center border border-slate-200">
                                                        {Icon && <Icon className="w-5 h-5 text-primary" />}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between">
                                                            <p className="font-medium text-text-primary text-sm">
                                                                {activity.activity_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                            </p>
                                                            <span className="text-xs text-text-tertiary">{formatDate(activity.created_at)}</span>
                                                        </div>
                                                        {activity.description && (
                                                            <p className="text-sm text-text-secondary mt-1">{activity.description}</p>
                                                        )}
                                                        {activity.user_info && (
                                                            <p className="text-xs text-text-tertiary mt-1">by {activity.user_info.full_name}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            {activeTab === 'notes' && (
                                <div className="space-y-4">
                                    {/* Add Note */}
                                    <div className="flex gap-3">
                                        <textarea
                                            value={newNote}
                                            onChange={(e) => setNewNote(e.target.value)}
                                            placeholder="Add a note..."
                                            className="flex-1 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            rows={3}
                                        />
                                        <button
                                            onClick={handleAddNote}
                                            disabled={!newNote.trim() || isAddingNote}
                                            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors self-end"
                                        >
                                            {isAddingNote ? 'Adding...' : 'Add'}
                                        </button>
                                    </div>

                                    {/* Notes List */}
                                    {notes.length === 0 ? (
                                        <div className="text-center py-12 text-text-secondary">
                                            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                            <p>No notes yet</p>
                                        </div>
                                    ) : (
                                        notes.map(note => (
                                            <div key={note.id} className="p-4 bg-slate-50 rounded-xl">
                                                <p className="text-sm text-text-primary">{note.note}</p>
                                                <div className="flex items-center justify-between mt-3">
                                                    <span className="text-xs text-text-tertiary">
                                                        {note.user_info?.full_name || 'Unknown'}
                                                    </span>
                                                    <span className="text-xs text-text-tertiary">{formatDate(note.created_at)}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}