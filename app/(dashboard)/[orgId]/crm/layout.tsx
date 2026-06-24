'use client';

import { CrmOnboardingGate } from '@/frontend/components/crm/onboarding';
import { SoundProvider } from '@/frontend/context/SoundContext';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
    return (
        <SoundProvider>
            <CrmOnboardingGate>{children}</CrmOnboardingGate>
        </SoundProvider>
    );
}
