'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Scan, AlertCircle, Loader2, Camera, ImagePlus, Keyboard, CheckCircle2, Boxes, ArrowBigDown, ArrowBigUp, RefreshCw, QrCode } from 'lucide-react';
import { useParams } from 'next/navigation';

interface BarcodeScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onScanSuccess?: (barcode: string, format: string) => void;
    title?: string;
}

type ScanMode = 'camera' | 'gallery' | 'manual';

interface CartItem {
    id: string;
    item_code: string;
    name: string;
    quantity: number;
    category?: string;
    unit?: string;
    barcode?: string;
    cartQuantity: number;
}


export default function BarcodeScannerModal({
    isOpen,
    onClose,
    onScanSuccess,
    title = 'Inventory Scanner'
}: BarcodeScannerModalProps) {
    const params = useParams();
    const propertyId = params?.propertyId as string;

    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manualInput, setManualInput] = useState('');
    const [scanMode, setScanMode] = useState<ScanMode>('camera');
    const [cameraActive, setCameraActive] = useState(false);
    const [galleryProcessing, setGalleryProcessing] = useState(false);
    const [galleryPreview, setGalleryPreview] = useState<string | null>(null);
    const isTransitioningRef = useRef(false);
    const isMounted = useRef(true);

    // Identification & Update States
    const [scannedItems, setScannedItems] = useState<CartItem[]>([]);
    const recentScansRef = useRef<Record<string, number>>({});
    const beepAudio = useRef<HTMLAudioElement | null>(null);
    useEffect(() => { beepAudio.current = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"); }, []);
    const [action, setAction] = useState<'IN' | 'OUT'>('IN');
    const [quantity, setQuantity] = useState(1);
    const [isUpdatingStock, setIsUpdatingStock] = useState(false);

    const SCANNER_ID = 'barcode-scanner-region';

    const stopCamera = useCallback(async () => {
        if (html5QrCodeRef.current) {
            try {
                if (html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                }
                await html5QrCodeRef.current.clear();
            } catch (err: any) {
                console.warn('Error during camera stop/clear:', err);
            } finally {
                html5QrCodeRef.current = null;
                setCameraActive(false);
            }
        }
    }, []);

    const handleClose = useCallback(async () => {
        await stopCamera();
        if (html5QrCodeRef.current) {
            try {
                html5QrCodeRef.current.clear();
            } catch (e) { /* ignore */ }
            html5QrCodeRef.current = null;
        }
        setError(null);
        setManualInput('');
        setScanMode('camera');
        setGalleryPreview(null);
        setGalleryProcessing(false);
        setScannedItems([]);
        onClose();
    }, [stopCamera, onClose]);

    
    const fetchItemByBarcode = async (barcode: string) => {
        const now = Date.now();
        if (recentScansRef.current[barcode] && now - recentScansRef.current[barcode] < 3000) {
            return; // Ignore duplicate scan within 3 seconds
        }
        recentScansRef.current[barcode] = now;

        try {
            setLoading(true);
            const res = await fetch(`/api/properties/${propertyId}/stock/items?barcode=${barcode}`);
            const data = await res.json();

            if (data.success && data.items.length > 0) {
                if (onScanSuccess) {
                    onScanSuccess(barcode, 'unknown');
                } else {
                    const item = data.items[0];
                    setScannedItems(prev => {
                        const existing = prev.find(i => i.id === item.id);
                        if (existing) {
                            return prev.map(i => i.id === item.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i);
                        }
                        return [...prev, { ...item, cartQuantity: 1 }];
                    });
                    if (beepAudio.current) {
                        beepAudio.current.play().catch(() => {});
                    }
                }
            } else {
                setError(`No item found for code: ${barcode}`);
            }
        } catch (err) {
            setError('Failed to fetch item details.');
        } finally {
            setLoading(false);
        }
    };


    // Initialize or get the Html5Qrcode instance
    const getScanner = useCallback(() => {
        if (!isOpen) return null;

        const container = document.getElementById(SCANNER_ID);
        if (!container) return null;

        if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode(SCANNER_ID, {
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.ITF,
                    Html5QrcodeSupportedFormats.DATA_MATRIX
                ],
                verbose: false
            });
        }
        return html5QrCodeRef.current;
    }, [isOpen]);

    const startCamera = async (isRetry = false) => {
        if (cameraActive || !isOpen) return;

        // Robust recursive check for container dimensions
        const checkContainer = async (retries = 15): Promise<boolean> => {
            if (!isMounted.current || !isOpen) return false;
            const container = document.getElementById(SCANNER_ID);
            if (container && container.clientWidth > 0) return true;
            if (retries <= 0) return false;
            await new Promise(r => setTimeout(r, 100));
            return checkContainer(retries - 1);
        };

        const isReady = await checkContainer();
        if (!isReady || !isMounted.current) {
            console.warn('Scanner container not ready/mounted after retries');
            return;
        }

        const scanner = getScanner();
        if (!scanner) return;

        const scanConfig = {
            fps: 60,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                const minDim = Math.min(viewfinderWidth, viewfinderHeight);
                const size = Math.max(250, minDim * 0.75);
                return { width: size, height: size };
            },
            aspectRatio: 1.0,
            disableFlip: true
        };

        const onSuccess = (decodedText: string) => {
            const code = decodedText.trim();
            if (onScanSuccess) {
                onScanSuccess(code, 'unknown');
                handleClose();
            } else {
                fetchItemByBarcode(code);
            }
        };

        try {
            setLoading(true);
            setError(null);
            await scanner.start({ facingMode: 'environment' }, scanConfig, onSuccess, () => { });
            setCameraActive(true);
            setLoading(false);
        } catch (err: any) {
            const msg: string = err?.message || err?.toString() || '';
            // Html5Qrcode internal state machine conflict — destroy instance and retry once
            if (!isRetry && msg.toLowerCase().includes('transition')) {
                console.warn('[Scanner] Transition conflict detected, resetting instance and retrying...');
                try {
                    await html5QrCodeRef.current?.stop().catch(() => { });
                    html5QrCodeRef.current?.clear();
                } catch { /* ignore cleanup errors */ }
                html5QrCodeRef.current = null;
                setCameraActive(false);
                await new Promise(r => setTimeout(r, 400));
                if (isMounted.current && isOpen) await startCamera(true);
                return;
            }
            console.error('Failed to start camera:', err);
            if (scanMode === 'camera' && isOpen) {
                setError('Camera access denied or busy.');
            }
            setLoading(false);
            setCameraActive(false);
        }
    };

    // Handle mode switches and initialization
    useEffect(() => {
        if (!isOpen) return;

        const syncScanner = async () => {
            if (isTransitioningRef.current) return;
            isTransitioningRef.current = true;

            try {
                // Always ensure a clean slate when switching modes
                await stopCamera();

                if (scanMode === 'camera' && isMounted.current) {
                    // Give extra time for React to render/update the SCANNER_ID div
                    await new Promise(r => setTimeout(r, 200));
                    if (isMounted.current && isOpen) await startCamera();
                }
            } finally {
                if (isMounted.current) isTransitioningRef.current = false;
            }
        };

        syncScanner();
    }, [scanMode, isOpen, stopCamera]);

    // Cleanup on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (html5QrCodeRef.current) {
                if (html5QrCodeRef.current.isScanning) {
                    html5QrCodeRef.current.stop().catch(() => { });
                }
                html5QrCodeRef.current.clear();
                html5QrCodeRef.current = null;
            }
        };
    }, []);

    // Handle manual input auto-identification
    useEffect(() => {
        if (scanMode === 'manual' && manualInput.length >= 8) {
            const timer = setTimeout(() => {
                fetchItemByBarcode(manualInput);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [manualInput, scanMode]);

    
    const handleStockUpdate = async () => {
        if (scannedItems.length === 0) return;

        setIsUpdatingStock(true);
        setError(null);

        try {
            const promises = scannedItems.map(item => 
                fetch(`/api/properties/${propertyId}/stock/scan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        itemId: item.id,
                        action: action.toLowerCase(),
                        quantity: item.cartQuantity,
                        notes: `Scanned via ${scanMode.toUpperCase()} mode (Batch)`
                    })
                }).then(res => res.json())
            );

            const results = await Promise.all(promises);
            const failed = results.filter(r => !r.success);

            if (failed.length === 0) {
                setScannedItems([]);
                if (onScanSuccess) onScanSuccess('batch', scanMode.toUpperCase());
                handleClose();
            } else {
                setError(`${failed.length} items failed to update.`);
            }
        } catch (err) {
            setError('Network error updating stock.');
        } finally {
            setIsUpdatingStock(false);
        }
    };

    const updateCartQuantity = (id: string, delta: number) => {
        setScannedItems(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, cartQuantity: Math.max(1, item.cartQuantity + delta) };
            }
            return item;
        }));
    };
    
    const removeCartItem = (id: string) => {
        setScannedItems(prev => prev.filter(item => item.id !== id));
    };


    const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || galleryProcessing) return;

        setGalleryProcessing(true);
        setError(null);
        setGalleryPreview(null);

        // Crucial: Stop camera before starting file scan to avoid instance collision
        await stopCamera();

        const previewUrl = URL.createObjectURL(file);
        setGalleryPreview(previewUrl);

        try {
            // STEP 1: Try Native BarcodeDetector API (Ultra-fast, robust fallback for 1D)
            if ('BarcodeDetector' in window) {
                try {
                    const formats = await (window as any).BarcodeDetector.getSupportedFormats();
                    const detector = new (window as any).BarcodeDetector({
                        formats: formats.length > 0 ? formats : ['code_128', 'qr_code', 'ean_13']
                    });

                    const img = new Image();
                    img.src = previewUrl;
                    await new Promise((resolve) => img.onload = resolve);

                    const barcodes = await detector.detect(img);
                    if (barcodes.length > 0) {
                        fetchItemByBarcode(barcodes[0].rawValue.trim());
                        return;
                    }
                } catch (nativeErr) {
                    console.warn('Native BarcodeDetector failed, falling back to html5-qrcode');
                }
            }

            // STEP 2: Fallback to html5-qrcode with optimized image
            // Always get/create a fresh scanner instance for gallery scan
            await stopCamera(); // Double insurance
            const scanner = getScanner();
            if (!scanner) throw new Error('Could not initialize scanner for gallery');

            const processImage = async (pass: 'normal' | 'high-contrast'): Promise<File> => {
                return new Promise<File>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const MAX_EDGE = 1600; // Increased for better 1D detail
                        let width = img.width;
                        let height = img.height;
                        if (width > height ? width > MAX_EDGE : height > MAX_EDGE) {
                            const ratio = MAX_EDGE / Math.max(width, height);
                            width *= ratio;
                            height *= ratio;
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            if (pass === 'high-contrast') {
                                // Grayscale + Contrast Boost
                                ctx.filter = 'grayscale(100%) contrast(200%) brightness(120%)';
                            }
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);
                        }
                        canvas.toBlob((b) => {
                            const processedFile = new File([b || file], `scan_${pass}.jpg`, { type: 'image/jpeg' });
                            resolve(processedFile);
                        }, 'image/jpeg', 0.95);
                    };
                    img.onerror = () => resolve(file);
                    img.src = previewUrl;
                });
            };

            // PASS 1: Normal processing
            const normalFile = await processImage('normal');
            try {
                const result = await scanner.scanFile(normalFile, true);
                const code = result.trim();
                if (onScanSuccess) {
                    onScanSuccess(code, 'unknown');
                    handleClose();
                } else {
                    fetchItemByBarcode(code);
                }
                return;
            } catch (err) {
                console.warn('First scan pass failed, trying high-contrast pass...');

                // PASS 2: High-contrast fallback (better for 1D barcodes in poor lighting)
                const highContrastFile = await processImage('high-contrast');
                const result = await scanner.scanFile(highContrastFile, true);
                const secondCode = result.trim();

                if (onScanSuccess) {
                    onScanSuccess(secondCode, 'unknown');
                    handleClose();
                } else {
                    fetchItemByBarcode(secondCode);
                }
            }
        } catch (err) {
            console.error('Gallery scan error:', err);
            setError('Could not detect any QR code. Try a clearer photo or use Manual ID.');
        } finally {
            setGalleryProcessing(false);
            URL.revokeObjectURL(previewUrl);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-lg" onClick={handleClose}>
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
                            <QrCode size={20} className="text-indigo-600" />
                        </div>
                        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
                    </div>
                    <button onClick={handleClose} className="p-2.5 hover:bg-gray-100 rounded-2xl transition-all">
                        <X size={22} className="text-gray-400" />
                    </button>
                </div>

                
                <div className="flex-1 overflow-y-auto flex flex-col">
                    {/* Scanner Section */}
                    <div className="p-6 pb-2">
                        <div className="flex gap-1.5 p-1.5 mb-4 bg-gray-100/80 rounded-2xl">
                            <button
                                onClick={() => setScanMode('camera')}
                                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${scanMode === 'camera' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Camera size={16} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Camera</span>
                            </button>
                            <button
                                onClick={() => setScanMode('gallery')}
                                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${scanMode === 'gallery' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <ImagePlus size={16} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Photo</span>
                            </button>
                            <button
                                onClick={() => setScanMode('manual')}
                                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${scanMode === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Keyboard size={16} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Manual</span>
                            </button>
                        </div>

                        {error && (
                            <div className="mb-4 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex gap-3">
                                <AlertCircle size={20} className="text-rose-500 flex-shrink-0" />
                                <p className="text-sm text-rose-700 font-medium">{error}</p>
                            </div>
                        )}

                        {/* Scanner UI */}
                        <div className={`${scanMode === 'camera' ? 'block' : 'hidden'} relative group max-h-[300px] overflow-hidden rounded-3xl border-4 border-gray-100 shadow-inner`}>
                            {loading && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/80 backdrop-blur-[2px]">
                                    <Loader2 size={32} className="animate-spin text-indigo-600" />
                                </div>
                            )}
                            <div id={SCANNER_ID} className="w-full" />
                        </div>

                        {scanMode === 'manual' && (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={manualInput}
                                    onChange={(e) => setManualInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchItemByBarcode(manualInput)}
                                    placeholder="Enter barcode..."
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none font-bold"
                                />
                                <button
                                    onClick={() => fetchItemByBarcode(manualInput)}
                                    disabled={!manualInput.trim() || loading}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold"
                                >
                                    Add Item
                                </button>
                            </div>
                        )}
                        
                        {scanMode === 'gallery' && (
                            <div className="space-y-4">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-50 rounded-3xl p-6 flex flex-col items-center gap-2 transition-all bg-indigo-50/30"
                                >
                                    <ImagePlus size={24} className="text-indigo-600" />
                                    <span className="font-bold">Choose Photo</span>
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleGallerySelect} className="hidden" />
                            </div>
                        )}
                    </div>

                    {/* Cart Section */}
                    {scannedItems.length > 0 && (
                        <div className="flex-1 flex flex-col border-t border-gray-100 bg-gray-50 overflow-hidden">
                            <div className="p-4 flex justify-between items-center bg-white shadow-sm z-10">
                                <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest">Scanned Items ({scannedItems.length})</h3>
                                <div className="flex bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                                    <button onClick={() => setAction('IN')} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${action === 'IN' ? 'bg-emerald-500 text-white' : 'text-gray-500'}`}>Stock IN</button>
                                    <button onClick={() => setAction('OUT')} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${action === 'OUT' ? 'bg-orange-500 text-white' : 'text-gray-500'}`}>Stock OUT</button>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {scannedItems.map(item => (
                                    <div key={item.id} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3 relative">
                                        <button onClick={() => removeCartItem(item.id)} className="absolute -top-2 -right-2 p-1 bg-rose-100 text-rose-500 hover:text-rose-600 hover:bg-rose-200 rounded-full shadow-sm">
                                            <X size={14} />
                                        </button>
                                        <div className="flex-1 min-w-0 pr-4">
                                            <div className="text-sm font-bold text-gray-900 truncate">{item.name}</div>
                                            <div className="text-[10px] font-bold text-gray-500">Available: {item.quantity} {item.unit}</div>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-gray-50 pt-3">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qty</span>
                                            <div className="flex items-center gap-3 bg-gray-50 p-1 rounded-xl border border-gray-100">
                                                <button onClick={() => updateCartQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm font-bold text-gray-700 hover:bg-gray-50">-</button>
                                                <span className="w-8 text-center font-black text-indigo-600">{item.cartQuantity}</span>
                                                <button onClick={() => updateCartQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm font-bold text-gray-700 hover:bg-gray-50">+</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 bg-white border-t border-gray-100 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
                                <button
                                    onClick={handleStockUpdate}
                                    disabled={isUpdatingStock}
                                    className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 ${action === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-200'} text-white disabled:opacity-50`}
                                >
                                    {isUpdatingStock ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                                    Confirm {scannedItems.length} {action === 'IN' ? 'Stock In' : 'Stock Out'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
