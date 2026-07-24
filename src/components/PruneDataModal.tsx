import React, { useState, useEffect } from 'react';
import { StorageService } from '../lib/storage';
import StorageUsageCard from './StorageUsageCard';
import { Database, Trash2, AlertTriangle, ShieldAlert, CheckCircle2, X, Clock, Calendar, HardDrive, RefreshCw } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface PruneDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataPruned?: () => void;
}

export default function PruneDataModal({ isOpen, onClose, onDataPruned }: PruneDataModalProps) {
  // Period Preset: '2_years' | '1_year' | '3_years' | 'custom_months' | 'custom_date'
  const [periodType, setPeriodType] = useState<'2_years' | '1_year' | '3_years' | 'custom_months' | 'custom_date'>('2_years');
  const [customMonths, setCustomMonths] = useState<number>(24);
  const [customYear, setCustomYear] = useState<number>(new Date().getFullYear() - 2);
  const [customMonthIndex, setCustomMonthIndex] = useState<number>(new Date().getMonth());

  // Step 1 vs Step 2 confirmation
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [confirmInput, setConfirmInput] = useState('');

  // Scanning & deletion state
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scanResult, setScanResult] = useState<{
    logMonths: string[];
    subMonths: string[];
    adjustmentCount: number;
    totalLogEntriesCount: number;
  }>({
    logMonths: [],
    subMonths: [],
    adjustmentCount: 0,
    totalLogEntriesCount: 0,
  });

  const [pruneResult, setPruneResult] = useState<{
    deletedLogKeys: string[];
    deletedSubKeys: string[];
    prunedAdjustmentsCount: number;
  } | null>(null);

  const [errorMsg, setErrorMsg] = useState('');

  // Calculate cutoff YYYY-MM based on period selection
  const getCutoffMonthKey = (): string => {
    const now = new Date();
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth(); // 0-indexed

    if (periodType === '2_years') {
      targetYear -= 2;
    } else if (periodType === '1_year') {
      targetYear -= 1;
    } else if (periodType === '3_years') {
      targetYear -= 3;
    } else if (periodType === 'custom_months') {
      const totalMonths = now.getFullYear() * 12 + now.getMonth() - Math.max(1, customMonths);
      targetYear = Math.floor(totalMonths / 12);
      targetMonth = totalMonths % 12;
      if (targetMonth < 0) {
        targetMonth += 12;
      }
    } else if (periodType === 'custom_date') {
      targetYear = customYear;
      targetMonth = customMonthIndex;
    }

    const mm = String(targetMonth + 1).padStart(2, '0');
    return `${targetYear}-${mm}`;
  };

  const cutoffKey = getCutoffMonthKey();

  // Scan database whenever cutoff month changes or modal opens
  const handleScan = async () => {
    setIsScanning(true);
    setErrorMsg('');
    try {
      const res = await StorageService.scanOldRecords(cutoffKey);
      setScanResult(res);
    } catch (e: any) {
      console.error('Scan error:', e);
      setErrorMsg(e.message || 'Failed to scan database for old records.');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setConfirmInput('');
      setPruneResult(null);
      setErrorMsg('');
      handleScan();
    }
  }, [isOpen, periodType, customMonths, customYear, customMonthIndex]);

  if (!isOpen) return null;

  // Format readable cutoff string, e.g. "July 2024"
  const getCutoffLabel = () => {
    const [yStr, mStr] = cutoffKey.split('-');
    const mIdx = parseInt(mStr, 10) - 1;
    return `${MONTH_NAMES[mIdx] || ''} ${yStr}`;
  };

  const totalFilesFound = scanResult.logMonths.length;

  const handleExecuteDelete = async () => {
    if (confirmInput.trim().toUpperCase() !== 'DELETE') {
      return;
    }
    setIsDeleting(true);
    setErrorMsg('');
    try {
      const res = await StorageService.pruneOldRecords(cutoffKey);
      setPruneResult(res);
      if (onDataPruned) {
        onDataPruned();
      }
    } catch (e: any) {
      console.error('Prune error:', e);
      setErrorMsg(e.message || 'Error occurred while purging old records.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-[110] p-4 no-print overflow-y-auto">
      <div className="bg-white rounded-2xl border-2 border-slate-300 w-full max-w-xl shadow-2xl overflow-hidden my-8">
        
        {/* Header Bar */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30">
              <HardDrive size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white serif-title flex items-center gap-2">
                Memory & Storage Maintenance
              </h3>
              <p className="text-xs text-slate-400">
                Prune old recorded files and logs to reduce memory usage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Success Result Box */}
          {pruneResult ? (
            <div className="space-y-5 py-4">
              <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-xl flex flex-col items-center text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={28} />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-900 text-base">Old Recorded Files Purged Successfully!</h4>
                  <p className="text-xs text-emerald-700 mt-1">
                    Database memory and local storage have been optimized.
                  </p>
                </div>

                <div className="w-full bg-white rounded-lg p-3 border border-emerald-100 text-xs text-slate-700 grid grid-cols-2 gap-3 text-left">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Deleted Monthly Files</span>
                    <span className="font-bold text-emerald-800 text-sm">{pruneResult.deletedLogKeys.length} Months</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Pruned Adjustment Logs</span>
                    <span className="font-bold text-emerald-800 text-sm">{pruneResult.prunedAdjustmentsCount} Entries</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  Close Maintenance
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Period Selection & Scan Overview */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  <StorageUsageCard compact />

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Clock size={14} className="text-slate-500" />
                      Select Data Retention / Cleanup Period
                    </label>
                    <p className="text-xs text-slate-500 mb-3">
                      All recorded daily logs, student lesson entries, and schedule adjustments prior to the selected period will be purged to free up storage space.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setPeriodType('2_years')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col ${
                          periodType === '2_years'
                            ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-800">2 Years or Older</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Recommended</span>
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1">
                          Delete records prior to 24 months ago
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPeriodType('1_year')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col ${
                          periodType === '1_year'
                            ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-bold text-xs text-slate-800">1 Year or Older</span>
                        <span className="text-[11px] text-slate-500 mt-1">
                          Delete records prior to 12 months ago
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPeriodType('3_years')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col ${
                          periodType === '3_years'
                            ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-bold text-xs text-slate-800">3 Years or Older</span>
                        <span className="text-[11px] text-slate-500 mt-1">
                          Keep up to 36 months of history
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPeriodType('custom_months')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col ${
                          periodType === 'custom_months' || periodType === 'custom_date'
                            ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-bold text-xs text-slate-800">Custom Period</span>
                        <span className="text-[11px] text-slate-500 mt-1">
                          Specify custom timeframe / cutoff
                        </span>
                      </button>
                    </div>

                    {/* Custom options controls */}
                    {(periodType === 'custom_months' || periodType === 'custom_date') && (
                      <div className="mt-3 p-3.5 bg-slate-100/80 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex gap-4 items-center border-b pb-2 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                            <input
                              type="radio"
                              name="customSub"
                              checked={periodType === 'custom_months'}
                              onChange={() => setPeriodType('custom_months')}
                              className="accent-blue-600"
                            />
                            Older than X Months
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                            <input
                              type="radio"
                              name="customSub"
                              checked={periodType === 'custom_date'}
                              onChange={() => setPeriodType('custom_date')}
                              className="accent-blue-600"
                            />
                            Cutoff Month & Year
                          </label>
                        </div>

                        {periodType === 'custom_months' && (
                          <div className="flex items-center gap-3">
                            <label className="text-xs font-semibold text-slate-600">Delete data older than:</label>
                            <input
                              type="number"
                              min={1}
                              max={120}
                              value={customMonths}
                              onChange={(e) => setCustomMonths(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-20 px-2.5 py-1 border border-slate-300 rounded bg-white font-bold text-sm text-center"
                            />
                            <span className="text-xs text-slate-600 font-semibold">months</span>
                          </div>
                        )}

                        {periodType === 'custom_date' && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-semibold text-slate-600">Delete prior to:</label>
                            <select
                              value={customMonthIndex}
                              onChange={(e) => setCustomMonthIndex(parseInt(e.target.value, 10))}
                              className="px-2.5 py-1 border border-slate-300 rounded bg-white font-semibold text-xs text-slate-800"
                            >
                              {MONTH_NAMES.map((name, idx) => (
                                <option key={idx} value={idx}>{name}</option>
                              ))}
                            </select>
                            <select
                              value={customYear}
                              onChange={(e) => setCustomYear(parseInt(e.target.value, 10))}
                              className="px-2.5 py-1 border border-slate-300 rounded bg-white font-semibold text-xs text-slate-800"
                            >
                              {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i).map((yr) => (
                                <option key={yr} value={yr}>{yr}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Scan Inspection Box */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Database size={14} className="text-slate-500" />
                        Storage Inspection Scan
                      </span>
                      {isScanning && (
                        <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                          <RefreshCw size={12} className="animate-spin" /> Scanning...
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Cutoff Date</span>
                        <span className="font-extrabold text-blue-700 text-xs">{getCutoffLabel()}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Old Month Files</span>
                        <span className="font-extrabold text-slate-800 text-xs">{scanResult.logMonths.length} Month Files</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block">Adjustment Logs</span>
                        <span className="font-extrabold text-slate-800 text-xs">{scanResult.adjustmentCount} Entries</span>
                      </div>
                    </div>

                    {scanResult.logMonths.length > 0 && (
                      <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded border border-slate-200">
                        <strong className="text-slate-700">Identified old month logs:</strong>{' '}
                        {scanResult.logMonths.slice(0, 8).join(', ')}
                        {scanResult.logMonths.length > 8 ? ` ... and ${scanResult.logMonths.length - 8} more` : ''}
                      </div>
                    )}
                  </div>

                  {/* Warning 1 Box */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-extrabold text-amber-800 uppercase tracking-wider text-[11px]">
                      <AlertTriangle size={15} className="text-amber-600" />
                      Warning 1 of 2 — Data Pruning Notice
                    </div>
                    <p className="leading-relaxed">
                      Executing this cleanup will permanently remove all daily lesson entries, teacher attendance records, and daily schedule adjustments created prior to <strong className="font-bold underline">{getCutoffLabel()}</strong>.
                    </p>
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-semibold">
                      {errorMsg}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      disabled={isScanning}
                      className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <span>Proceed to Final Warning (Step 2/2)</span>
                      <span>➔</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Double Warning & Type-to-Confirm Guard */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-950 space-y-3">
                    <div className="flex items-center gap-2 text-red-700 font-extrabold text-sm uppercase tracking-wide">
                      <ShieldAlert size={20} className="text-red-600 shrink-0" />
                      Double Warning — Irreversible Deletion
                    </div>

                    <p className="text-xs leading-relaxed text-red-900 font-medium">
                      You are about to permanently purge <strong className="font-bold text-red-950 underline">{scanResult.logMonths.length} old monthly files</strong> and <strong className="font-bold text-red-950 underline">{scanResult.adjustmentCount} adjustment records</strong> recorded before <strong className="font-bold text-red-950">{getCutoffLabel()}</strong>.
                    </p>

                    <div className="p-3 bg-white/90 rounded-lg border border-red-200 text-xs text-slate-800 space-y-1 font-mono">
                      <div>• Cutoff Month: <strong className="text-red-600">{getCutoffLabel()}</strong></div>
                      <div>• Affected Month Logs: {scanResult.logMonths.length} monthly documents</div>
                      <div>• Total Affected Entries: ~{scanResult.totalLogEntriesCount} recorded lessons</div>
                    </div>

                    <p className="text-[11px] font-bold text-red-700">
                      ⚠️ Once executed, this data CANNOT be recovered from any phone, laptop, or server backup.
                    </p>
                  </div>

                  {/* Security Confirmation Text Input */}
                  <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Type <span className="text-red-600 font-mono bg-red-100 px-1.5 py-0.5 rounded border border-red-200 font-extrabold">DELETE</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      placeholder="Type DELETE here..."
                      className="w-full px-3 py-2 border-2 border-slate-300 focus:border-red-500 rounded-lg font-mono text-sm uppercase tracking-wider bg-white focus:outline-none"
                      autoFocus
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-semibold">
                      {errorMsg}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      disabled={isDeleting}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      ⬅️ Back to Step 1
                    </button>

                    <button
                      type="button"
                      onClick={handleExecuteDelete}
                      disabled={confirmInput.trim().toUpperCase() !== 'DELETE' || isDeleting}
                      className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white shadow-sm flex items-center gap-2 cursor-pointer transition-all ${
                        confirmInput.trim().toUpperCase() === 'DELETE' && !isDeleting
                          ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-500/30'
                          : 'bg-slate-300 cursor-not-allowed text-slate-500'
                      }`}
                    >
                      {isDeleting ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Purging Old Records...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          <span>Permanently Delete Old Records</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
