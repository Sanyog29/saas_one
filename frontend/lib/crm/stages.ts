/**
 * Lead lifecycle stage visuals — single source of truth mapping a stage NAME
 * (as stored in crm_lead_statuses.name) to its icon, color, pipeline node size
 * and group. Mapped by name so no DB icon column is needed; unknown/org-custom
 * statuses fall back to a neutral circle.
 */
import type React from 'react';
import {
    PhoneCall, CalendarClock, MapPin, MapPinCheck, LayoutGrid,
    FileSignature, Trophy, XCircle, Circle,
} from 'lucide-react';
import { WarmFlameIcon, ColdFaceIcon, HotFaceIcon } from '@/frontend/components/crm/icons/StageFaceIcons';

export type StageSize = 'lg' | 'sm';
export type StageGroup = 'attempt' | 'visit' | 'deal' | 'terminal';

export interface StageVisual {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    size: StageSize;   // lg = big milestone circle, sm = small sub-circle
    group: StageGroup;
    ring?: number;  // call-attempt number (1-10), rendered as a pip
}

const MAP: Record<string, StageVisual> = {
    'warm':          { icon: WarmFlameIcon, color: '#F59E0B', size: 'lg', group: 'attempt' },
    'ring':          { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt' },
    'ring 1':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 1 },
    'ring 2':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 2 },
    'ring 3':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 3 },
    'ring 4':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 4 },
    'ring 5':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 5 },
    'ring 6':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 6 },
    'ring 7':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 7 },
    'ring 8':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 8 },
    'ring 9':        { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 9 },
    'ring 10':       { icon: PhoneCall,     color: '#FB923C', size: 'sm', group: 'attempt', ring: 10 },
    'cold':          { icon: ColdFaceIcon,  color: '#38BDF8', size: 'lg', group: 'attempt' },
    'hot':           { icon: HotFaceIcon,   color: '#EF4444', size: 'lg', group: 'attempt' },
    'future':        { icon: CalendarClock, color: '#8B5CF6', size: 'sm', group: 'visit' },
    'visit pending': { icon: MapPin,        color: '#0EA5E9', size: 'sm', group: 'visit' },
    'visit done':    { icon: MapPinCheck,   color: '#14B8A6', size: 'sm', group: 'visit' },
    'layout shared': { icon: LayoutGrid,    color: '#A855F7', size: 'lg', group: 'deal' },
    'loi':           { icon: FileSignature, color: '#6366F1', size: 'lg', group: 'deal' },
    'close':         { icon: Trophy,        color: '#22C55E', size: 'lg', group: 'terminal' },
    'loss':          { icon: XCircle,       color: '#64748B', size: 'lg', group: 'terminal' },
};

const FALLBACK: StageVisual = { icon: Circle, color: '#94A3B8', size: 'sm', group: 'attempt' };

export function getStageVisual(nameOrKey?: string | null): StageVisual {
    if (!nameOrKey) return FALLBACK;
    return MAP[nameOrKey.toLowerCase().trim()] || FALLBACK;
}
