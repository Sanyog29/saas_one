'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/frontend/context/AuthContext';
import { createClient } from '@/frontend/utils/supabase/client';

// Per-user wallpaper for the CRM shell. The URL + opacity live on
// users.metadata (so they sync across devices, including the mobile app) and
// are mirrored into localStorage for an instant, flash-free first paint.
export const WALLPAPER_EVENT = 'crm-wallpaper-changed';
export const DEFAULT_WALLPAPER_OPACITY = 0.25;

export interface WallpaperState {
    url: string;
    opacity: number;
}

// Storage is namespaced by user id so a wallpaper is strictly personal: on a
// shared device, signing in as someone else never shows the previous user's
// background (each id has its own key, and no id => no wallpaper).
function keyFor(userId: string | null | undefined): string | null {
    return userId ? `crm:wallpaper:${userId}` : null;
}

export function readWallpaper(userId: string | null | undefined): WallpaperState {
    const empty = { url: '', opacity: DEFAULT_WALLPAPER_OPACITY };
    const key = keyFor(userId);
    if (typeof window === 'undefined' || !key) return empty;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return empty;
        const parsed = JSON.parse(raw);
        return {
            url: typeof parsed.url === 'string' ? parsed.url : '',
            opacity: typeof parsed.opacity === 'number' ? parsed.opacity : DEFAULT_WALLPAPER_OPACITY,
        };
    } catch {
        return empty;
    }
}

export function saveWallpaperLocal(userId: string | null | undefined, state: WallpaperState) {
    const key = keyFor(userId);
    if (typeof window === 'undefined' || !key) return;
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch {
        /* ignore quota / private-mode errors */
    }
    window.dispatchEvent(new CustomEvent(WALLPAPER_EVENT));
}

// Subscribe to the signed-in user's wallpaper. Updates live when the settings
// panel saves (same tab via custom event) or another tab changes it (storage
// event). Returns the standard (empty) background when signed out.
export function useWallpaper(): WallpaperState {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const [wp, setWp] = useState<WallpaperState>(() => readWallpaper(userId));
    useEffect(() => {
        const sync = () => setWp(readWallpaper(userId));
        sync(); // re-read immediately when the active user changes
        window.addEventListener(WALLPAPER_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(WALLPAPER_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, [userId]);
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
                const cur = readWallpaper(user.id);
                if (cur.url !== next.url || cur.opacity !== next.opacity) {
                    saveWallpaperLocal(user.id, next);
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
