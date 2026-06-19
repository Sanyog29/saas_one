'use client';

import { CrmOnboardingGate } from '@/frontend/components/crm/onboarding';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
    return <CrmOnboardingGate>{children}</CrmOnboardingGate>;
}
