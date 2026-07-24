import React, { useState, useEffect } from 'react';
import { getStorageUsageInfo, StorageUsageDetails, formatByteSize } from '../lib/storageUsage';
import { HardDrive, RefreshCw, Database, Trash2, Cloud, Laptop, Info } from 'lucide-react';

interface StorageUsageCardProps {
  onOpenPruneModal?: () => void;
  compact?: boolean;
}

export default function StorageUsageCard({ onOpenPruneModal, compact = false }: StorageUsageCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StorageUsageDetails | null>(null);

  const refreshStorage = async () => {
    setLoading(true);
    try {
      const res = await getStorageUsageInfo();
      setData(res);
    } catch (e) {
      console.error('Failed to load storage info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStorage();
  }, []);

  if (loading && !data) {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-500 font-semibold animate-pulse">
        <RefreshCw size={14} className="animate-spin text-slate-400" />
        Calculating Storage Usage...
      </div>
    );
  }

  if (!data) return null;

  // Local Storage Metrics
  const lsUsed = data.lsUsedBytes;
  const lsQuota = 5 * 1024 * 1024; // 5 MB LocalStorage limit
  const lsAvailable = Math.max(0, lsQuota - lsUsed);
  const lsPercent = Math.min(100, Math.round((lsUsed / lsQuota) * 1000) / 10);

  // Firebase Firestore Cloud Metrics (Default Free Tier 1 GB = 1024 MB)
  const cloudQuota = 1024 * 1024 * 1024; // 1 GB (1,024 MB)
  const cloudUsed = data.usedBytes > 0 ? data.usedBytes : data.lsUsedBytes;
  const cloudAvailable = Math.max(0, cloudQuota - cloudUsed);
  const cloudPercent = Math.min(100, Math.round((cloudUsed / cloudQuota) * 10000) / 100);

  const lsBarColorClass =
    lsPercent > 85 ? 'bg-red-500' : lsPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500';

  if (compact) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
            <HardDrive size={15} className="text-blue-600" />
            <span>Browser & Database Memory</span>
          </div>
          <button
            onClick={refreshStorage}
            title="Refresh Storage Metrics"
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Local Storage Meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-semibold text-slate-700">
            <span>Browser Cache (Max 5 MB)</span>
            <span>{formatByteSize(lsUsed)} / 5 MB ({lsPercent}%)</span>
          </div>
          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full ${lsBarColorClass}`} style={{ width: `${Math.max(2, lsPercent)}%` }} />
          </div>
        </div>

        {/* Cloud Database Meter */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[11px] font-semibold text-teal-800">
            <span>Firebase Cloud DB (1 GB)</span>
            <span>{formatByteSize(cloudUsed)} / 1,024 MB ({cloudPercent < 0.01 ? '<0.1' : cloudPercent}%)</span>
          </div>
          <div className="h-2 w-full bg-teal-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-600" style={{ width: `${Math.max(1, cloudPercent)}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
            <HardDrive size={18} />
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
              Storage Space & Memory Metrics
            </h4>
            <p className="text-[11px] text-slate-500">
              Browser Local Cache vs Firebase Cloud Database
            </p>
          </div>
        </div>

        <button
          onClick={refreshStorage}
          className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Explanation Banner */}
      <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-[11px] text-slate-700 space-y-1">
        <div className="font-bold text-blue-900 flex items-center gap-1.5">
          <Info size={14} className="text-blue-600 shrink-0" />
          <span>Understanding Your Storage Limits</span>
        </div>
        <p className="leading-relaxed">
          Your app stores data in <strong>two layers</strong>: 1) <strong>Browser Local Storage</strong> (capped at ~5 MB by your web browser for offline access) and 2) <strong>Firebase Cloud Storage</strong> (1,024 MB / 1 GB included in Firebase Firestore).
        </p>
      </div>

      {/* Layer 1: Browser Local Cache */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <Laptop size={14} className="text-slate-600" />
            1. Browser Local Storage (Offline Cache)
          </span>
          <span className="font-mono font-bold text-slate-600 text-[11px]">
            Quota: 5 MB
          </span>
        </div>

        <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-500 ${lsBarColorClass}`} style={{ width: `${Math.max(2, lsPercent)}%` }} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          <div className="p-2 bg-white border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">Used Cache</span>
            <span className="font-extrabold text-slate-800">{formatByteSize(lsUsed)}</span>
            <span className="text-[10px] text-slate-400 block">({lsPercent}% of 5 MB)</span>
          </div>

          <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-lg">
            <span className="text-[10px] text-emerald-700 uppercase font-bold block">Available Cache</span>
            <span className="font-extrabold text-emerald-800">{formatByteSize(lsAvailable)}</span>
            <span className="text-[10px] text-emerald-600 block">(Free browser space)</span>
          </div>
        </div>
      </div>

      {/* Layer 2: Firebase Cloud Storage */}
      <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-200 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-teal-900 flex items-center gap-1.5">
            <Cloud size={14} className="text-teal-600" />
            2. Firebase Cloud Database (Firestore)
          </span>
          <span className="font-mono font-bold text-teal-700 text-[11px]">
            Cloud Quota: 1,024 MB (1 GB)
          </span>
        </div>

        <div className="h-2.5 w-full bg-teal-100 rounded-full overflow-hidden">
          <div className="h-full bg-teal-600 transition-all duration-500" style={{ width: `${Math.max(1, cloudPercent)}%` }} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          <div className="p-2 bg-white border border-teal-200 rounded-lg">
            <span className="text-[10px] text-teal-700 uppercase font-bold block">Used Cloud Data</span>
            <span className="font-extrabold text-teal-900">{formatByteSize(cloudUsed)}</span>
            <span className="text-[10px] text-teal-600 block">({cloudPercent < 0.01 ? '<0.01' : cloudPercent}% of 1 GB)</span>
          </div>

          <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-lg">
            <span className="text-[10px] text-emerald-700 uppercase font-bold block">Available Cloud Storage</span>
            <span className="font-extrabold text-emerald-800">{formatByteSize(cloudAvailable)}</span>
            <span className="text-[10px] text-emerald-600 block">(Remaining Firebase space)</span>
          </div>
        </div>
      </div>

      {/* Category Data Footprint */}
      <div className="pt-2 border-t border-slate-100 space-y-2">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
          Local Data Footprint Breakdown
        </span>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
            <span className="text-slate-600 font-medium">Daily Logs & Lessons</span>
            <span className="font-bold text-slate-800">{formatByteSize(data.logsBytes)}</span>
          </div>
          <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
            <span className="text-slate-600 font-medium">Attendance & Kiosks</span>
            <span className="font-bold text-slate-800">{formatByteSize(data.attendanceBytes)}</span>
          </div>
          <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
            <span className="text-slate-600 font-medium">Timetable & Profiles</span>
            <span className="font-bold text-slate-800">{formatByteSize(data.profilesAndTimetableBytes)}</span>
          </div>
          <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
            <span className="text-slate-600 font-medium">Logo & Settings</span>
            <span className="font-bold text-slate-800">{formatByteSize(data.settingsAndBrandingBytes)}</span>
          </div>
        </div>
      </div>

      {/* Action button to open Prune modal if callback provided */}
      {onOpenPruneModal && (
        <div className="pt-1">
          <button
            onClick={onOpenPruneModal}
            className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <Trash2 size={13} />
            <span>Clean Up / Delete Old Records...</span>
          </button>
        </div>
      )}
    </div>
  );
}

