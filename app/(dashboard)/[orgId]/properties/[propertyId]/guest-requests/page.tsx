'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/frontend/components/ui/card';
import { Button } from '@/frontend/components/ui/button';
import { Loader2, MapPin, Smartphone, Clock, Filter } from 'lucide-react';
import { format } from 'date-fns';

export default function GuestRequestsPage() {
    const { propertyId } = useParams() as { propertyId: string };
    const supabase = createClient();
    
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('ALL');

    useEffect(() => {
        fetchRequests();
    }, [propertyId, filterStatus]);

    const fetchRequests = async () => {
        setLoading(true);
        let query = supabase
            .from('guest_requests')
            .select(`
                *,
                qr_facility_zones (
                    zone_name,
                    floor
                )
            `)
            .eq('property_id', propertyId)
            .order('created_at', { ascending: false });
            
        if (filterStatus !== 'ALL') {
            query = query.eq('status', filterStatus);
        }

        const { data, error } = await query;
            
        if (!error && data) {
            setRequests(data);
        } else {
            console.error('Error fetching guest requests', error);
        }
        setLoading(false);
    };

    const updateStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase
            .from('guest_requests')
            .update({ status: newStatus })
            .eq('id', id);
            
        if (!error) {
            setRequests(requests.map(req => req.id === id ? { ...req, status: newStatus } : req));
        } else {
            console.error('Failed to update status', error);
            alert('Failed to update status. Please try again.');
        }
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'PENDING': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'RESOLVED': return 'bg-green-100 text-green-800 border-green-200';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Guest Requests</h1>
                    <p className="text-gray-500">View and manage issues reported by guests via QR Code.</p>
                </div>
                
                <div className="flex items-center gap-2 bg-white rounded-lg border p-1 shadow-sm">
                    <Filter className="w-4 h-4 text-gray-400 ml-2" />
                    {['ALL', 'PENDING', 'IN_PROGRESS', 'RESOLVED'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                                filterStatus === status 
                                ? 'bg-blue-50 text-blue-700' 
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {status.replace('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : requests.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-dashed">
                    <p className="text-gray-500">No guest requests found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {requests.map((req) => (
                        <Card key={req.id} className="overflow-hidden flex flex-col">
                            <CardHeader className="bg-gray-50 border-b pb-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(req.status)}`}>
                                                {req.status.replace('_', ' ')}
                                            </span>
                                            {req.ai_category && (
                                                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                    AI: {req.ai_category}
                                                </span>
                                            )}
                                        </div>
                                        <CardTitle className="text-lg mt-2">
                                            {req.qr_facility_zones?.zone_name} 
                                            {req.qr_facility_zones?.floor && <span className="text-gray-400 text-sm font-normal ml-2">({req.qr_facility_zones.floor})</span>}
                                        </CardTitle>
                                    </div>
                                    <div className="text-right text-sm text-gray-500">
                                        <div className="flex items-center gap-1 justify-end">
                                            <Clock className="w-3 h-3" />
                                            {format(new Date(req.created_at), 'MMM d, h:mm a')}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            
                            <CardContent className="p-5 flex-1 flex flex-col gap-4">
                                <div className="bg-white border rounded-lg p-3 text-sm text-gray-700">
                                    <p className="font-semibold mb-1 text-gray-900">Description:</p>
                                    <p className="whitespace-pre-wrap">{req.description}</p>
                                </div>
                                
                                {req.photo_urls && req.photo_urls.length > 0 && (
                                    <div>
                                        <p className="text-sm font-semibold mb-2">Photos:</p>
                                        <div className="flex gap-2 overflow-x-auto pb-2">
                                            {req.photo_urls.map((url: string, idx: number) => {
                                                // Assuming we can build public URL if bucket is public, else we need signed URLs.
                                                // For MVP, assuming public bucket or supabase storage URL format:
                                                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                                                const fullUrl = `${supabaseUrl}/storage/v1/object/public/guest-photos/${url}`;
                                                
                                                return (
                                                    <a href={fullUrl} target="_blank" rel="noreferrer" key={idx}>
                                                        <div className="w-24 h-24 rounded-lg bg-gray-100 border overflow-hidden shrink-0 hover:opacity-80 transition-opacity">
                                                            <img src={fullUrl} alt="Issue" className="w-full h-full object-cover" />
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-4 text-sm mt-auto border-t pt-4">
                                    <div>
                                        <p className="text-gray-500 mb-1">Guest Info</p>
                                        <p className="font-medium">{req.guest_name}</p>
                                        {req.guest_phone && <p className="text-gray-600">{req.guest_phone}</p>}
                                        {req.guest_email && <p className="text-gray-600">{req.guest_email}</p>}
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <p className="text-gray-500 mb-1">Context</p>
                                        {req.device_info?.platform && (
                                            <div className="flex items-center gap-1.5 text-gray-600" title={req.device_info.userAgent}>
                                                <Smartphone className="w-4 h-4 text-gray-400" />
                                                <span className="truncate">{req.device_info.platform}</span>
                                            </div>
                                        )}
                                        {req.location_data?.lat && (
                                            <div className="flex items-center gap-1.5 text-blue-600 hover:underline cursor-pointer"
                                                 onClick={() => window.open(`https://maps.google.com/?q=${req.location_data.lat},${req.location_data.lng}`)}>
                                                <MapPin className="w-4 h-4" />
                                                <span>View Location</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>

                            <div className="bg-gray-50 border-t p-4 flex justify-end gap-2">
                                {req.status === 'PENDING' && (
                                    <Button size="sm" onClick={() => updateStatus(req.id, 'IN_PROGRESS')}>
                                        Mark In Progress
                                    </Button>
                                )}
                                {req.status === 'IN_PROGRESS' && (
                                    <Button size="sm" variant="solid" className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus(req.id, 'RESOLVED')}>
                                        Resolve Issue
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
