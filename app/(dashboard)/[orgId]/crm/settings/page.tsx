'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Settings, Palette, MapPin, Building2, Bell, Link2, Plus, Edit, Trash2, Loader2, Check, Send } from 'lucide-react';
import Link from 'next/link';
import { LeadStatusConfig, LeadSource } from '@/frontend/types/crm';
import { MetaIntegrationGuide } from '@/frontend/components/crm';

type SettingsTab = 'statuses' | 'sources' | 'properties' | 'territories' | 'integrations';

export default function CRMSettingsPage() {
    const params = useParams();
    const orgId = params?.orgId as string;
    const [activeTab, setActiveTab] = useState<SettingsTab>('statuses');
    const [statuses, setStatuses] = useState<LeadStatusConfig[]>([]);
    const [sources, setSources] = useState<LeadSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editingStatus, setEditingStatus] = useState<LeadStatusConfig | null>(null);
    const [newStatus, setNewStatus] = useState({ name: '', color: '#3B82F6' });
    const [newSource, setNewSource] = useState('');

    useEffect(() => {
        fetchSettings();
    }, [activeTab]);

    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/crm/settings?type=all&org_id=${orgId}`);
            if (res.ok) {
                const data = await res.json();
                setStatuses(data.statuses || []);
                setSources(data.sources || []);
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (status: LeadStatusConfig) => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/crm/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_status',
                    organization_id: orgId,
                    data: status
                })
            });
            if (res.ok) {
                setStatuses(prev => prev.map(s => s.id === status.id ? status : s));
                setEditingStatus(null);
            }
        } catch (error) {
            console.error('Failed to update status:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateStatus = async () => {
        if (!newStatus.name.trim()) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/crm/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create_status',
                    organization_id: orgId,
                    data: newStatus
                })
            });
            if (res.ok) {
                const data = await res.json();
                setStatuses(prev => [...prev, data.status]);
                setNewStatus({ name: '', color: '#3B82F6' });
            }
        } catch (error) {
            console.error('Failed to create status:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteStatus = async (id: string) => {
        if (!confirm('Are you sure you want to delete this status?')) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/crm/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete_status',
                    organization_id: orgId,
                    data: { id }
                })
            });
            if (res.ok) {
                setStatuses(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete status:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateSource = async () => {
        if (!newSource.trim()) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/crm/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create_source',
                    organization_id: orgId,
                    data: { name: newSource }
                })
            });
            if (res.ok) {
                const data = await res.json();
                setSources(prev => [...prev, data.source]);
                setNewSource('');
            }
        } catch (error) {
            console.error('Failed to create source:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSource = async (id: string) => {
        if (!confirm('Are you sure you want to delete this source?')) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/crm/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete_source',
                    organization_id: orgId,
                    data: { id }
                })
            });
            if (res.ok) {
                setSources(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete source:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const tabs = [
        { id: 'statuses' as SettingsTab, label: 'Lead Statuses', icon: Palette },
        { id: 'sources' as SettingsTab, label: 'Lead Sources', icon: Link2 },
        { id: 'properties' as SettingsTab, label: 'Property Mapping', icon: Building2 },
        { id: 'territories' as SettingsTab, label: 'Territories', icon: MapPin },
        { id: 'integrations' as SettingsTab, label: 'Integrations', icon: Bell },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-text-primary">CRM Settings</h1>
                <p className="text-sm text-text-secondary mt-1">
                    Configure lead statuses, sources, and integrations
                </p>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto gap-2 pb-2">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                            activeTab === tab.id
                                ? 'bg-primary text-white'
                                : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                {isLoading ? (
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <>
                        {activeTab === 'statuses' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-text-primary">Lead Statuses</h2>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={newStatus.name}
                                            onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })}
                                            placeholder="New status name"
                                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                        <input
                                            type="color"
                                            value={newStatus.color}
                                            onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })}
                                            className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                                        />
                                        <button
                                            onClick={handleCreateStatus}
                                            disabled={!newStatus.name.trim() || isSaving}
                                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center gap-2"
                                        >
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                            Add Status
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {statuses.map(status => (
                                        <div
                                            key={status.id}
                                            className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
                                        >
                                            {editingStatus?.id === status.id ? (
                                                <div className="flex items-center gap-3 flex-1">
                                                    <input
                                                        type="color"
                                                        value={editingStatus.color}
                                                        onChange={(e) => setEditingStatus({ ...editingStatus, color: e.target.value })}
                                                        className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={editingStatus.name}
                                                        onChange={(e) => setEditingStatus({ ...editingStatus, name: e.target.value })}
                                                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                    />
                                                    <button
                                                        onClick={() => handleUpdateStatus(editingStatus)}
                                                        disabled={isSaving}
                                                        className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingStatus(null)}
                                                        className="p-2 bg-slate-200 text-text-secondary rounded-lg hover:bg-slate-300"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-4 h-4 rounded-full"
                                                            style={{ backgroundColor: status.color }}
                                                        />
                                                        <span className="font-medium text-text-primary">{status.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setEditingStatus(status)}
                                                            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                                                        >
                                                            <Edit className="w-4 h-4 text-text-secondary" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteStatus(status.id)}
                                                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-500" />
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'sources' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-text-primary">Lead Sources</h2>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={newSource}
                                            onChange={(e) => setNewSource(e.target.value)}
                                            placeholder="New source name"
                                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                        <button
                                            onClick={handleCreateSource}
                                            disabled={!newSource.trim() || isSaving}
                                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center gap-2"
                                        >
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                            Add Source
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {sources.map(source => (
                                        <div
                                            key={source.id}
                                            className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                                        >
                                            <span className="font-medium text-text-primary text-sm">{source.name}</span>
                                            <button
                                                onClick={() => handleDeleteSource(source.id)}
                                                className="p-1 hover:bg-red-100 rounded transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'properties' && (
                            <div className="text-center py-12 text-text-secondary">
                                <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                <p>Property mapping configuration</p>
                                <p className="text-sm mt-1">Link properties to CRM property names</p>
                            </div>
                        )}

                        {activeTab === 'territories' && (
                            <div className="text-center py-12 text-text-secondary">
                                <MapPin className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                <p>Territory management</p>
                                <p className="text-sm mt-1">Configure city-based territories for your team</p>
                            </div>
                        )}

                        {activeTab === 'integrations' && (
                            <div className="space-y-8">
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                            <span className="text-xl font-bold text-blue-600">M</span>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-text-primary">Meta Lead Ads</h3>
                                            <p className="text-sm text-text-secondary">Capture Facebook/Instagram leads directly into your CRM</p>
                                        </div>
                                    </div>
                                    <MetaIntegrationGuide orgId={orgId} />
                                </div>

                                <div className="border-t border-slate-200 pt-6">
                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                                <Send className="w-6 h-6 text-green-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-text-primary">WhatsApp Campaigns</h3>
                                                <p className="text-sm text-text-secondary">Send broadcasts & drip sequences to leads via WhatsApp Business</p>
                                            </div>
                                        </div>
                                        <Link href={`/${orgId}/crm/campaigns`}
                                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                                            Open Campaigns
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}