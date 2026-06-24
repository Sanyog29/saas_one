'use client';

import React, { useRef, useState } from 'react';
import { useAuth } from '@/frontend/context/AuthContext';
import { createClient } from '@/frontend/utils/supabase/client';
import imageCompression from 'browser-image-compression';
import { Image as ImageIcon, Save, Loader2, RotateCcw, UploadCloud } from 'lucide-react';
import {
    readWallpaper,
    saveWallpaperLocal,
    DEFAULT_WALLPAPER_OPACITY,
} from '@/frontend/components/ui/CrmBackground';

interface WallpaperSettingsProps {
    showToast: (message: string, type?: 'success' | 'error') => void;
}

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export default function WallpaperSettings({ showToast }: WallpaperSettingsProps) {
    const { user } = useAuth();
    const supabase = createClient();
    const fileRef = useRef<HTMLInputElement>(null);

    const initial = typeof window !== 'undefined' ? readWallpaper() : { url: '', opacity: DEFAULT_WALLPAPER_OPACITY };
    const [preview, setPreview] = useState<string>(initial.url);
    const [opacity, setOpacity] = useState<number>(initial.opacity);
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);

    const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!ACCEPTED.includes(f.type)) {
            showToast('Please choose a JPG, PNG, or WebP image', 'error');
            return;
        }
        setFile(f);
        setPreview(URL.createObjectURL(f));
    };

    // Merge wallpaper fields into users.metadata without clobbering other keys.
    const persist = async (url: string, op: number) => {
        if (!user) return;
        const { data } = await supabase.from('users').select('metadata').eq('id', user.id).maybeSingle();
        const meta = (data?.metadata || {}) as Record<string, unknown>;
        const nextMeta = { ...meta, crm_background_url: url, crm_background_opacity: op };
        const { error } = await supabase.from('users').update({ metadata: nextMeta }).eq('id', user.id);
        if (error) throw error;
        saveWallpaperLocal({ url, opacity: op });
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            let url = preview;
            if (file) {
                const compressed = await imageCompression(file, {
                    maxSizeMB: 1.5,
                    maxWidthOrHeight: 2560,
                    useWebWorker: true,
                });
                const path = `${user.id}/crm-wallpaper.jpg`;
                const { error: upErr } = await supabase.storage
                    .from('user-photos')
                    .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
                if (upErr) throw upErr;
                const { data } = supabase.storage.from('user-photos').getPublicUrl(path);
                // Cache-bust so the fixed layer reloads the new image at the same path.
                url = `${data.publicUrl}?v=${Date.now()}`;
                setPreview(url);
                setFile(null);
            }
            if (!url) {
                showToast('Upload an image first, or keep the standard background', 'error');
                return;
            }
            await persist(url, opacity);
            showToast('Wallpaper saved');
        } catch (err: any) {
            console.error('Wallpaper save failed:', err);
            showToast(err?.message || 'Failed to save wallpaper', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        setSaving(true);
        try {
            await persist('', DEFAULT_WALLPAPER_OPACITY);
            setPreview('');
            setFile(null);
            setOpacity(DEFAULT_WALLPAPER_OPACITY);
            showToast('Reverted to the standard background');
        } catch (err: any) {
            console.error('Wallpaper reset failed:', err);
            showToast(err?.message || 'Failed to reset', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="bg-white rounded-2xl border border-slate-200 p-4 md:p-8 shadow-sm">
            <h2 className="text-xl font-display font-semibold text-slate-900 mb-1 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                Appearance
            </h2>
            <p className="text-slate-500 font-body text-sm mb-6">
                Set a personal background for your workspace. This applies only to your account — the standard
                white background stays the default for everyone else.
            </p>

            <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
                {/* Preview */}
                <div className="w-full md:w-64 shrink-0">
                    <div
                        className="relative w-full aspect-video rounded-xl border border-slate-200 overflow-hidden bg-slate-50 cursor-pointer group"
                        onClick={() => fileRef.current?.click()}
                    >
                        {preview ? (
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={preview} alt="Wallpaper preview" className="absolute inset-0 w-full h-full object-cover" style={{ opacity }} />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <UploadCloud className="w-7 h-7 text-white" />
                                </div>
                            </>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-1">
                                <UploadCloud className="w-7 h-7" />
                                <span className="text-xs font-semibold">Click to upload</span>
                            </div>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handlePick} className="hidden" />
                    <p className="text-xs font-semibold text-slate-500 mt-2 text-center">JPG, PNG or WebP · up to ~10MB</p>
                </div>

                {/* Controls */}
                <div className="flex-1 w-full space-y-6">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-slate-700">Background opacity</label>
                            <span className="text-sm font-bold text-slate-900">{Math.round(opacity * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min={5}
                            max={70}
                            value={Math.round(opacity * 100)}
                            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                            className="w-full accent-primary"
                        />
                        <p className="text-xs text-slate-500">Keep it subtle so your content stays easy to read.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Use standard
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
