'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/frontend/context/AuthContext';
import { createClient } from '@/frontend/utils/supabase/client';

// Per-user wallpaper for the CRM shell. The URL + opacity live on
// users.metadata (so they sync across devices, including the mobile app) and
// are mirrored into localStorage for an instant, flash-free first paint.
export const WALLPAPER_KEY = 'crm:wallpaper';
export const WALLPAPER_EVENT = 'crm-wallpaper-changed';
export const DEFAULT_WALLPAPER_OPACITY = 0.25;

export interface WallpaperState {
    url: string;
    opacity: number;
}

export function readWallpaper(): WallpaperState {
    if (typeof window === 'undefined') return { url: '', opacity: DEFAULT_WALLPAPER_OPACITY };
    try {
        const raw = localStorage.getItem(WALLPAPER_KEY);
        if (!raw) return { url: '', opacity: DEFAULT_WALLPAPER_OPACITY };
        const parsed = JSON.parse(raw);
        return {
            url: typeof parsed.url === 'string' ? parsed.url : '',
            opacity: typeof parsed.opacity === 'number' ? parsed.opacity : DEFAULT_WALLPAPER_OPACITY,
        };
    } catch {
        return { url: '', opacity: DEFAULT_WALLPAPER_OPACITY };
    }
}

export function saveWallpaperLocal(state: WallpaperState) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(WALLPAPER_KEY, JSON.stringify(state));
    } catch {
        /* ignore quota / private-mode errors */
    }
    window.dispatchEvent(new CustomEvent(WALLPAPER_EVENT));
}

// Subscribe to the current wallpaper. Updates live when the settings panel
// saves (same tab via custom event) or another tab changes it (storage event).
export function useWallpaper(): WallpaperState {
    const [wp, setWp] = useState<WallpaperState>(() => readWallpaper());
    useEffect(() => {
        const handler = () => setWp(readWallpaper());
        window.addEventListener(WALLPAPER_EVENT, handler);
        window.addEventListener('storage', handler);
        return () => {
            window.removeEventListener(WALLPAPER_EVENT, handler);
            window.removeEventListener('storage', handler);
        };
    }, []);
    return wp;
}

export default function CrmBackground() {
    const { user } = useAuth();
    const wp = useWallpaper();

    // Pull the authoritative value from the user's profile once per session so
    // a wallpaper set on another device shows up here too.
    useEffect(() => {
        if (!user?.id) return;
        const supabase = createClient();
        let cancelled = false;
        supabase
            .from('users')
            .select('metadata')
            .eq('id', user.id)
            .maybeSingle()
            .then(({ data }) => {
                if (cancelled || !data) return;
                const meta = (data.metadata || {}) as Record<string, unknown>;
                const next: WallpaperState = {
                    url: typeof meta.crm_background_url === 'string' ? (meta.crm_background_url as string) : '',
                    opacity:
                        typeof meta.crm_background_opacity === 'number'
                            ? (meta.crm_background_opacity as number)
                            : DEFAULT_WALLPAPER_OPACITY,
                };
                const cur = readWallpaper();
                if (cur.url !== next.url || cur.opacity !== next.opacity) {
                    saveWallpaperLocal(next);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    if (!wp.url) return null;

    return (
        <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url("${wp.url}")`, opacity: wp.opacity }}
        />
    );
}
