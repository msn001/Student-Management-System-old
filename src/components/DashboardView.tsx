import React, { useState, useEffect } from 'react';
import { ClassSlot, Student, Teacher, LessonEntry } from '../types';
import { StorageService } from '../lib/storage';
import { Bell, Calendar, ClipboardList, AlertCircle, Video, Clock } from 'lucide-react';
import { formatTimeToAMPM } from '../lib/utils';

interface DashboardViewProps {
  slots: ClassSlot[];
  students: Student[];
  teachers: Teacher[];
  logsByMonth: Record<string, Record<string, Record<string, LessonEntry>>>;
  subsByMonth: Record<string, Record<string, Record<string, string>>>;
  onUpdateSubs: (mKey: string, subs: Record<string, Record<string, string>>) => void;
  dashDate: string;
  onUpdateDashDate: (date: string) => void;
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
}: DashboardViewProps) {
  const [selectedDateStr, setSelectedDateStr] = useState(dashDate);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

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
    
    // Find classes starting in next 10 minutes
    const todaySlots = slots.filter((s) => s.day === selectedDateObj.getDay());
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
  }, [currentTime, notifyEnabled, isLiveSession, slots, selectedDateObj, selectedDateStr, students]);

  // Today's classes
  const todaySlots = slots.filter((s) => s.day === selectedDateObj.getDay());

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

      {/* Scrollable Coming Classes inside next 30 minutes */}
      {isLiveSession && (
        <div className="space-y-3 border-2 border-slate-200 bg-slate-50/50 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Clock size={12} className="text-blue-500" /> Coming up in the next 30 minutes
            </h4>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full font-mono">
              {comingClasses30.length} class{comingClasses30.length === 1 ? '' : 'es'}
            </span>
          </div>

          {comingClasses30.length === 0 ? (
            <div className="text-center py-4 bg-white border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs font-semibold">
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
      )}

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#FBFCFD] p-5 rounded-xl border border-[var(--line)] shadow-sm">
          <div className="serif-title font-bold text-3xl text-[var(--ink)]">{scheduledCount}</div>
          <div className="text-xs text-[var(--ink-soft)] font-bold uppercase tracking-wider mt-1">
            Classes Scheduled
          </div>
        </div>
        <div className="bg-[#FBFCFD] p-5 rounded-xl border border-[var(--line)] shadow-sm">
          <div className="serif-title font-bold text-3xl text-[var(--quran)]">{takenCount}</div>
          <div className="text-xs text-[var(--ink-soft)] font-bold uppercase tracking-wider mt-1">
            Classes Taken / Completed
          </div>
        </div>
      </div>

      <div className="text-xs text-[var(--ink-soft)] font-semibold flex gap-3 flex-wrap">
        <span>Absent: {absentCount}</span> &middot;
        <span>On Leave: {leaveCount}</span> &middot;
        <span>Pending log: {pendingCount}</span>
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
