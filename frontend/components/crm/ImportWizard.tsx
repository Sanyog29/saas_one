'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Download, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';

interface ImportWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete?: (results: any) => void;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

interface ImportError {
    row: number;
    field: string;
    message: string;
}

export default function ImportWizard({ isOpen, onClose, onComplete }: ImportWizardProps) {
    const [step, setStep] = useState<ImportStep>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [csvData, setCsvData] = useState<string[][]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<{
        total_rows: number;
        success_count: number;
        error_count: number;
        errors: ImportError[];
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        parseCSV(selectedFile);
    };

    const parseCSV = (file: File) => {
        Papa.parse(file, {
            complete: (results) => {
                const data = results.data as string[][];
                if (data.length > 0) {
                    setHeaders(data[0]);
                    setCsvData(data.slice(1, 51)); // Preview first 50 rows
                    setStep('preview');
                }
            },
            error: (error) => {
                console.error('CSV parse error:', error);
            }
        });
    };

    const handleImport = async () => {
        if (!file) return;

        setIsProcessing(true);
        setStep('importing');

        try {
            // Re-read the full file for import
            const fullCSV = await file.text();

            const res = await fetch('/api/crm/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv_data: fullCSV })
            });

            if (res.ok) {
                const data = await res.json();
                setResults(data);
                setStep('complete');
                onComplete?.(data);
            } else {
                const error = await res.json();
                setResults({
                    total_rows: 0,
                    success_count: 0,
                    error_count: 1,
                    errors: [{ row: 0, field: 'general', message: error.error || 'Import failed' }]
                });
                setStep('complete');
            }
        } catch (error) {
            console.error('Import error:', error);
            setResults({
                total_rows: 0,
                success_count: 0,
                error_count: 1,
                errors: [{ row: 0, field: 'general', message: 'Network error' }]
            });
            setStep('complete');
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            const res = await fetch('/api/crm/import/template');
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'crm_leads_template.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Download error:', error);
        }
    };

    const reset = () => {
        setStep('upload');
        setFile(null);
        setCsvData([]);
        setHeaders([]);
        setResults(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                        <h2 className="text-lg font-bold text-text-primary">Import Leads</h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-text-secondary" />
                        </button>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center justify-center gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200">
                        {['upload', 'preview', 'importing', 'complete'].map((s, i) => (
                            <React.Fragment key={s}>
                                <div className={`flex items-center gap-2 ${
                                    step === s ? 'text-primary' :
                                    ['preview', 'importing', 'complete'].indexOf(step) > i ? 'text-success' : 'text-text-tertiary'
                                }`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                        step === s ? 'bg-primary text-white' :
                                        ['preview', 'importing', 'complete'].indexOf(step) > i ? 'bg-success text-white' : 'bg-slate-200'
                                    }`}>
                                        {['preview', 'importing', 'complete'].indexOf(step) > i ? (
                                            <CheckCircle className="w-4 h-4" />
                                        ) : i + 1}
                                    </div>
                                    <span className="text-sm font-medium capitalize">{s === 'importing' ? 'Importing' : s}</span>
                                </div>
                                {i < 3 && <div className="w-12 h-px bg-slate-200" />}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {step === 'upload' && (
                            <div className="space-y-6">
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-text-primary mb-2">Upload CSV File</h3>
                                    <p className="text-sm text-text-secondary">
                                        Upload a CSV file with your leads data. Maximum 1000 rows.
                                    </p>
                                </div>

                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                                >
                                    <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                                    <p className="text-text-primary font-medium mb-2">
                                        Click to upload or drag and drop
                                    </p>
                                    <p className="text-sm text-text-secondary">
                                        CSV files only
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                </div>

                                <div className="flex justify-center">
                                    <button
                                        onClick={downloadTemplate}
                                        className="flex items-center gap-2 text-primary text-sm font-medium hover:underline"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download Sample Template
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 'preview' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-text-primary">Preview Data</h3>
                                        <p className="text-sm text-text-secondary mt-1">
                                            Showing first 50 rows of {csvData.length + 1} total rows
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <FileText className="w-4 h-4 text-text-tertiary" />
                                        <span className="text-text-secondary">{file?.name}</span>
                                    </div>
                                </div>

                                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50">
                                                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary">#</th>
                                                {headers.map((header, i) => (
                                                    <th key={i} className="px-4 py-3 text-left text-xs font-medium text-text-secondary">
                                                        {header}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {csvData.map((row, i) => (
                                                <tr key={i}>
                                                    <td className="px-4 py-2 text-text-tertiary">{i + 1}</td>
                                                    {row.map((cell, j) => (
                                                        <td key={j} className="px-4 py-2 text-text-primary">{cell}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {step === 'importing' && (
                            <div className="text-center py-12">
                                <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
                                <h3 className="text-lg font-semibold text-text-primary mb-2">Importing Leads...</h3>
                                <p className="text-sm text-text-secondary">
                                    Please wait while we process your data
                                </p>
                            </div>
                        )}

                        {step === 'complete' && results && (
                            <div className="space-y-6">
                                <div className="text-center">
                                    {results.success_count > 0 && results.error_count === 0 ? (
                                        <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                                            <CheckCircle className="w-8 h-8 text-green-600" />
                                        </div>
                                    ) : results.error_count > 0 ? (
                                        <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-full flex items-center justify-center">
                                            <AlertCircle className="w-8 h-8 text-amber-600" />
                                        </div>
                                    ) : (
                                        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                                            <AlertCircle className="w-8 h-8 text-red-600" />
                                        </div>
                                    )}
                                    <h3 className="text-lg font-semibold text-text-primary mb-2">
                                        {results.success_count > 0 && results.error_count === 0
                                            ? 'Import Complete!'
                                            : results.error_count > 0
                                                ? 'Import Completed with Errors'
                                                : 'Import Failed'}
                                    </h3>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-slate-50 rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold text-text-primary">{results.total_rows}</p>
                                        <p className="text-sm text-text-secondary">Total Rows</p>
                                    </div>
                                    <div className="bg-green-50 rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold text-green-600">{results.success_count}</p>
                                        <p className="text-sm text-green-600">Imported</p>
                                    </div>
                                    <div className="bg-red-50 rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold text-red-600">{results.error_count}</p>
                                        <p className="text-sm text-red-600">Errors</p>
                                    </div>
                                </div>

                                {results.errors.length > 0 && (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                            <h4 className="font-medium text-text-primary">Errors</h4>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto">
                                            {results.errors.slice(0, 20).map((error, i) => (
                                                <div key={i} className="px-4 py-2 border-b border-slate-100 text-sm">
                                                    <span className="text-text-tertiary">Row {error.row}:</span>{' '}
                                                    <span className="text-text-primary">{error.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                        {step === 'upload' && (
                            <>
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </>
                        )}
                        {step === 'preview' && (
                            <>
                                <button
                                    onClick={reset}
                                    className="px-6 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-white transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleImport}
                                    disabled={isProcessing}
                                    className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Import {csvData.length} Leads
                                </button>
                            </>
                        )}
                        {step === 'complete' && (
                            <>
                                <button
                                    onClick={reset}
                                    className="px-6 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-white transition-colors"
                                >
                                    Import More
                                </button>
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                                >
                                    Done
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}