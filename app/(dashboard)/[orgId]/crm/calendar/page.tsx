'use client';

import React, { useState } from 'react';
import { CalendarView } from '@/frontend/components/crm';
import { CRMEvent } from '@/frontend/types/crm';

export default function CalendarPage() {
    const [selectedEvent, setSelectedEvent] = useState<CRMEvent | null>(null);

    const handleEventClick = (event: CRMEvent) => {
        setSelectedEvent(event);
        // Could open a modal to view/edit event details
    };

    return (
        <CalendarView
            onEventClick={handleEventClick}
        />
    );
}
