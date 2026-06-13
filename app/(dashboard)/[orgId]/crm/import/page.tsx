'use client';

import React, { useState } from 'react';
import { ImportWizard } from '@/frontend/components/crm';

export default function ImportPage() {
    const [isWizardOpen, setIsWizardOpen] = useState(true);

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-text-primary">Import Leads</h1>
                <p className="text-sm text-text-secondary mt-1">
                    Upload a CSV file to import leads into your CRM
                </p>
            </div>

            <ImportWizard
                isOpen={isWizardOpen}
                onClose={() => setIsWizardOpen(false)}
                onComplete={(results) => {
                    console.log('Import completed:', results);
                }}
            />
        </div>
    );
}
