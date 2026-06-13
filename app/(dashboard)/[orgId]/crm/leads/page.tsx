'use client';

import React, { useState } from 'react';
import { useAuth } from '@/frontend/context/AuthContext';
import { LeadsTable, LeadDetailDrawer, LeadForm } from '@/frontend/components/crm';
import { CRMLead, CreateLeadInput } from '@/frontend/types/crm';

export default function LeadsPage() {
    const { membership } = useAuth();
    const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingLead, setEditingLead] = useState<CRMLead | null>(null);

    const handleLeadSelect = (lead: CRMLead) => {
        setSelectedLead(lead);
        setIsDetailOpen(true);
    };

    const handleCreateLead = () => {
        setEditingLead(null);
        setIsFormOpen(true);
    };

    const handleEditLead = (lead: CRMLead) => {
        setEditingLead(lead);
        setIsFormOpen(true);
        setIsDetailOpen(false);
    };

    const handleSubmitLead = async (data: CreateLeadInput) => {
        const url = editingLead ? `/api/crm/leads/${editingLead.id}` : '/api/crm/leads';
        const method = editingLead ? 'PATCH' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to save lead');
        }
    };

    return (
        <div>
            <LeadsTable
                onLeadSelect={handleLeadSelect}
                onCreateLead={handleCreateLead}
            />

            <LeadDetailDrawer
                leadId={selectedLead?.id || null}
                isOpen={isDetailOpen}
                onClose={() => {
                    setIsDetailOpen(false);
                    setSelectedLead(null);
                }}
                onLeadUpdate={(lead) => setSelectedLead(lead)}
            />

            <LeadForm
                isOpen={isFormOpen}
                onClose={() => {
                    setIsFormOpen(false);
                    setEditingLead(null);
                }}
                onSubmit={handleSubmitLead}
                initialData={editingLead || undefined}
                mode={editingLead ? 'edit' : 'create'}
            />
        </div>
    );
}