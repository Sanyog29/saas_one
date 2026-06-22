'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { Sparkles, Briefcase } from 'lucide-react';
import ExecutiveImpactReport from '@/frontend/components/crm/ExecutiveImpactReport';
import { useAuth } from '@/frontend/context/AuthContext';

export default function ReportsPage() {
    const params = useParams();
    const orgId = params?.orgId as string;
    const { user, membership } = useAuth();

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
                        <Sparkles className="h-6 w-6 text-primary" />
                        CRM Reports
                    </h1>
                    <p className="mt-1 text-sm text-text-secondary">
                        Decision-maker view · leads in, revenue out, by campaign, rep, status.
                    </p>
                </div>
                <div className="text-xs text-text-secondary flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    Signed in as <span className="font-semibold text-text-primary">{user?.email || '—'}</span>
                </div>
            </div>
            <ExecutiveImpactReport orgId={orgId} orgName={membership?.org_name || 'Organization'} />
        </div>
    );
}
