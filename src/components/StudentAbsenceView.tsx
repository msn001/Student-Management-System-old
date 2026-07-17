import React, { useState, useEffect } from 'react';
import { ClassSlot, Student, Teacher, LessonEntry } from '../types';
import { StorageService } from '../lib/storage';
import { getSlotsForDate, formatTimeToAMPM } from '../lib/utils';
import { Printer, Calendar, Clock, AlertTriangle, UserMinus, Search, RefreshCw, FileText } from 'lucide-react';

interface StudentAbsenceViewProps {
  slots: ClassSlot[];
  students: Student[];
  teachers: Teacher[];
  dailyAdjustments: Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>;
  logDate: string; // The active date from parent
}

interface AbsenceRecord {
  id: string;
  dateStr: string;
  studentName: string;
  subject: string;
  status: 'absent' | 'leave';
  time: string;
  duration: number;
  regularTeacherName: string;
  actualTeacherName: string;
  remarks: string;
  content: string;
}

export default function StudentAbsenceView({
  slots,
  students,
  teachers,
  dailyAdjustments,
  logDate,
}: StudentAbsenceViewProps) {
  const [referenceDate, setReferenceDate] = useState(logDate || new Date().toISOString().split('T')[0]);
  const [timeScope, setTimeScope] = useState<'today' | 'week'>('today');
  const [statusFilter, setStatusFilter] = useState<'all' | 'absent' | 'leave'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [logsCache, setLogsCache] = useState<Record<string, Record<string, Record<string, LessonEntry>>>>({});
  const [subsCache, setSubsCache] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const [records, setRecords] = useState<AbsenceRecord[]>([]);

  // Update reference date if parent log date changes
  useEffect(() => {
    if (logDate) {
      setReferenceDate(logDate);
    }
  }, [logDate]);

  // Generate date list based on scope
  const getDatesInRange = (refDate: string, scope: 'today' | 'week'): string[] => {
    if (!refDate) return [];
    if (scope === 'today') return [refDate];

    const dates: string[] = [];
    const parts = refDate.split('-').map(Number);
    const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);

    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    return dates;
  };

  // Extract unique month keys (YYYY-MM) from list of dates
  const getMonthKeysForDates = (dates: string[]): string[] => {
    const keys = dates.map((d) => {
      const parts = d.split('-');
      return `${parts[0]}-${parts[1]}`;
    });
    return Array.from(new Set(keys));
  };

  // Load logs & subs for relevant months
  useEffect(() => {
    const loadRequiredData = async () => {
      if (!referenceDate) return;
      setLoading(true);
      
      const dates = getDatesInRange(referenceDate, timeScope);
      const mKeys = getMonthKeysForDates(dates);
      
      const newLogsCache = { ...logsCache };
      const newSubsCache = { ...subsCache };
      let updated = false;

      for (const mKey of mKeys) {
        if (!newLogsCache[mKey]) {
          try {
            const logs = await StorageService.getMonthLogs(mKey);
            const subs = await StorageService.getMonthSubs(mKey);
            newLogsCache[mKey] = logs;
            newSubsCache[mKey] = subs;
            updated = true;
          } catch (e) {
            console.error(`Failed to load monthly logs for ${mKey}`, e);
          }
        }
      }

      if (updated) {
        setLogsCache(newLogsCache);
        setSubsCache(newSubsCache);
      }
      
      compileRecords(dates, updated ? newLogsCache : logsCache, updated ? newSubsCache : subsCache);
      setLoading(false);
    };

    loadRequiredData();
  }, [referenceDate, timeScope, slots, dailyAdjustments, teachers, students]);

  // Re-compile records whenever the cache or other parameters change
  const compileRecords = (
    dates: string[],
    currentLogs: typeof logsCache,
    currentSubs: typeof subsCache
  ) => {
    const compiled: AbsenceRecord[] = [];

    dates.forEach((dateStr) => {
      const parts = dateStr.split('-');
      const mKey = `${parts[0]}-${parts[1]}`;
      const monthLogs = currentLogs[mKey] || {};
      const monthSubs = currentSubs[mKey] || {};

      // Get slots for this specific date
      const dateSlots = getSlotsForDate(dateStr, slots, dailyAdjustments);

      dateSlots.forEach((slot) => {
        const slotLogs = monthLogs[slot.id];
        if (!slotLogs) return;

        const logEntry = slotLogs[dateStr];
        if (!logEntry) return;

        if (logEntry.status === 'absent' || logEntry.status === 'leave') {
          const student = students.find((st) => st.id === slot.studentId);
          const regularTeacher = teachers.find((t) => t.id === slot.teacherId);
          
          // Determine covering teacher today
          const subId = monthSubs[slot.id]?.[dateStr];
          const actualTeacher = subId 
            ? teachers.find((t) => t.id === subId) 
            : regularTeacher;

          compiled.push({
            id: `${slot.id}-${dateStr}`,
            dateStr,
            studentName: student?.name || 'Removed Student',
            subject: slot.subject,
            status: logEntry.status,
            time: slot.time,
            duration: slot.duration,
            regularTeacherName: regularTeacher?.name || 'Removed Teacher',
            actualTeacherName: actualTeacher?.name || regularTeacher?.name || 'Removed Teacher',
            remarks: logEntry.remarks || '',
            content: logEntry.content || '',
          });
        }
      });
    });

    // Sort by Date (newest first), then by Time (earliest first)
    compiled.sort((a, b) => {
      if (a.dateStr !== b.dateStr) {
        return b.dateStr.localeCompare(a.dateStr);
      }
      return a.time.localeCompare(b.time);
    });

    setRecords(compiled);
  };

  // Perform manual refresh
  const handleRefresh = async () => {
    setLoading(true);
    const dates = getDatesInRange(referenceDate, timeScope);
    const mKeys = getMonthKeysForDates(dates);
    
    const newLogsCache = { ...logsCache };
    const newSubsCache = { ...subsCache };

    for (const mKey of mKeys) {
      try {
        const logs = await StorageService.getMonthLogs(mKey);
        const subs = await StorageService.getMonthSubs(mKey);
        newLogsCache[mKey] = logs;
        newSubsCache[mKey] = subs;
      } catch (e) {
        console.error(`Failed to refresh monthly logs for ${mKey}`, e);
      }
    }

    setLogsCache(newLogsCache);
    setSubsCache(newSubsCache);
    compileRecords(dates, newLogsCache, newSubsCache);
    setLoading(false);
  };

  // Format date nicely (e.g. "Fri, Jul 17")
  const formatDateNice = (dateStr: string) => {
    try {
      const parts = dateStr.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Filter compiled records
  const filteredRecords = records.filter((rec) => {
    // Status Filter
    if (statusFilter !== 'all' && rec.status !== statusFilter) {
      return false;
    }

    // Search Term Filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = rec.studentName.toLowerCase().includes(term);
      const matchSubject = rec.subject.toLowerCase().includes(term);
      const matchTeacher = rec.actualTeacherName.toLowerCase().includes(term);
      if (!matchName && !matchSubject && !matchTeacher) {
        return false;
      }
    }

    return true;
  });

  const handlePrint = () => {
    window.print();
  };

  const getSubjectClass = (sub: string) => {
    switch (sub) {
      case 'Math':
        return 'bg-[var(--math-soft)] text-[var(--math)] border-[var(--math)]/20';
      case 'Science':
        return 'bg-[var(--science-soft)] text-[var(--science)] border-[var(--science)]/20';
      case 'English':
        return 'bg-[var(--english-soft)] text-[var(--english)] border-[var(--english)]/20';
      case 'Quran / Islamic Studies':
        return 'bg-[var(--quran-soft)] text-[var(--quran)] border-[var(--quran)]/20';
      default:
        return 'bg-[var(--other-soft)] text-[var(--other)] border-[var(--other)]/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-100 rounded-xl border border-slate-200 no-print print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          {/* Reference Date */}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reference Date</span>
            <div className="relative">
              <input
                type="date"
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold focus:outline-none focus:border-[var(--accent)]"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
              />
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            </div>
          </div>

          {/* Time Scope */}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Time Scope</span>
            <div className="flex bg-white rounded-lg border border-slate-300 p-0.5">
              <button
                onClick={() => setTimeScope('today')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  timeScope === 'today'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Today Only
              </button>
              <button
                onClick={() => setTimeScope('week')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  timeScope === 'week'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Last 1 Week
              </button>
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</span>
            <select
              className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold focus:outline-none focus:border-[var(--accent)]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">Absent & On Leave</option>
              <option value="absent">Absent Only</option>
              <option value="leave">On Leave Only</option>
            </select>
          </div>

          {/* Search bar */}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Search</span>
            <div className="relative">
              <input
                type="text"
                placeholder="Search student, teacher..."
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold focus:outline-none focus:border-[var(--accent)] w-48"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-600 rounded-lg cursor-pointer transition-all shadow-2xs"
            title="Refresh logs data"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handlePrint}
            disabled={filteredRecords.length === 0}
            className="px-4 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white text-xs font-bold rounded-lg cursor-pointer transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer size={14} /> Print Report
          </button>
        </div>
      </div>

      {/* Main Print Header (Hides on UI screen, Shows only during general Printing) */}
      <div className="hidden print:block border-b-2 border-slate-300 pb-4 mb-6">
        <h1 className="serif-title font-extrabold text-2xl text-slate-900">Student Absence & Leave Report</h1>
        <p className="text-xs font-semibold text-slate-500 mt-1">
          Reference Date: {formatDateNice(referenceDate)} &middot; Scope: {timeScope === 'today' ? 'Today Only' : 'Last 7 Days'} &middot; Generated on {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Content Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-[var(--accent)] animate-spin" />
          <span className="font-semibold">Loading student log registers...</span>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 space-y-2">
          <UserMinus size={32} className="mx-auto text-slate-300" />
          <p className="font-semibold text-sm">No absent or on-leave student entries found.</p>
          <p className="text-xs max-w-sm mx-auto text-slate-400">
            {timeScope === 'today' 
              ? `There are no student lesson logs marked as 'Absent' or 'On Leave' on ${formatDateNice(referenceDate)}.`
              : `There are no student lesson logs marked as 'Absent' or 'On Leave' between ${formatDateNice(getDatesInRange(referenceDate, 'week')[6])} and ${formatDateNice(referenceDate)}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary stats badge row */}
          <div className="flex gap-4 mb-2 no-print print:hidden">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
              Total Records: <strong className="text-slate-800">{filteredRecords.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--warn)]">
              Absents: <strong className="text-[var(--warn)]">{filteredRecords.filter(r => r.status === 'absent').length}</strong>
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--science)]">
              On Leave: <strong className="text-[var(--science)]">{filteredRecords.filter(r => r.status === 'leave').length}</strong>
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs table-wrap">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {timeScope === 'week' && (
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  )}
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Regular Teacher</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Covering Teacher</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Remarks / Reason</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/50">
                    {timeScope === 'week' && (
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-slate-700">
                        {formatDateNice(rec.dateStr)}
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-800">
                      {rec.studentName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${getSubjectClass(rec.subject)}`}>
                        {rec.subject}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {rec.status === 'absent' ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-[var(--warn-soft)] text-[var(--warn)] border border-[var(--warn)]/20 uppercase tracking-wider">
                          Absent
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-[var(--science-soft)] text-[var(--science)] border border-[var(--science)]/20 uppercase tracking-wider">
                          On Leave
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 font-medium">
                      {formatTimeToAMPM(rec.time)} &middot; {rec.duration}m
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs font-medium">
                      {rec.regularTeacherName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">
                      {rec.actualTeacherName !== rec.regularTeacherName ? (
                        <span className="text-[var(--science)] font-semibold" title="Covering as Substitute">
                          {rec.actualTeacherName} (Sub)
                        </span>
                      ) : (
                        <span className="text-slate-500">{rec.actualTeacherName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-pre-wrap max-w-xs italic">
                      {rec.remarks || rec.content || <span className="text-slate-400 not-italic">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
