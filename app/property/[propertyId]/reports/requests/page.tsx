'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft, Download, Printer, ChevronLeft, ChevronRight, FileDown, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';


interface TicketData {
    id: string;
    ticketNumber: string;
    ticketNumberDisplay: string;
    title: string;
    description: string;
    category: string;
    status: string;
    priority: string;
    floor: string | null;
    floorLabel: string;
    location: string | null;
    reportedDate: string;
    closedDate: string | null;
    spocName: string;
    spocEmail: string;
    assigneeName: string;
    beforePhoto: string | null;
    afterPhoto: string | null;
}

interface ReportData {
    month: { value: string; label: string };
    property: { name: string; code: string; address?: string };
    kpis: { totalSnags: number; closedSnags: number; openSnags: number; closureRate: number };
    charts: {
        floor: { labels: string[]; data: number[] };
        department: { labels: string[]; open: number[]; closed: number[] };
    };
    floorGroups: Record<string, TicketData[]>;
    tickets: TicketData[];
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function changeMonth(month: string, delta: number) {
    const [year, m] = month.split('-').map(Number);
    const d = new Date(year, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function RequestsReportPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const propertyId = params?.propertyId as string;

    const [month, setMonth] = useState(() => searchParams.get('month') || getCurrentMonth());
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chartInstances, setChartInstances] = useState<any[]>([]);
    const [displayLimit, setDisplayLimit] = useState(15);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    useEffect(() => {
        fetchReportData();
    }, [month, propertyId]);

    useEffect(() => {
        if (reportData) {
            chartInstances.forEach(c => c.destroy());
            setChartInstances([]);
            initCharts();
        }
    }, [reportData]);

    // Resize charts to their print dimensions just before the print dialog renders
    useEffect(() => {
        const handleBeforePrint = () => {
            chartInstances.forEach(chart => chart.resize());
        };
        window.addEventListener('beforeprint', handleBeforePrint);
        return () => window.removeEventListener('beforeprint', handleBeforePrint);
    }, [chartInstances]);

    const fetchReportData = async () => {
        setIsLoading(true);
        setError(null);
        setReportData(null);
        try {
            const response = await fetch(`/api/reports/requests-report?propertyId=${propertyId}&month=${month}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to fetch report');
            setReportData(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load report');
        } finally {
            setIsLoading(false);
        }
    };

    const initCharts = async () => {
        if (!reportData || typeof window === 'undefined') return;
        const Chart = (await import('chart.js/auto')).default;

        const floorCanvas = document.getElementById('floorChartReq') as HTMLCanvasElement;
        if (floorCanvas) {
            Chart.getChart(floorCanvas)?.destroy();
            const instance = new Chart(floorCanvas, {
                type: 'bar',
                data: {
                    labels: reportData.charts.floor.labels,
                    datasets: [{
                        label: 'total tickets',
                        data: reportData.charts.floor.data,
                        backgroundColor: '#708F96',
                        borderRadius: 4,
                    }],
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 },
                    onClick: (_e, elements) => {
                        if (elements.length > 0) {
                            const label = reportData.charts.floor.labels[elements[0].index];
                            const el = document.getElementById(`floor-${label.replace(/\s+/g, '-').toLowerCase()}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: 'tickets by floor (click to navigate)' },
                    },
                },
            });
            setChartInstances(prev => [...prev, instance]);
        }

        const deptCanvas = document.getElementById('deptChartReq') as HTMLCanvasElement;
        if (deptCanvas) {
            Chart.getChart(deptCanvas)?.destroy();
            const instance = new Chart(deptCanvas, {
                type: 'bar',
                data: {
                    labels: reportData.charts.department.labels,
                    datasets: [
                        { label: 'open', data: reportData.charts.department.open, backgroundColor: '#E74C3C' },
                        { label: 'closed', data: reportData.charts.department.closed, backgroundColor: '#27AE60' },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 },
                    scales: { x: { stacked: true }, y: { stacked: true } },
                    plugins: { title: { display: true, text: 'tickets by category' } },
                },
            });
            setChartInstances(prev => [...prev, instance]);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const handleExportCSV = () => {
        if (!reportData) return;
        const headers = ['ticket id', 'title', 'description', 'category', 'floor', 'location', 'status', 'priority', 'spoc', 'assignee', 'reported date', 'closure date'];
        const rows = reportData.tickets.map(t => [
            t.ticketNumberDisplay, t.title, t.description?.replace(/,/g, ';') || '',
            t.category, t.floorLabel, t.location || '-', t.status, t.priority,
            t.spocName, t.assigneeName, formatDate(t.reportedDate), formatDate(t.closedDate),
        ]);
        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `requests_report_${reportData.property.code || 'property'}_${month}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        if (!reportData) return;
        window.print();
    };

    const handleDirectDownloadPDF = async () => {
        if (!reportData) return;
        setIsDownloading(true);
        setDownloadProgress(0);

        const doc = new jsPDF('p', 'mm', 'a4');
        const tickets = reportData.tickets;
        const total = tickets.length;

        // --- Page 1: Dashboard Summary ---

        // Header Bar & Title
        doc.setFillColor(170, 137, 95); // #AA895F
        doc.rect(15, 15, 2, 12, 'F');
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(112, 143, 150); // #708F96
        doc.text(`${reportData.property.name || 'Property'} - requests report`, 22, 25);

        // Subheader
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        const generatedDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        doc.text(`Period: ${reportData.month.label} | Generated: ${generatedDate}`, 15, 35);

        // KPI Cards Row
        const kpis = reportData.kpis;
        const cardW = 42;
        const cardH = 35;
        const startX = 15;
        const gap = 5;
        const yCards = 45;

        const drawKPICard = (x: number, y: number, label: string, value: string, color: [number, number, number]) => {
            doc.setDrawColor(color[0], color[1], color[2]);
            doc.setLineWidth(0.5);
            doc.roundedRect(x, y, cardW, cardH, 3, 3, 'S');

            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(40, 40, 40);
            if (label === 'CLOSED') doc.setTextColor(39, 174, 96); // #27AE60
            doc.text(value, x + cardW / 2, y + 18, { align: 'center' });

            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(150, 150, 150);
            const lines = label.split(' / ');
            lines.forEach((line, idx) => {
                doc.text(line, x + cardW / 2, y + 26 + (idx * 4), { align: 'center' });
            });
        };

        drawKPICard(startX, yCards, 'TOTAL TICKETS', kpis.totalSnags.toString(), [112, 143, 150]);
        drawKPICard(startX + (cardW + gap), yCards, 'CLOSED', kpis.closedSnags.toString(), [39, 174, 96]);
        drawKPICard(startX + (cardW + gap) * 2, yCards, 'OPEN / WIP', kpis.openSnags.toString(), [170, 137, 95]);
        drawKPICard(startX + (cardW + gap) * 3, yCards, 'CLOSURE RATE', `${kpis.closureRate}%`, [112, 143, 150]);

        // Charts Row
        const drawChart = (canvasId: string, x: number, y: number, w: number, h: number) => {
            const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
            if (canvas) {
                const imgData = canvas.toDataURL('image/png');
                doc.addImage(imgData, 'PNG', x, y, w, h);
            }
        };

        const yCharts = 95;
        drawChart('floorChartReq', 15, yCharts, 90, 60);
        drawChart('deptChartReq', 110, yCharts, 90, 60);

        // --- Subsequent Pages: Tickets ---

        // Helper to load and compress image
        const loadImage = (url: string): Promise<string | null> => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxDim = 800;
                    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.5));
                };
                img.onerror = () => resolve(null);
                img.src = url;
            });
        };

        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            setDownloadProgress(Math.round(((i + 1) / total) * 100));

            doc.addPage();

            // Header bar
            const isOpen = ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'waitlist';
            if (isOpen) doc.setFillColor(170, 137, 95); else doc.setFillColor(112, 143, 150);
            doc.rect(0, 0, 210, 15, 'F');

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(`${ticket.ticketNumberDisplay} | ${ticket.category}`, 15, 10);
            doc.text(ticket.status.toUpperCase().replace('_', ' '), 180, 10, { align: 'right' });

            doc.setTextColor(40, 40, 40);
            doc.setFontSize(16);
            doc.text(ticket.title, 15, 30);

            // Details Grid
            doc.setFillColor(245, 247, 250);
            doc.rect(15, 35, 180, 40, 'F');

            doc.setFontSize(7);
            doc.setTextColor(170, 137, 95);
            doc.text('SPOC', 20, 42); doc.text('ASSIGNED TO', 110, 42);
            doc.text('FLOOR', 20, 55); doc.text('LOCATION', 110, 55);
            doc.text('REPORTED DATE', 20, 68); doc.text('CLOSURE DATE', 110, 68);

            doc.setFontSize(9);
            doc.setTextColor(40, 40, 40);
            doc.setFont('helvetica', 'normal');
            doc.text(ticket.spocName, 20, 47); doc.text(ticket.assigneeName, 110, 47);
            doc.text(ticket.floorLabel, 20, 60); doc.text(ticket.location || '-', 110, 60);
            doc.text(formatDate(ticket.reportedDate), 20, 73); doc.text(formatDate(ticket.closedDate), 110, 73);

            // Photos
            const photoWidth = 85;
            const photoHeight = 65;
            const yPhotos = 85;

            if (ticket.beforePhoto) {
                const b64 = await loadImage(ticket.beforePhoto);
                if (b64) doc.addImage(b64, 'JPEG', 15, yPhotos, photoWidth, photoHeight, undefined, 'FAST');
                else doc.rect(15, yPhotos, photoWidth, photoHeight);
            } else {
                doc.setDrawColor(200, 200, 200);
                doc.rect(15, yPhotos, photoWidth, photoHeight);
                doc.text('No Photo', 57, yPhotos + 32, { align: 'center' });
            }
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.setFillColor(0, 0, 0, 0.5);
            doc.rect(15, yPhotos, 20, 6, 'F');
            doc.text('BEFORE', 17, yPhotos + 4.5);

            if (ticket.afterPhoto) {
                const b64 = await loadImage(ticket.afterPhoto);
                if (b64) doc.addImage(b64, 'JPEG', 110, yPhotos, photoWidth, photoHeight, undefined, 'FAST');
                else doc.rect(110, yPhotos, photoWidth, photoHeight);
            } else {
                doc.setDrawColor(200, 200, 200);
                doc.rect(110, yPhotos, photoWidth, photoHeight);
                doc.setFontSize(9);
                doc.setTextColor(150, 150, 150);
                doc.text(ticket.status === 'closed' || ticket.status === 'resolved' ? 'No Photo' : 'In Progress', 152, yPhotos + 32, { align: 'center' });
            }
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.setFillColor(39, 174, 96, 0.7);
            doc.rect(110, yPhotos, 20, 6, 'F');
            doc.text('AFTER', 113, yPhotos + 4.5);
        }

        doc.save(`Requests_Report_${reportData.property.code}_${month}.pdf`);
        setIsDownloading(false);
    };

    // Group tickets by floor for display
    const ticketsByFloor: Record<string, TicketData[]> = {};
    if (reportData) {
        reportData.tickets.forEach(ticket => {
            const floor = ticket.floorLabel;
            if (!ticketsByFloor[floor]) ticketsByFloor[floor] = [];
            ticketsByFloor[floor].push(ticket);
        });
    }

    return (
        <>
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }

                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        background: white !important;
                        margin: 0 !important;
                    }

                    /* Dashboard summary on its own page */
                    .dashboard-section {
                        break-after: page !important;
                        padding: 16px !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                    }

                    /* Every ticket wrapper starts on a fresh page */
                    .ticket-wrapper {
                        break-before: page !important;
                        break-inside: avoid !important;
                        margin-bottom: 0 !important;
                    }

                    /* Floor label shown at top of first ticket of each floor */
                    .ticket-floor-label {
                        margin-top: 0 !important;
                        margin-bottom: 12px !important;
                    }

                    .ticket-card-inner {
                        margin-bottom: 0 !important;
                        box-shadow: none !important;
                    }

                    /* Charts grid */
                    .charts-grid {
                        display: grid !important;
                        grid-template-columns: 1fr 1fr !important;
                        gap: 16px !important;
                        min-height: 280px !important;
                    }
                    .chart-container-print {
                        position: relative !important;
                        height: 260px !important;
                        width: 100% !important;
                        overflow: hidden;
                        page-break-inside: avoid;
                    }
                    .chart-container-print canvas {
                        max-width: 100% !important;
                        height: 260px !important;
                    }

                    .kpi-grid { gap: 10px !important; margin-bottom: 20px !important; }
                    .kpi-card { padding: 10px !important; }

                    /* Footer stays with last ticket, no trailing blank page */
                    .report-footer {
                        break-before: avoid !important;
                        margin-top: 16px !important;
                    }

                    .no-print-force { display: none !important; }
                }

                .preparing-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(255,255,255,0.8);
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(4px);
                }
            `}</style>

            <div className="min-h-screen bg-[#F5F7FA] p-5 print:p-0 print:bg-white" style={{ fontFamily: "'Roboto', sans-serif" }}>
                <div className="max-w-[1100px] mx-auto">

                    {/* Header Controls — hidden in print */}
                    <div className="no-print flex flex-wrap justify-between items-center gap-3 mb-5">
                        <button
                            onClick={() => router.back()}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            Back to Reports
                        </button>

                        {/* Month Picker */}
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <button
                                onClick={() => setMonth(prev => changeMonth(prev, -1))}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-600" />
                            </button>
                            <input
                                type="month"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                                className="text-sm font-medium text-gray-700 bg-transparent outline-none"
                                max={getCurrentMonth()}
                            />
                            <button
                                onClick={() => setMonth(prev => changeMonth(prev, 1))}
                                disabled={month >= getCurrentMonth()}
                                className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-40"
                            >
                                <ChevronRight className="w-4 h-4 text-gray-600" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleExportCSV}
                                disabled={!reportData || reportData.tickets.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                <Download className="w-4 h-4" />
                                export csv
                            </button>
                            <button
                                onClick={handleDirectDownloadPDF}
                                disabled={!reportData || isDownloading}
                                className="flex items-center gap-2 px-5 py-2.5 bg-[#AA895F] text-white rounded-lg text-sm font-bold hover:bg-[#8a7050] transition-transform active:scale-95 shadow-md disabled:opacity-50"
                            >
                                {isDownloading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Downloading {downloadProgress}%
                                    </>
                                ) : (
                                    <>
                                        <FileText className="w-4 h-4" />
                                        Download PDF
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handlePrint}
                                disabled={!reportData || isDownloading}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-400 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                                title="Open browser print dialog"
                            >
                                <Printer className="w-3 h-3" />
                                browser print
                            </button>
                        </div>
                    </div>

                    {/* Loading State */}
                    {isLoading && (
                        <div className="min-h-[400px] flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 className="w-12 h-12 text-[#708F96] animate-spin" />
                                <p className="text-gray-500 font-medium">Generating Report...</p>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {!isLoading && error && (
                        <div className="min-h-[400px] flex items-center justify-center">
                            <div className="text-center">
                                <p className="text-red-500 font-medium mb-4">{error}</p>
                                <button onClick={fetchReportData} className="px-4 py-2 bg-[#708F96] text-white rounded-lg">
                                    Retry
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Report Content */}
                    {!isLoading && reportData && (
                        <div>
                            {/* Dashboard Section — printed as page 1 */}
                            <div className="bg-white p-5 rounded-xl shadow-sm mb-8 dashboard-section">
                                <h1 className="text-[#708F96] font-light text-2xl border-l-4 border-[#AA895F] pl-4 mb-2">
                                    {reportData.property.name} - requests report
                                </h1>
                                <p className="text-gray-500 text-sm mb-4">
                                    Period: {reportData.month.label} | Generated: {formatDate(new Date().toISOString())}
                                </p>

                                {reportData.tickets.length === 0 ? (
                                    <div className="text-center py-12 text-gray-400">
                                        <p className="text-lg font-medium">No tickets found</p>
                                        <p className="text-sm mt-1">No requests were raised in {reportData.month.label}</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* KPI Cards */}
                                        <div className="grid grid-cols-4 gap-4 mb-6 kpi-grid">
                                            <div className="bg-gray-50 p-4 rounded-lg text-center border-t-4 border-[#708F96] kpi-card">
                                                <div className="text-3xl font-bold text-gray-800">{reportData.kpis.totalSnags}</div>
                                                <div className="text-xs text-gray-500 tracking-wide uppercase">Total Tickets</div>
                                            </div>
                                            <div className="bg-gray-50 p-4 rounded-lg text-center border-t-4 border-[#27AE60] kpi-card">
                                                <div className="text-3xl font-bold text-[#27AE60]">{reportData.kpis.closedSnags}</div>
                                                <div className="text-xs text-gray-500 tracking-wide uppercase">Closed</div>
                                            </div>
                                            <div className="bg-gray-50 p-4 rounded-lg text-center border-t-4 border-[#AA895F] kpi-card">
                                                <div className="text-3xl font-bold text-[#AA895F]">{reportData.kpis.openSnags}</div>
                                                <div className="text-xs text-gray-500 tracking-wide uppercase">Open / WIP</div>
                                            </div>
                                            <div className="bg-gray-50 p-4 rounded-lg text-center border-t-4 border-[#708F96] kpi-card">
                                                <div className="text-3xl font-bold text-gray-800">{reportData.kpis.closureRate}%</div>
                                                <div className="text-xs text-gray-500 tracking-wide uppercase">Closure Rate</div>
                                            </div>
                                        </div>

                                        {/* Charts */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 h-auto min-h-[250px] charts-grid">
                                            <div className="relative h-[260px] chart-container-print">
                                                <canvas id="floorChartReq"></canvas>
                                            </div>
                                            <div className="relative h-[260px] chart-container-print">
                                                <canvas id="deptChartReq"></canvas>
                                            </div>
                                        </div>
                                        <p className="text-center text-xs text-[#AA895F] mt-3 no-print">
                                            *click on any "floor" bar above to jump to that floor's tickets.
                                        </p>
                                    </>
                                )}
                            </div>

                            {/*
                             * Ticket cards — one per page when printed.
                             * We flatten all floors into a single list. The floor label appears
                             * at the top of the first ticket in each floor group.
                             * CSS: .ticket-wrapper { break-before: page }
                             */}
                            {(() => {
                                const flattenedTickets: { ticket: TicketData; floor: string; isFirstOfFloor: boolean }[] = [];
                                Object.entries(ticketsByFloor).forEach(([floor, floorTickets]) => {
                                    floorTickets.forEach((ticket, idx) => {
                                        flattenedTickets.push({ ticket, floor, isFirstOfFloor: idx === 0 });
                                    });
                                });

                                const ticketsToDisplay = flattenedTickets.slice(0, displayLimit);

                                return (
                                    <>
                                        {ticketsToDisplay.map(({ ticket, floor, isFirstOfFloor }) => {
                                            const isOpen = ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'waitlist';
                                            return (
                                                <div
                                                    key={ticket.id}
                                                    id={isFirstOfFloor ? `floor-${floor.replace(/\s+/g, '-').toLowerCase()}` : undefined}
                                                    className="ticket-wrapper"
                                                >
                                                    {isFirstOfFloor && (
                                                        <div className="ticket-floor-label bg-gray-800 text-white px-5 py-3 rounded-lg mt-10 mb-5 text-lg tracking-wide">
                                                            {floor} tickets ({ticketsByFloor[floor].length})
                                                        </div>
                                                    )}

                                                    <div className="ticket-card-inner bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 mb-8">
                                                        <div className={`px-5 py-3 flex justify-between items-center ${isOpen ? 'bg-[#AA895F]' : 'bg-[#708F96]'}`}>
                                                            <div className="flex items-center gap-3">
                                                                <span className="bg-white/20 text-white px-2 py-1 rounded text-sm font-bold">
                                                                    {ticket.ticketNumberDisplay}
                                                                </span>
                                                                <span className="text-white/90">{ticket.category}</span>
                                                            </div>
                                                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${isOpen
                                                                ? 'bg-[#AA895F] text-white border border-white'
                                                                : 'bg-white text-[#708F96]'
                                                                }`}>
                                                                {ticket.status.replace('_', ' ')}
                                                            </span>
                                                        </div>

                                                        <div className="p-5">
                                                            <h3 className="text-lg font-medium text-gray-800 mb-4">{ticket.title}</h3>
                                                            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg mb-5">
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">SPOC</span>
                                                                    <span className="text-gray-800 text-sm">{ticket.spocName}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Assigned To</span>
                                                                    <span className="text-gray-800 text-sm">{ticket.assigneeName}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Floor</span>
                                                                    <span className="text-gray-800 text-sm">{ticket.floorLabel}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Location</span>
                                                                    <span className="text-gray-800 text-sm">{ticket.location || '-'}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Reported Date</span>
                                                                    <span className="text-gray-800 text-sm">{formatDate(ticket.reportedDate)}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Closure Date</span>
                                                                    <span className="text-gray-800 text-sm">{formatDate(ticket.closedDate)}</span>
                                                                </div>
                                                            </div>

                                                            <div className="flex gap-4">
                                                                <div className="flex-1 relative">
                                                                    <div className="absolute top-2 left-2 bg-black/70 text-white px-3 py-1 text-xs rounded z-10">
                                                                        before
                                                                    </div>
                                                                    {ticket.beforePhoto ? (
                                                                        <img
                                                                            src={ticket.beforePhoto}
                                                                            alt="Before"
                                                                            className="w-full h-[220px] object-cover rounded-lg border border-gray-200"
                                                                            loading="lazy"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-[220px] bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
                                                                            No Photo
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 relative">
                                                                    <div className="absolute top-2 left-2 bg-[#27AE60] text-white px-3 py-1 text-xs rounded z-10">
                                                                        after
                                                                    </div>
                                                                    {ticket.afterPhoto ? (
                                                                        <img
                                                                            src={ticket.afterPhoto}
                                                                            alt="After"
                                                                            className="w-full h-[220px] object-cover rounded-lg border border-gray-200"
                                                                            loading="lazy"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-[220px] bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
                                                                            {ticket.status === 'closed' || ticket.status === 'resolved' ? 'No Photo' : 'In Progress'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {!isDownloading && flattenedTickets.length > displayLimit && (
                                            <div className="no-print flex justify-center py-10">
                                                <button
                                                    onClick={() => setDisplayLimit(prev => prev + 30)}
                                                    className="px-8 py-3 bg-white border-2 border-[#708F96] text-[#708F96] font-bold rounded-xl hover:bg-[#708F96] hover:text-white transition-all transform hover:scale-105 active:scale-95 shadow-sm"
                                                >
                                                    Load More Tickets ({flattenedTickets.length - displayLimit} remaining)
                                                </button>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}


                            {/* Footer */}
                            <div className="report-footer text-center text-sm text-gray-400 py-8 border-t border-gray-200 mt-10">
                                <p>Generated by Autopilot | {reportData.month.label} | {formatDate(new Date().toISOString())}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
