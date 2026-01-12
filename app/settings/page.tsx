'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { User, Bell, AlertTriangle, Settings, ArrowLeft } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

// Settings Input Component
const SettingsInput = ({
    label,
    value,
    onChange,
    placeholder,
    disabled = false,
    helperText,
    type = 'text'
}: {
    label: string;
    value: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    disabled?: boolean;
    helperText?: string;
    type?: string;
}) => (
    <div className="flex flex-col gap-2">
        <label className="text-sm text-slate-300 font-medium">{label}</label>
        <input
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            className={`
                w-full px-4 py-3 rounded-lg 
                bg-[#0d1321] border border-slate-700/50
                text-slate-200 placeholder:text-slate-500
                focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30
                transition-all duration-200
                ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
            `}
        />
        {helperText && (
            <p className="text-xs text-slate-500">{helperText}</p>
        )}
    </div>
);

// Settings Select Component
const SettingsSelect = ({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    options: { value: string; label: string }[];
}) => (
    <div className="flex flex-col gap-2">
        <label className="text-sm text-slate-300 font-medium">{label}</label>
        <select
            value={value}
            onChange={onChange}
            className="
                w-full px-4 py-3 rounded-lg 
                bg-[#0d1321] border border-slate-700/50
                text-slate-200
                focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30
                transition-all duration-200
                appearance-none cursor-pointer
            "
            style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 0.75rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em'
            }}
        >
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </div>
);

// Tab type
type TabKey = 'basic' | 'notifications' | 'emergency' | 'advanced';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'basic', label: 'Basic', icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'emergency', label: 'Emergency', icon: AlertTriangle },
    { key: 'advanced', label: 'Advanced', icon: Settings },
];

const DEPARTMENT_OPTIONS = [
    { value: 'administration', label: 'Administration' },
    { value: 'operations', label: 'Operations' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'security', label: 'Security' },
    { value: 'finance', label: 'Finance' },
    { value: 'hr', label: 'Human Resources' },
    { value: 'it', label: 'IT' },
];

export default function SettingsPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const supabase = createClient();

    const [activeTab, setActiveTab] = useState<TabKey>('basic');
    const [saving, setSaving] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);

    // Form state
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        officeNumber: '',
        department: 'administration',
        floor: '',
        zone: '',
        staffRoleReason: '',
    });

    // Load user profile
    useEffect(() => {
        const loadProfile = async () => {
            if (!user) return;

            const { data: profile } = await supabase
                .from('users')
                .select('*')
                .eq('external_auth_id', user.id)
                .single();

            if (profile) {
                setUserProfile(profile);
                const nameParts = (profile.full_name || '').split(' ');
                setFormData(prev => ({
                    ...prev,
                    firstName: nameParts[0] || '',
                    lastName: nameParts.slice(1).join(' ') || '',
                    email: profile.email || user.email || '',
                    phone: profile.phone || '',
                    officeNumber: profile.office_number || '',
                    department: profile.department || 'administration',
                    floor: profile.floor || '',
                    zone: profile.zone || '',
                }));
            } else {
                setFormData(prev => ({
                    ...prev,
                    email: user.email || '',
                    firstName: user.user_metadata?.full_name?.split(' ')[0] || '',
                    lastName: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
                }));
            }
        };

        loadProfile();
    }, [user, supabase]);

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    const handleSaveChanges = async () => {
        if (!user) return;
        setSaving(true);

        try {
            const { error } = await supabase
                .from('users')
                .update({
                    full_name: `${formData.firstName} ${formData.lastName}`.trim(),
                    phone: formData.phone,
                    office_number: formData.officeNumber,
                    department: formData.department,
                    floor: formData.floor,
                    zone: formData.zone,
                })
                .eq('external_auth_id', user.id);

            if (error) {
                console.error('Error updating profile:', error);
            }
        } catch (err) {
            console.error('Error saving changes:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleRequestStaffRole = async () => {
        if (!user || !formData.staffRoleReason.trim()) return;
        // Placeholder for staff role request logic
        console.log('Requesting staff role:', formData.staffRoleReason);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#080b14]">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-[#080b14] relative overflow-hidden">
            {/* Animated stars background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                {[...Array(50)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            opacity: Math.random() * 0.5 + 0.2,
                            animationDelay: `${Math.random() * 3}s`,
                            animationDuration: `${2 + Math.random() * 3}s`,
                        }}
                    />
                ))}
            </div>

            {/* Content */}
            <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link
                        href="/"
                        className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </Link>
                    <h1 className="text-2xl font-display font-bold text-white">Profile Settings</h1>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-8 bg-slate-800/30 p-1.5 rounded-xl">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`
                                    flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm
                                    transition-all duration-200
                                    ${isActive
                                        ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                    }
                                `}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                {activeTab === 'basic' && (
                    <div className="space-y-8">
                        {/* Basic Info Form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <SettingsInput
                                label="First Name"
                                value={formData.firstName}
                                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                placeholder="Enter first name"
                            />
                            <SettingsInput
                                label="Last Name"
                                value={formData.lastName}
                                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                placeholder="Enter last name"
                            />
                        </div>

                        <SettingsInput
                            label="Email"
                            value={formData.email}
                            disabled
                            helperText="Email cannot be changed. Contact support for assistance."
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <SettingsInput
                                label="Phone Number"
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                placeholder="+91 1122334455"
                            />
                            <SettingsInput
                                label="Office Number"
                                value={formData.officeNumber}
                                onChange={(e) => setFormData(prev => ({ ...prev, officeNumber: e.target.value }))}
                                placeholder="987653210"
                            />
                        </div>

                        <SettingsSelect
                            label="Department"
                            value={formData.department}
                            onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                            options={DEPARTMENT_OPTIONS}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <SettingsInput
                                label="Floor (Optional)"
                                value={formData.floor}
                                onChange={(e) => setFormData(prev => ({ ...prev, floor: e.target.value }))}
                                placeholder="e.g., 5th Floor, Ground"
                            />
                            <SettingsInput
                                label="Zone (Optional)"
                                value={formData.zone}
                                onChange={(e) => setFormData(prev => ({ ...prev, zone: e.target.value }))}
                                placeholder="e.g., North Wing, Zone A"
                            />
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSaveChanges}
                            disabled={saving}
                            className="
                                w-full py-4 rounded-lg font-semibold text-white
                                bg-gradient-to-r from-cyan-500 to-blue-500
                                hover:from-cyan-400 hover:to-blue-400
                                shadow-lg shadow-cyan-500/25
                                transition-all duration-200
                                disabled:opacity-50 disabled:cursor-not-allowed
                            "
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>

                        {/* Request Staff Role Section */}
                        <div className="mt-12 pt-8 border-t border-slate-700/50">
                            <h2 className="text-xl font-display font-semibold text-white mb-2">
                                Request Staff Role
                            </h2>
                            <p className="text-sm text-slate-400 mb-6">
                                Submit a request to become a staff member. Your request will be reviewed by an administrator.
                            </p>

                            <div className="flex flex-col gap-2 mb-4">
                                <label className="text-sm text-slate-300 font-medium">Reason for Request</label>
                                <textarea
                                    value={formData.staffRoleReason}
                                    onChange={(e) => setFormData(prev => ({ ...prev, staffRoleReason: e.target.value }))}
                                    placeholder="Explain why you would like to become a staff member..."
                                    rows={4}
                                    className="
                                        w-full px-4 py-3 rounded-lg 
                                        bg-[#0d1321] border border-slate-700/50
                                        text-slate-200 placeholder:text-slate-500
                                        focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30
                                        transition-all duration-200 resize-none
                                    "
                                />
                            </div>

                            <button
                                onClick={handleRequestStaffRole}
                                disabled={!formData.staffRoleReason.trim()}
                                className="
                                    px-6 py-3 rounded-lg font-medium text-sm
                                    bg-slate-700/50 text-slate-300
                                    hover:bg-slate-700 hover:text-white
                                    transition-all duration-200
                                    disabled:opacity-50 disabled:cursor-not-allowed
                                "
                            >
                                Submit Request
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'notifications' && (
                    <div className="text-center py-16">
                        <Bell className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-300 mb-2">Notification Preferences</h3>
                        <p className="text-slate-500">Configure your notification settings here.</p>
                    </div>
                )}

                {activeTab === 'emergency' && (
                    <div className="text-center py-16">
                        <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-300 mb-2">Emergency Contacts</h3>
                        <p className="text-slate-500">Add and manage your emergency contact information.</p>
                    </div>
                )}

                {activeTab === 'advanced' && (
                    <div className="text-center py-16">
                        <Settings className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-300 mb-2">Advanced Settings</h3>
                        <p className="text-slate-500">Configure advanced account settings.</p>
                    </div>
                )}

                {/* Role Info Card */}
                {userProfile && (
                    <div className="mt-8 p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
                        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
                            Your Role Information
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Role</p>
                                <p className="text-sm font-medium text-white capitalize">
                                    {userProfile.role_key?.replace(/_/g, ' ') || 'User'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Status</p>
                                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${userProfile.status === 'active'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                    {userProfile.status || 'Pending'}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Role Level</p>
                                <p className="text-sm font-medium text-white">
                                    Level {userProfile.role_level ?? 0}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Member Since</p>
                                <p className="text-sm font-medium text-white">
                                    {userProfile.created_at
                                        ? new Date(userProfile.created_at).toLocaleDateString()
                                        : 'N/A'
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
