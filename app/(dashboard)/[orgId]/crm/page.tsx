'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/frontend/context/AuthContext';
import { CRMDashboard } from '@/frontend/components/crm';

export default function CRMPage() {
    const { membership } = useAuth();
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        // Check if user has CRM access
        const role = membership?.org_role;
        if (role && ['bd_rep', 'bd_admin', 'org_admin', 'org_super_admin'].includes(role)) {
            setIsAuthorized(true);
        }
    }, [membership]);

    if (!isAuthorized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-text-primary mb-2">Access Denied</h2>
                    <p className="text-text-secondary">
                        You don&apos;t have permission to access the CRM module.
                    </p>
                </div>
            </div>
        );
    }

    return <CRMDashboard />;
}
