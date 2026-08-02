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
  studentTeamsId?: string;
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
  const [activeSubTab, setActiveSubTab] = useState<'logs' | 'last_week_absent' | 'daily_schedule'>('logs');
  
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
            studentTeamsId: student?.teamsId || '',
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

  // Compile the daily schedule slots on the referenceDate
  const dailySlots = getSlotsForDate(referenceDate, slots, dailyAdjustments);
  
  // Apply search filtering on the daily slots
  const filteredDailySlots = dailySlots.filter((slot) => {
    const student = students.find((st) => st.id === slot.studentId);
    const teacher = teachers.find((t) => t.id === slot.teacherId);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchStudentName = student?.name.toLowerCase().includes(term);
      const matchSubject = slot.subject.toLowerCase().includes(term);
      const matchTeacherName = teacher?.name.toLowerCase().includes(term);
      const matchTeams = student?.teamsId?.toLowerCase().includes(term);
      const matchZoom = student?.zoom?.toLowerCase().includes(term);
      const matchMeet = student?.googleMeet?.toLowerCase().includes(term);
      return matchStudentName || matchSubject || matchTeacherName || matchTeams || matchZoom || matchMeet;
    }
    return true;
  });

  // Calculate daily stats
  const totalDailyScheduled = dailySlots.length;
  let dailyPresentCount = 0;
  let dailyAbsentCount = 0;
  let dailyLeaveCount = 0;
  let dailyPendingCount = 0;

  dailySlots.forEach((slot) => {
    const parts = referenceDate.split('-');
    const mKey = `${parts[0]}-${parts[1]}`;
    const logEntry = logsCache[mKey]?.[slot.id]?.[referenceDate];
    if (logEntry) {
      if (logEntry.status === 'present') dailyPresentCount++;
      else if (logEntry.status === 'absent') dailyAbsentCount++;
      else if (logEntry.status === 'leave') dailyLeaveCount++;
      else dailyPendingCount++;
    } else {
      dailyPendingCount++;
    }
  });

  const renderPlatformValue = (value?: string, type: 'zoom' | 'teams' | 'meet' = 'zoom') => {
    if (!value) return <span className="text-slate-400 font-medium">—</span>;
    const isUrl = value.startsWith('http://') || value.startsWith('https://');
    
    let bg = 'bg-slate-50';
    let text = 'text-slate-700';
    let border = 'border-slate-200';
    if (type === 'zoom') {
      bg = 'bg-blue-50';
      text = 'text-blue-700';
      border = 'border-blue-100';
    } else if (type === 'teams') {
      bg = 'bg-indigo-50';
      text = 'text-indigo-700';
      border = 'border-indigo-100';
    } else if (type === 'meet') {
      bg = 'bg-teal-50';
      text = 'text-teal-700';
      border = 'border-teal-100';
    }

    if (isUrl) {
      return (
        <a 
          href={value} 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`text-xs font-semibold underline truncate block max-w-[140px] ${text} hover:opacity-85 no-print`}
        >
          Open Link
        </a>
      );
    }
    return (
      <span className={`font-mono text-[11px] px-2 py-0.5 rounded border block max-w-[140px] truncate ${bg} ${text} ${border}`} title={value}>
        {value}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-[var(--quran-soft)] text-[var(--quran)] border border-[var(--quran)]/20 uppercase tracking-wider">
            Present
          </span>
        );
      case 'absent':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-[var(--warn-soft)] text-[var(--warn)] border border-[var(--warn)]/20 uppercase tracking-wider">
            Absent
          </span>
        );
      case 'leave':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-[var(--science-soft)] text-[var(--science)] border border-[var(--science)]/20 uppercase tracking-wider">
            On Leave
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">
            Pending
          </span>
        );
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

          {/* Time Scope - Only visible on Logs tab */}
          {activeSubTab === 'logs' && (
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
          )}

          {/* Status Filter - Only visible on Logs tab */}
          {activeSubTab === 'logs' && (
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
          )}

          {/* Search bar */}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Search</span>
            <div className="relative">
              <input
                type="text"
                placeholder={activeSubTab === 'logs' ? "Search student, teacher..." : "Search student, link, subject..."}
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold focus:outline-none focus:border-[var(--accent)] w-56"
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
            disabled={activeSubTab === 'logs' ? filteredRecords.length === 0 : filteredDailySlots.length === 0}
            className="px-4 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white text-xs font-bold rounded-lg cursor-pointer transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer size={14} /> {activeSubTab === 'logs' ? 'Print Absence Report' : 'Print Day Summary'}
          </button>
        </div>
      </div>

      {/* Sub-tab Switcher */}
      <div className="flex border-b border-slate-200 no-print print:hidden">
        <button
          onClick={() => setActiveSubTab('logs')}
          className={`px-5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'logs'
              ? 'border-[var(--accent)] text-[var(--accent)] bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Absence & Leave Logs
        </button>
        <button
          onClick={() => {
            setActiveSubTab('last_week_absent');
            setTimeScope('week');
            setStatusFilter('absent');
          }}
          className={`px-5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'last_week_absent'
              ? 'border-red-600 text-red-600 bg-red-50/50'
              : 'border-transparent text-slate-600 hover:text-red-600'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span>⚡ 1-Click: Last 1 Week Absentees</span>
          <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-red-100 text-red-800 font-extrabold rounded-full">
            {records.filter(r => r.status === 'absent').length}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('daily_schedule')}
          className={`px-5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'daily_schedule'
              ? 'border-[var(--accent)] text-[var(--accent)] bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Daily Schedule Summary
        </button>
      </div>

      {/* Tab B: 1-CLICK LAST 1 WEEK ABSENTEES */}
      {activeSubTab === 'last_week_absent' && (
        <div className="space-y-4">
          <div className="bg-red-50/80 border-2 border-red-200 p-4 rounded-xl flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-600 text-white rounded-xl shadow-xs">
                <UserMinus size={22} />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-red-950 uppercase tracking-wider">
                  Students Absent in the Last 1 Week (7 Days)
                </h3>
                <p className="text-xs text-red-800 font-medium">
                  Instant 1-click summary of all recorded student absences over the past 7 days up to {formatDateNice(referenceDate)}.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Printer size={14} />
                <span>Print 1-Week Absent Report</span>
              </button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Class Absences</span>
              <span className="text-xl font-extrabold text-red-600">{records.filter(r => r.status === 'absent').length}</span>
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Unique Students Absent</span>
              <span className="text-xl font-extrabold text-slate-800">
                {new Set(records.filter(r => r.status === 'absent').map(r => r.studentName)).size}
              </span>
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Date Scope</span>
              <span className="text-xs font-bold text-slate-700">Past 7 Days</span>
            </div>
          </div>

          {/* Table of Absentees */}
          {records.filter(r => r.status === 'absent').length === 0 ? (
            <div className="p-8 bg-white border border-dashed border-slate-200 rounded-xl text-center text-slate-500 font-semibold text-xs">
              🎉 No students were recorded absent in the last 1 week!
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Teams / ID</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Class Time</th>
                    <th className="p-3">Teacher</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.filter(r => r.status === 'absent').map((rec) => (
                    <tr key={rec.id} className="hover:bg-red-50/20 transition-colors">
                      <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                        {formatDateNice(rec.dateStr)}
                      </td>
                      <td className="p-3 font-extrabold text-slate-900">
                        {rec.studentName}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-600">
                        {rec.studentTeamsId || '—'}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSubjectClass(rec.subject)}`}>
                          {rec.subject}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-600">
                        {rec.time} ({rec.duration}m)
                      </td>
                      <td className="p-3 font-semibold text-slate-700">
                        {rec.actualTeacherName}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 border border-red-200 text-[10px] font-extrabold rounded-md uppercase">
                          Absent
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 italic">
                        {rec.remarks || 'No remarks provided'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab A: ABSENCE & LEAVE LOGS */}
      {activeSubTab === 'logs' && (
        <>
          {/* Main Print Header */}
          <div className="hidden print:block border-b-2 border-slate-300 pb-4 mb-6">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <h1 className="serif-title font-extrabold text-2xl text-slate-900">Student Absence & Leave Report</h1>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Reference Date: {formatDateNice(referenceDate)} &middot; Scope: {timeScope === 'today' ? 'Today Only' : 'Last 7 Days'} &middot; Generated on {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-extrabold text-lg tracking-tight">
                  <span style={{ color: '#2596be' }}>Islamic Education</span> <span style={{ color: '#ff8610' }}>Centre</span>
                </span>
              </div>
            </div>
          </div>

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
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider print:hidden">Date</th>
                      )}
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider print:w-[25%] print:px-2 print:py-1.5">Student</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider print:w-[15%] print:px-2 print:py-1.5">Subject</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden print:table-cell print:w-[20%] print:px-2 print:py-1.5">Teams ID</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden print:table-cell print:w-[25%] print:px-2 print:py-1.5">Teacher</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider print:w-[15%] print:px-2 print:py-1.5">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider print:hidden">Time</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider print:hidden">Regular Teacher</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider print:hidden">Covering Teacher</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider print:hidden">Remarks / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {filteredRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/50">
                        {timeScope === 'week' && (
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-slate-700 print:hidden">
                            {formatDateNice(rec.dateStr)}
                          </td>
                        )}
                        <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-800 print:w-[25%] print:px-2 print:py-1.5">
                          {rec.studentName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap print:w-[15%] print:px-2 print:py-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${getSubjectClass(rec.subject)}`}>
                            {rec.subject}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap hidden print:table-cell print:w-[20%] print:px-2 print:py-1.5 text-xs">
                          {rec.studentTeamsId ? (
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded border bg-blue-50/50 text-blue-700 border-blue-200/40">
                              {rec.studentTeamsId}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap hidden print:table-cell print:w-[25%] print:px-2 print:py-1.5 text-xs">
                          {rec.actualTeacherName !== rec.regularTeacherName ? (
                            <span className="text-[var(--science)] font-semibold">
                              {rec.actualTeacherName} (Sub)
                            </span>
                          ) : (
                            <span className="text-slate-600 font-medium">{rec.actualTeacherName}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap print:w-[15%] print:px-2 print:py-1.5">
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
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 font-medium print:hidden">
                          {formatTimeToAMPM(rec.time)} &middot; {rec.duration}m
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs font-medium print:hidden">
                          {rec.regularTeacherName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-medium print:hidden">
                          {rec.actualTeacherName !== rec.regularTeacherName ? (
                            <span className="text-[var(--science)] font-semibold" title="Covering as Substitute">
                              {rec.actualTeacherName} (Sub)
                            </span>
                          ) : (
                            <span className="text-slate-500">{rec.actualTeacherName}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-pre-wrap max-w-xs italic print:hidden">
                          {rec.remarks || rec.content || <span className="text-slate-400 not-italic">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab B: DAILY SCHEDULE SUMMARY */}
      {activeSubTab === 'daily_schedule' && (
        <>
          {/* Main Print Header */}
          <div className="hidden print:block border-b-2 border-slate-300 pb-4 mb-6">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <h1 className="serif-title font-extrabold text-2xl text-slate-900">Daily Classes Schedule Summary</h1>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Date: {formatDateNice(referenceDate)} &middot; Generated on {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-extrabold text-lg tracking-tight">
                  <span style={{ color: '#2596be' }}>Islamic Education</span> <span style={{ color: '#ff8610' }}>Centre</span>
                </span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
              <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-[var(--accent)] animate-spin" />
              <span className="font-semibold">Loading daily schedule register...</span>
            </div>
          ) : filteredDailySlots.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 space-y-2">
              <Calendar size={32} className="mx-auto text-slate-300" />
              <p className="font-semibold text-sm">No classes match your criteria or scheduled today.</p>
              <p className="text-xs max-w-sm mx-auto text-slate-400">
                There are no weekly classes or adjusted schedules matching your reference date on {formatDateNice(referenceDate)}.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Stats badges */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 no-print print:hidden">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                  <div className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">Scheduled</div>
                  <div className="font-bold text-lg text-slate-800">{totalDailyScheduled}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                  <div className="text-emerald-500 text-[9px] font-bold uppercase tracking-wider">Present</div>
                  <div className="font-bold text-lg text-emerald-700">{dailyPresentCount}</div>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                  <div className="text-red-500 text-[9px] font-bold uppercase tracking-wider">Absent</div>
                  <div className="font-bold text-lg text-red-700">{dailyAbsentCount}</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center">
                  <div className="text-indigo-500 text-[9px] font-bold uppercase tracking-wider">On Leave</div>
                  <div className="font-bold text-lg text-indigo-700">{dailyLeaveCount}</div>
                </div>
                <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-center col-span-2 md:col-span-1">
                  <div className="text-slate-500 text-[9px] font-bold uppercase tracking-wider font-semibold">Pending / Unlogged</div>
                  <div className="font-bold text-lg text-slate-600">{dailyPendingCount}</div>
                </div>
              </div>

              {/* Table wrapper */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs table-wrap">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%] print:hidden">Time</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[22%] print:w-[25%] print:px-2 print:py-1.5">Student</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%] print:w-[15%] print:px-2 print:py-1.5">Subject</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[14%] print:w-[20%] print:px-2 print:py-1.5">Teams ID</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[14%] print:hidden">Zoom ID / Link</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%] print:hidden">Google Meet</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[18%] print:w-[25%] print:px-2 print:py-1.5">Teacher</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[10%] print:w-[15%] print:px-2 print:py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {filteredDailySlots.map((slot) => {
                      const student = students.find((st) => st.id === slot.studentId);
                      const teacher = teachers.find((t) => t.id === slot.teacherId);
                      
                      // Resolve COVERING substitute teacher for this specific slot and date
                      const parts = referenceDate.split('-');
                      const mKey = `${parts[0]}-${parts[1]}`;
                      const subId = subsCache[mKey]?.[slot.id]?.[referenceDate];
                      const actualTeacher = subId 
                        ? teachers.find((t) => t.id === subId) 
                        : teacher;

                      // Resolve attendance status
                      const logEntry = logsCache[mKey]?.[slot.id]?.[referenceDate];
                      const status = logEntry ? logEntry.status : '';

                      return (
                        <tr key={slot.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-slate-700 print:hidden">
                            {formatTimeToAMPM(slot.time)} <span className="text-[10px] text-slate-400 font-normal">({slot.duration}m)</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-extrabold text-slate-900 print:w-[25%] print:px-2 print:py-1.5">
                            {student?.name || 'Removed Student'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap print:w-[15%] print:px-2 print:py-1.5">
                            <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${getSubjectClass(slot.subject)}`}>
                              {slot.subject}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap print:w-[20%] print:px-2 print:py-1.5">
                            {renderPlatformValue(student?.teamsId, 'teams')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap print:hidden">
                            {renderPlatformValue(student?.zoom, 'zoom')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap print:hidden">
                            {renderPlatformValue(student?.googleMeet, 'meet')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs print:w-[25%] print:px-2 print:py-1.5">
                            {actualTeacher ? (
                              actualTeacher.id !== teacher?.id ? (
                                <span className="text-[var(--science)] font-semibold" title={`Regular: ${teacher?.name || '—'}`}>
                                  {actualTeacher.name} (Sub)
                                </span>
                              ) : (
                                <span className="text-slate-600 font-medium">{actualTeacher.name}</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap print:w-[15%] print:px-2 print:py-1.5">
                            {getStatusBadge(status)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
