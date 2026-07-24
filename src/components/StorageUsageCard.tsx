import React, { useState, useEffect } from 'react';
import { getStorageUsageInfo, StorageUsageDetails, formatByteSize } from '../lib/storageUsage';
import { HardDrive, RefreshCw, Database, Trash2, PieChart, CheckCircle2, ShieldAlert } from 'lucide-react';

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

  // Use LocalStorage quota (5MB) or Browser Origin Quota for high-precision display
  const isLocalStorageDisplay = data.quotaBytes > 50 * 1024 * 1024; // If browser quota is large (e.g. 1GB+), also show LocalStorage breakdown
  const primaryUsed = isLocalStorageDisplay ? data.lsUsedBytes : data.usedBytes;
  const primaryQuota = isLocalStorageDisplay ? data.lsQuotaBytes : data.quotaBytes;
  const primaryAvailable = isLocalStorageDisplay ? data.lsAvailableBytes : data.availableBytes;
  const primaryPercent = isLocalStorageDisplay ? data.lsPercentUsed : data.percentUsed;

  const barColorClass =
    primaryPercent > 85
      ? 'bg-red-500'
      : primaryPercent > 60
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  if (compact) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
            <HardDrive size={15} className="text-blue-600" />
            <span>Storage Usage</span>
          </div>
          <button
            onClick={refreshStorage}
            title="Refresh Storage Metrics"
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-500 ${barColorClass}`}
              style={{ width: `${Math.max(2, primaryPercent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1 font-medium">
            <span>Used: <strong className="text-slate-800">{formatByteSize(primaryUsed)}</strong> ({primaryPercent}%)</span>
            <span>Available: <strong className="text-emerald-700">{formatByteSize(primaryAvailable)}</strong></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
            <HardDrive size={18} />
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
              Storage Space & Memory
            </h4>
            <p className="text-[11px] text-slate-500">
              Browser & Database Local Footprint
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

      {/* Main Meter */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline text-xs">
          <span className="font-semibold text-slate-600">
            Storage Capacity Meter ({primaryPercent}% Used)
          </span>
          <span className="text-[11px] font-bold text-slate-500">
            Quota: {formatByteSize(primaryQuota)}
          </span>
        </div>

        <div className="h-3 w-full bg-slate-100 border border-slate-200 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
            style={{ width: `${Math.max(2, primaryPercent)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase font-extrabold block">Used Space</span>
            <span className="text-sm font-extrabold text-slate-800">{formatByteSize(primaryUsed)}</span>
          </div>

          <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg">
            <span className="text-[10px] text-emerald-700 uppercase font-extrabold block">Available Space</span>
            <span className="text-sm font-extrabold text-emerald-800">{formatByteSize(primaryAvailable)}</span>
          </div>
        </div>
      </div>

      {/* Item Breakdown */}
      <div className="pt-2 border-t border-slate-100 space-y-2">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
          Memory Breakdown
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
            <span className="text-slate-600 font-medium">Logo & Branding</span>
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
