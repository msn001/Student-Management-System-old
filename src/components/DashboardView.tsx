import React, { useState, useEffect } from 'react';
import { ClassSlot, Student, Teacher, LessonEntry } from '../types';
import { StorageService } from '../lib/storage';
import { Bell, Calendar, ClipboardList, AlertCircle, Video, Clock, Lock, Users, Check } from 'lucide-react';
import { formatTimeToAMPM, getSlotsForDate } from '../lib/utils';

interface DashboardViewProps {
  slots: ClassSlot[];
  students: Student[];
  teachers: Teacher[];
  logsByMonth: Record<string, Record<string, Record<string, LessonEntry>>>;
  subsByMonth: Record<string, Record<string, Record<string, string>>>;
  onUpdateSubs: (mKey: string, subs: Record<string, Record<string, string>>) => void;
  dashDate: string;
  onUpdateDashDate: (date: string) => void;
  dailyAdjustments: Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>;
  isUnlocked: boolean;
  onRequireUnlock: () => void;
}

const SCHOOL_DAY_CUTOFF_HOUR = 6;

export default function DashboardView({
  slots,
  students,
  teachers,
  logsByMonth,
  subsByMonth,
  onUpdateSubs,
  dashDate,
  onUpdateDashDate,
  dailyAdjustments,
  isUnlocked,
  onRequireUnlock,
}: DashboardViewProps) {
  const [selectedDateStr, setSelectedDateStr] = useState(dashDate);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [isCustomCheckActive, setIsCustomCheckActive] = useState(false);
  const [customCheckDate, setCustomCheckDate] = useState(() => {
    return dashDate || new Date().toISOString().split('T')[0];
  });
  const [customCheckTime, setCustomCheckTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  // Sync custom date check with dashboard date unless overridden
  useEffect(() => {
    if (!isCustomCheckActive) {
      setCustomCheckDate(selectedDateStr);
    }
  }, [selectedDateStr, isCustomCheckActive]);

  // Keep date synced with parent
  useEffect(() => {
    setSelectedDateStr(dashDate);
  }, [dashDate]);

  // Keep track of real-time for countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000); // refresh every 10 seconds
    return () => clearInterval(timer);
  }, []);

  // Standard overnight cutoff check: before 6 AM, current school session belongs to the evening prior.
  const getSchoolDateNow = (): Date => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() < SCHOOL_DAY_CUTOFF_HOUR) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  };

  const getSchoolDateString = (d: Date): string => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleJumpToCurrentSession = () => {
    const today = getSchoolDateNow();
    const todayStr = getSchoolDateString(today);
    setSelectedDateStr(todayStr);
    onUpdateDashDate(todayStr);
  };

  const parseDate = (s: string) => {
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };

  const selectedDateObj = parseDate(selectedDateStr);
  const mKey = `${selectedDateStr.split('-')[0]}-${selectedDateStr.split('-')[1]}`;
  const isLiveSession = selectedDateStr === getSchoolDateString(getSchoolDateNow());

  const monthLogs = logsByMonth[mKey] || {};
  const monthSubs = subsByMonth[mKey] || {};

  // Resolve what actual moment a slot occurs on (accounting for early mornings past midnight)
  const getSlotOccurrence = (schoolDate: Date, slot: ClassSlot): Date => {
    const parts = slot.time.split(':').map(Number);
    const occ = new Date(schoolDate.getFullYear(), schoolDate.getMonth(), schoolDate.getDate(), parts[0], parts[1]);
    if (parts[0] < SCHOOL_DAY_CUTOFF_HOUR) {
      occ.setDate(occ.getDate() + 1);
    }
    return occ;
  };

  const getEffectiveTeacherId = (slot: ClassSlot): string => {
    const subsForSlot = monthSubs[slot.id];
    if (subsForSlot && subsForSlot[selectedDateStr]) {
      return subsForSlot[selectedDateStr];
    }
    return slot.teacherId;
  };

  const handleSubstituteChange = async (slotId: string, value: string) => {
    const updatedSubs = { ...monthSubs };
    if (!updatedSubs[slotId]) {
      updatedSubs[slotId] = {};
    }

    if (!value) {
      delete updatedSubs[slotId][selectedDateStr];
      if (Object.keys(updatedSubs[slotId]).length === 0) {
        delete updatedSubs[slotId];
      }
    } else {
      updatedSubs[slotId][selectedDateStr] = value;
    }

    onUpdateSubs(mKey, updatedSubs);
    await StorageService.saveMonthSubs(mKey, updatedSubs);
  };

  const handleEnableAlerts = () => {
    if (!('Notification' in window)) {
      alert("This browser does not support desktop alerts.");
      return;
    }
    Notification.requestPermission().then((perm) => {
      setNotifyEnabled(perm === 'granted');
      if (perm === 'granted') {
        new Notification("Alerts enabled!", { body: "You will be notified 5 and 10 minutes before classes start." });
      }
    });
  };

  // Trigger Notifications
  useEffect(() => {
    if (!notifyEnabled || !isLiveSession) return;
    
    // Find classes starting in next 10 minutes (using resolved schedule)
    const todaySlots = getSlotsForDate(selectedDateStr, slots, dailyAdjustments);
    todaySlots.forEach((s) => {
      const occ = getSlotOccurrence(selectedDateObj, s);
      const diffMin = (occ.getTime() - currentTime.getTime()) / 60000;
      const student = students.find((st) => st.id === s.studentId);
      const name = student?.name || 'Student';

      // 10 minutes warning
      if (diffMin > 9 && diffMin <= 10) {
        const key = `10m-${s.id}-${selectedDateStr}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, 'true');
          new Notification(`Class starting in 10 minutes!`, {
            body: `${name} — ${s.subject} at ${formatTimeToAMPM(s.time)}`,
          });
        }
      }

      // 5 minutes warning
      if (diffMin > 4 && diffMin <= 5) {
        const key = `5m-${s.id}-${selectedDateStr}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, 'true');
          new Notification(`Class starting in 5 minutes!`, {
            body: `${name} — ${s.subject} at ${formatTimeToAMPM(s.time)}`,
          });
        }
      }
    });
  }, [currentTime, notifyEnabled, isLiveSession, slots, selectedDateObj, selectedDateStr, students, dailyAdjustments]);

  // Today's classes (resolved with makeup slots and daily overrides)
  const todaySlots = getSlotsForDate(selectedDateStr, slots, dailyAdjustments);

  // Filter today's classes by selected teacher (incorporating substitution checks!)
  const filteredTodaySlots = todaySlots.filter((s) => {
    if (!selectedTeacherId) return true;
    const effTeacherId = getEffectiveTeacherId(s);
    return effTeacherId === selectedTeacherId;
  }).sort((a, b) => a.time.localeCompare(b.time));

  // Compute stat counts
  let scheduledCount = filteredTodaySlots.length;
  let takenCount = 0;
  let absentCount = 0;
  let leaveCount = 0;

  filteredTodaySlots.forEach((s) => {
    const entry = monthLogs[s.id]?.[selectedDateStr];
    if (entry) {
      if (entry.status === 'present') takenCount++;
      else if (entry.status === 'absent') absentCount++;
      else if (entry.status === 'leave') leaveCount++;
    }
  });

  const pendingCount = scheduledCount - takenCount - absentCount - leaveCount;

  // Compile alerts
  const upcomingAlerts = isLiveSession
    ? todaySlots
        .map((s) => {
          const occ = getSlotOccurrence(selectedDateObj, s);
          const diffMin = (occ.getTime() - currentTime.getTime()) / 60000;
          return { slot: s, diffMin };
        })
        .filter((u) => u.diffMin > 0 && u.diffMin <= 10)
        .sort((a, b) => a.diffMin - b.diffMin)
    : [];

  // Compile next 30 minutes classes
  const comingClasses30 = isLiveSession
    ? todaySlots
        .map((s) => {
          const occ = getSlotOccurrence(selectedDateObj, s);
          const diffMin = (occ.getTime() - currentTime.getTime()) / 60000;
          return { slot: s, diffMin };
        })
        .filter((u) => u.diffMin > 0 && u.diffMin <= 30)
        .sort((a, b) => a.diffMin - b.diffMin)
    : [];

  // Helper to convert time "HH:MM" to minutes since school day start (06:00 AM)
  const timeToSchoolMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    const adjustedHour = h < 6 ? h + 24 : h;
    return adjustedHour * 60 + m;
  };

  // Helper to add minutes to a "HH:MM" time and return "HH:MM"
  const getEndTimeStr = (time24: string, durationMin: number): string => {
    if (!time24) return '';
    const parts = time24.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return time24;
    const date = new Date(2000, 0, 1, parts[0], parts[1] + durationMin);
    const endH = String(date.getHours()).padStart(2, '0');
    const endM = String(date.getMinutes()).padStart(2, '0');
    return `${endH}:${endM}`;
  };

  // Format date helper
  const getFormatTimeStr = (date: Date): string => {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // Compile classes currently in progress
  const inProgressClasses = isLiveSession
    ? todaySlots
        .map((s) => {
          const occ = getSlotOccurrence(selectedDateObj, s);
          const diffMin = (occ.getTime() - currentTime.getTime()) / 60000;
          return { slot: s, diffMin };
        })
        .filter((u) => u.diffMin <= 0 && u.diffMin + u.slot.duration > 0)
        .sort((a, b) => a.diffMin - b.diffMin)
    : [];

  // Resolve what date and time we are checking for teacher availability
  const activeCheckDateStr = isCustomCheckActive ? customCheckDate : selectedDateStr;
  const activeCheckTimeStr = isCustomCheckActive ? customCheckTime : getFormatTimeStr(currentTime);

  const checkSlots = getSlotsForDate(activeCheckDateStr, slots, dailyAdjustments);
  const queryMin = timeToSchoolMinutes(activeCheckTimeStr);

  const teacherAvailabilityList = teachers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      // Find active slot for this teacher at activeCheckTimeStr on activeCheckDateStr
      const activeSlotForTeacher = checkSlots.find((s) => {
        const effTeacherId = getEffectiveTeacherId(s);
        if (effTeacherId !== t.id) return false;

        const startMin = timeToSchoolMinutes(s.time);
        const endMin = startMin + s.duration;
        return queryMin >= startMin && queryMin < endMin;
      });

      return {
        teacher: t,
        isFree: !activeSlotForTeacher,
        slot: activeSlotForTeacher,
      };
    });

  const getSubjectClass = (sub: string) => {
    switch (sub) {
      case 'Math':
        return 'bg-[var(--math-soft)] text-[var(--math)]';
      case 'Science':
        return 'bg-[var(--science-soft)] text-[var(--science)]';
      case 'English':
        return 'bg-[var(--english-soft)] text-[var(--english)]';
      case 'Quran / Islamic Studies':
        return 'bg-[var(--quran-soft)] text-[var(--quran)]';
      default:
        return 'bg-[var(--other-soft)] text-[var(--other)]';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'present':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--quran-soft)] text-[var(--quran)]">Present</span>;
      case 'absent':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--warn-soft)] text-[var(--warn)]">Absent</span>;
      case 'leave':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--science-soft)] text-[var(--science)]">On Leave</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Not Logged</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="serif-title font-bold text-xl text-[var(--ink)]">
          {isLiveSession
            ? 'Today at a glance'
            : `${selectedDateObj.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })} at a glance`}
        </h2>
        <button
          onClick={handleEnableAlerts}
          className="px-3 py-1 bg-white border border-[var(--line-strong)] rounded text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer no-print"
        >
          <Bell size={12} /> {notifyEnabled ? 'Desktop alerts on' : 'Enable desktop alerts'}
        </button>
      </div>

      <p className="text-sm text-[var(--ink-soft)] leading-relaxed -mt-3">
        Live status of today's classes across every teacher. If a teacher is off today, use the Teacher dropdown on the class row below to assign a substitute for today only — the permanent timetable is untouched.
      </p>

      {/* Date & Teacher filters */}
      <div className="flex flex-wrap gap-4 items-center no-print bg-slate-50 p-4 rounded-xl border border-[var(--line)]">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Day</label>
          <input
            type="date"
            className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)] text-sm"
            value={selectedDateStr}
            onChange={(e) => {
              setSelectedDateStr(e.target.value);
              onUpdateDashDate(e.target.value);
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Filter by Active Teacher</label>
          <select
            className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)] text-sm"
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
          >
            <option value="">All teachers</option>
            {teachers
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>

        <div className="pt-5">
          <button
            onClick={handleJumpToCurrentSession}
            className="px-4 py-1.5 border border-slate-300 rounded text-xs bg-white hover:bg-slate-50 cursor-pointer font-semibold text-slate-700 shadow-sm flex items-center gap-1"
          >
            <Calendar size={12} /> Jump to current session
          </button>
        </div>
      </div>

      {/* Main Grid for Teacher Availability + Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Teacher Availability Widget */}
        <div className="lg:col-span-1 space-y-6 no-print">
          <div className="bg-white rounded-xl border-2 border-slate-200/80 p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users size={14} className="text-blue-500" />
                Teacher Status
              </h3>
              {isCustomCheckActive ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                  Custom
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-400 font-semibold leading-relaxed">
              {isCustomCheckActive ? (
                <>
                  Checking availability for <span className="text-slate-700 font-bold">{new Date(activeCheckDateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> at <span className="text-slate-700 font-bold">{formatTimeToAMPM(activeCheckTimeStr)}</span>
                </>
              ) : (
                <>
                  Showing active teacher status at the current moment:
                </>
              )}
            </div>

            {/* Scrollable list of teachers */}
            <div className="max-h-[380px] overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              {teacherAvailabilityList.map(({ teacher, isFree, slot }) => {
                const student = slot ? students.find((st) => st.id === slot.studentId) : null;
                const endTime = slot ? getEndTimeStr(slot.time, slot.duration) : '';

                return (
                  <div
                    key={teacher.id}
                    className={`p-3 rounded-lg border text-xs transition-all ${
                      isFree
                        ? 'bg-emerald-50/10 border-slate-100 hover:border-emerald-200 border-l-4 border-l-emerald-500'
                        : 'bg-red-50/10 border-slate-100 hover:border-red-200 border-l-4 border-l-red-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{teacher.name}</span>
                      {isFree ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                          🟢 Free
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                          🔴 Busy
                        </span>
                      )}
                    </div>

                    {!isFree && slot && (
                      <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-100 space-y-0.5 text-[11px] text-slate-500 font-medium">
                        <div>
                          Teaching <span className="font-bold text-slate-700">{student?.name || 'Removed'}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span className="bg-slate-100 px-1 py-0.5 rounded font-bold">{slot.subject}</span>
                          <span className="font-semibold">{formatTimeToAMPM(slot.time)} - {formatTimeToAMPM(endTime)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom Availability Checker Form */}
            <div className="border-t border-slate-100 pt-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Check Custom Time</span>
                {isCustomCheckActive && (
                  <button
                    onClick={() => setIsCustomCheckActive(false)}
                    className="text-[10px] text-blue-600 hover:underline font-bold"
                  >
                    Reset to Live
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase mb-0.5">Date</label>
                  <input
                    type="date"
                    className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-blue-500 bg-white"
                    value={customCheckDate}
                    onChange={(e) => {
                      setCustomCheckDate(e.target.value);
                      setIsCustomCheckActive(true);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase mb-0.5">Time</label>
                  <input
                    type="time"
                    className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-blue-500 bg-white"
                    value={customCheckTime}
                    onChange={(e) => {
                      setCustomCheckTime(e.target.value);
                      setIsCustomCheckActive(true);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Main Dashboard Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Starting Soon Alerts */}
          {isLiveSession && upcomingAlerts.length > 0 && (
            <div className="space-y-2">
              {upcomingAlerts.map(({ slot: uSlot, diffMin }) => {
                const student = students.find((st) => st.id === uSlot.studentId);
                const effTeacherId = getEffectiveTeacherId(uSlot);
                const teacher = teachers.find((t) => t.id === effTeacherId);
                const isSub = effTeacherId !== uSlot.teacherId;
                const mins = Math.ceil(diffMin);
                const urgent = diffMin <= 5;

                return (
                  <div
                    key={uSlot.id}
                    className={`p-4 rounded-xl border flex justify-between items-center flex-wrap gap-2 ${
                      urgent
                        ? 'border-[var(--warn)] bg-[var(--warn-soft)] text-red-900'
                        : 'border-[var(--science)] bg-[var(--science-soft)] text-amber-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className={urgent ? 'text-[var(--warn)]' : 'text-[var(--science)]'} />
                      <div>
                        <strong className="font-semibold">{student?.name || 'Removed Student'}</strong> &middot;{' '}
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${getSubjectClass(uSlot.subject)}`}>
                          {uSlot.subject}
                        </span>{' '}
                        with {teacher?.name || 'Teacher'}{' '}
                        {isSub && <span className="text-[10px] bg-[var(--science-soft)] text-[var(--science)] px-1 rounded font-bold font-mono">SUB</span>}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-xs">
                      Starting in {mins} min{mins === 1 ? '' : 's'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Classes In Progress & Coming Up Next Section */}
          {isLiveSession && (
            <div className="space-y-6">
              
              {/* Classes currently in Progress */}
              <div className="space-y-3 border-2 border-emerald-200 bg-emerald-50/10 p-4 rounded-xl shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Classes in Progress
                  </h4>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full font-mono">
                    {inProgressClasses.length} class{inProgressClasses.length === 1 ? '' : 'es'}
                  </span>
                </div>

                {inProgressClasses.length === 0 ? (
                  <div className="text-center py-8 bg-white border border-dashed border-emerald-200 rounded-lg text-slate-400 text-xs font-semibold">
                    No classes currently in progress.
                  </div>
                ) : (
                  <div className="flex gap-4 overflow-x-auto pb-2.5 scrollbar-thin scrollbar-thumb-emerald-100 scrollbar-track-transparent">
                    {inProgressClasses.map(({ slot: cSlot, diffMin }) => {
                      const student = students.find((st) => st.id === cSlot.studentId);
                      const effTeacherId = getEffectiveTeacherId(cSlot);
                      const teacher = teachers.find((t) => t.id === effTeacherId);
                      const isSub = effTeacherId !== cSlot.teacherId;
                      const elapsedMin = Math.abs(Math.floor(diffMin));
                      const remainingMin = cSlot.duration - elapsedMin;

                      return (
                        <div
                          key={cSlot.id}
                          className="min-w-[260px] max-w-[280px] bg-white border-2 border-emerald-100 p-3.5 rounded-lg flex flex-col justify-between shadow-xs hover:border-emerald-400 hover:shadow-sm transition-all shrink-0"
                        >
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-mono font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded flex items-center gap-1">
                                <Clock size={10} className="text-emerald-600 animate-pulse" />
                                {formatTimeToAMPM(cSlot.time)}
                              </span>
                              <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                {remainingMin}m left
                              </span>
                            </div>

                            <div>
                              <div className="font-bold text-slate-900 text-sm tracking-tight">{student?.name || 'Removed Student'}</div>
                              <div className="text-[11px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1">
                                Teacher: <span className="text-slate-700">{teacher?.name || 'Removed'}</span>
                                {isSub && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold font-mono">SUB</span>
                                )}
                              </div>
                            </div>

                            {/* Simple Progress Bar */}
                            <div className="space-y-1">
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" 
                                  style={{ width: `${Math.min(100, Math.max(0, (elapsedMin / cSlot.duration) * 100))}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[9px] text-slate-400 font-bold font-mono">
                                <span>{elapsedMin}m elapsed</span>
                                <span>{cSlot.duration}m total</span>
                              </div>
                            </div>

                            <div className="pt-1">
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${getSubjectClass(cSlot.subject)}`}>
                                {cSlot.subject}
                              </span>
                            </div>
                          </div>

                          {student && (student.zoom || student.teamsId || student.googleMeet) && (
                            <div className="border-t border-dashed border-slate-100 pt-2.5 mt-3 flex items-center gap-1.5 flex-wrap">
                              {student.zoom && (
                                <a
                                  href={student.zoom.startsWith('http') ? student.zoom : `https://zoom.us/j/${student.zoom}`}
                                  target="_blank"
                                  rel="noreferrer referrer"
                                  className="text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1 font-mono shrink-0 select-all"
                                  title={`Open Zoom: ${student.zoom}`}
                                >
                                  <Video size={10} /> Zoom: {student.zoom}
                                </a>
                              )}
                              {student.teamsId && (
                                <span
                                  className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1 font-mono shrink-0 select-all"
                                  title={`Teams: ${student.teamsId}`}
                                >
                                  <Video size={10} /> Teams: {student.teamsId}
                                </span>
                              )}
                              {student.googleMeet && (
                                <a
                                  href={student.googleMeet.startsWith('http') ? student.googleMeet : `https://meet.google.com/${student.googleMeet}`}
                                  target="_blank"
                                  rel="noreferrer referrer"
                                  className="text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1 font-mono shrink-0 select-all"
                                  title={`Open Meet: ${student.googleMeet}`}
                                >
                                  <Video size={10} /> Meet: {student.googleMeet}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Scrollable Coming Classes inside next 30 minutes */}
              <div className="space-y-3 border-2 border-slate-200 bg-slate-50/50 p-4 rounded-xl shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={12} className="text-blue-500" /> Coming up next (30m)
                  </h4>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full font-mono">
                    {comingClasses30.length} class{comingClasses30.length === 1 ? '' : 'es'}
                  </span>
                </div>

                {comingClasses30.length === 0 ? (
                  <div className="text-center py-8 bg-white border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs font-semibold">
                    No classes starting in the next 30 minutes.
                  </div>
                ) : (
                  <div className="flex gap-4 overflow-x-auto pb-2.5 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    {comingClasses30.map(({ slot: cSlot, diffMin }) => {
                      const student = students.find((st) => st.id === cSlot.studentId);
                      const effTeacherId = getEffectiveTeacherId(cSlot);
                      const teacher = teachers.find((t) => t.id === effTeacherId);
                      const isSub = effTeacherId !== cSlot.teacherId;
                      const mins = Math.ceil(diffMin);

                      return (
                        <div
                          key={cSlot.id}
                          className="min-w-[260px] max-w-[280px] bg-white border-2 border-slate-200 p-3.5 rounded-lg flex flex-col justify-between shadow-xs hover:border-blue-400 hover:shadow-sm transition-all shrink-0"
                        >
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded flex items-center gap-1">
                                <Clock size={10} className="text-slate-500" />
                                {formatTimeToAMPM(cSlot.time)}
                              </span>
                              <span className="text-[11px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                                In {mins} min{mins === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div>
                              <div className="font-bold text-slate-900 text-sm tracking-tight">{student?.name || 'Removed Student'}</div>
                              <div className="text-[11px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1">
                                Teacher: <span className="text-slate-700">{teacher?.name || 'Removed'}</span>
                                {isSub && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold font-mono">SUB</span>
                                )}
                              </div>
                            </div>

                            <div className="pt-1">
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${getSubjectClass(cSlot.subject)}`}>
                                {cSlot.subject}
                              </span>
                            </div>
                          </div>

                          {student && (student.zoom || student.teamsId || student.googleMeet) && (
                            <div className="border-t border-dashed border-slate-100 pt-2.5 mt-3 flex items-center gap-1.5 flex-wrap">
                              {student.zoom && (
                                <a
                                  href={student.zoom.startsWith('http') ? student.zoom : `https://zoom.us/j/${student.zoom}`}
                                  target="_blank"
                                  rel="noreferrer referrer"
                                  className="text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1 font-mono shrink-0 select-all"
                                  title={`Open Zoom: ${student.zoom}`}
                                >
                                  <Video size={10} /> Zoom: {student.zoom}
                                </a>
                              )}
                              {student.teamsId && (
                                <span
                                  className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1 font-mono shrink-0 select-all"
                                  title={`Teams: ${student.teamsId}`}
                                >
                                  <Video size={10} /> Teams: {student.teamsId}
                                </span>
                              )}
                              {student.googleMeet && (
                                <a
                                  href={student.googleMeet.startsWith('http') ? student.googleMeet : `https://meet.google.com/${student.googleMeet}`}
                                  target="_blank"
                                  rel="noreferrer referrer"
                                  className="text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1 font-mono shrink-0 select-all"
                                  title={`Open Meet: ${student.googleMeet}`}
                                >
                                  <Video size={10} /> Meet: {student.googleMeet}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-all duration-300 border-l-4 border-l-[var(--accent)] flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                  Classes Scheduled
                </div>
                <div className="serif-title font-bold text-3xl text-[var(--ink)] mt-1">{scheduledCount}</div>
              </div>
              <div className="mt-3 text-[11px] text-slate-500 font-medium">
                Active classes on today's roster
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-all duration-300 border-l-4 border-l-[var(--quran)] flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                  Classes Taken / Completed
                </div>
                <div className="serif-title font-bold text-3xl text-[var(--quran)] mt-1">{takenCount}</div>
              </div>
              <div className="mt-3 text-[11px] text-slate-500 font-medium flex gap-3 items-center flex-wrap">
                <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                  Completed: {takenCount}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                  Pending Log: {pendingCount}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Roster Metrics:</span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
              Absent &middot; {absentCount}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
              On Leave &middot; {leaveCount}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              Total Slots &middot; {scheduledCount}
            </span>
          </div>

          {/* Classes Table */}
          <div className="space-y-3">
            <h3 className="serif-title font-bold text-base text-[var(--ink)]">Today's Class Schedule</h3>
            
            {filteredTodaySlots.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400">
                No classes scheduled for this selection today.
              </div>
            ) : (
              <div className="overflow-x-auto border-2 border-[var(--line-strong)] rounded-xl bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Meeting Option</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Teacher</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {filteredTodaySlots.map((s) => {
                      const student = students.find((st) => st.id === s.studentId);
                      const entry = monthLogs[s.id]?.[selectedDateStr];
                      const effTeacherId = getEffectiveTeacherId(s);
                      const isSub = effTeacherId !== s.teacherId;

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-700">
                            {formatTimeToAMPM(s.time)} <span className="text-slate-400 font-normal">&middot; {s.duration}m</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-slate-900">
                            {student?.name || 'Removed Student'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${getSubjectClass(s.subject)}`}>
                              {s.subject}
                            </span>
                          </td>
                          
                          {/* Meeting option: ZOOM, TEAMS or GOOGLE MEET */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {student && (student.teamsId || student.zoom || student.googleMeet) ? (
                              <div className="flex gap-2 items-center">
                                {student.teamsId && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 select-all font-mono"
                                    title={`Microsoft Teams ID: ${student.teamsId}`}
                                  >
                                    <Video size={10} /> Teams: {student.teamsId}
                                  </span>
                                )}
                                {student.zoom && (
                                  <a
                                    href={student.zoom.startsWith('http') ? student.zoom : `https://zoom.us/j/${student.zoom}`}
                                    target="_blank"
                                    rel="noreferrer referrer"
                                    className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-100 font-semibold font-mono select-all"
                                    title={`Open Zoom link or ID: ${student.zoom}`}
                                  >
                                    <Video size={10} /> Zoom: {student.zoom}
                                  </a>
                                )}
                                {student.googleMeet && (
                                  <a
                                    href={student.googleMeet.startsWith('http') ? student.googleMeet : `https://meet.google.com/${student.googleMeet}`}
                                    target="_blank"
                                    rel="noreferrer referrer"
                                    className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-100 font-semibold font-mono select-all"
                                    title={`Open Google Meet: ${student.googleMeet}`}
                                  >
                                    <Video size={10} /> Meet: {student.googleMeet}
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">None set</span>
                            )}
                          </td>

                          {/* Substitute / Scheduled Teacher Selector */}
                          <td className="px-4 py-3 whitespace-nowrap text-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isUnlocked ? (
                                <select
                                  className="text-xs px-2 py-0.5 border border-slate-300 bg-white rounded focus:outline-none focus:border-[var(--accent)]"
                                  value={isSub ? effTeacherId : ''}
                                  onChange={(e) => handleSubstituteChange(s.id, e.target.value)}
                                >
                                  <option value="">
                                    Scheduled: {teachers.find((t) => t.id === s.teacherId)?.name || 'Removed Teacher'}
                                  </option>
                                  {teachers
                                    .filter((t) => t.id !== s.teacherId)
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map((t) => (
                                      <option key={t.id} value={t.id}>
                                        Sub: {t.name}
                                      </option>
                                    ))}
                                </select>
                              ) : (
                                <button
                                  onClick={onRequireUnlock}
                                  className="text-xs px-2 py-0.5 border border-slate-200 bg-slate-50 rounded text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors flex items-center gap-1 cursor-pointer font-semibold"
                                  title="Unlock Admin to Substitute Teacher"
                                >
                                  <Lock size={10} className="text-slate-400" />
                                  <span>
                                    {isSub 
                                      ? `Sub: ${teachers.find((t) => t.id === effTeacherId)?.name || 'Removed'}` 
                                      : `Scheduled: ${teachers.find((t) => t.id === s.teacherId)?.name || 'Removed Teacher'}`
                                    }
                                  </span>
                                </button>
                              )}
                              {isSub && (
                                <span className="text-[9px] bg-[var(--science-soft)] text-[var(--science)] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
                                  Cover
                                </span>
                              )}
                            </div>
                          </td>
                          
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getStatusLabel(entry?.status || '')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      );
    }
