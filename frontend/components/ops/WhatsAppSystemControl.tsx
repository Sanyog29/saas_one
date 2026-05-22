'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Shield, Power, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/frontend/utils/supabase/client';
import { motion } from 'framer-motion';

export default function WhatsAppSystemControl() {
    const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'whatsapp_notifications_enabled')
            .maybeSingle();

        if (data) {
            setIsEnabled(data.value === true);
        } else {
            // If row doesn't exist, default to false and create it (if master admin)
            setIsEnabled(false);
        }
        setIsLoading(false);
    };

    const toggleWhatsApp = async () => {
        setIsUpdating(true);
        const newValue = !isEnabled;
        
        const { error } = await supabase
            .from('system_config')
            .upsert({
                key: 'whatsapp_notifications_enabled',
                value: newValue as any,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        if (!error) {
            setIsEnabled(newValue);
        } else {
            console.error('Error updating WhatsApp status:', error);
        }
        setIsUpdating(false);
    };

    if (isLoading) return null;

    return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">WhatsApp System</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Global Wasender Toggle</p>
                    </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${isEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {isEnabled ? 'System Live' : 'System Paused'}
                </div>
            </div>

            <div className="p-6 space-y-6">
                <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${isEnabled ? 'bg-emerald-500 shadow-lg shadow-emerald-200' : 'bg-slate-200'}`}>
                        <Power className={`w-6 h-6 ${isEnabled ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-slate-600 font-bold leading-relaxed mb-4">
                            This switch controls all automated WhatsApp notifications across the entire platform. 
                            When off, no messages will be sent via Wasender.
                        </p>
                        
                        <button
                            onClick={toggleWhatsApp}
                            disabled={isUpdating}
                            className={`group relative w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3
                                ${isEnabled 
                                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' 
                                    : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-xl shadow-emerald-100'
                                }`}
                        >
                            {isUpdating ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : isEnabled ? (
                                <>
                                    <Power className="w-4 h-4" /> Shutdown WhatsApp Service
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" /> Activate WhatsApp Service
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="bg-amber-50 rounded-2xl p-4 flex items-start gap-3 border border-amber-100">
                    <Shield className="w-4 h-4 text-amber-500 mt-0.5" />
                    <p className="text-[10px] text-amber-800 font-bold leading-relaxed uppercase tracking-tight">
                        Warning: Turning this on will resume all enqueued ticket alerts and reminders immediately.
                    </p>
                </div>
            </div>
        </div>
    );
}
