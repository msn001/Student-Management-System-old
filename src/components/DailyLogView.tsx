import React, { useState, useEffect } from 'react';
import { ClassSlot, Student, Teacher, LessonEntry } from '../types';
import { StorageService } from '../lib/storage';
import { Check, Info } from 'lucide-react';
import { formatTimeToAMPM, getSlotsForDate } from '../lib/utils';

interface DailyLogViewProps {
  slots: ClassSlot[];
  students: Student[];
  teachers: Teacher[];
  logDate: string;
  onUpdateLogDate: (date: string) => void;
  logsByMonth: Record<string, Record<string, Record<string, LessonEntry>>>;
  subsByMonth: Record<string, Record<string, Record<string, string>>>;
  onUpdateLogs: (mKey: string, logs: Record<string, Record<string, LessonEntry>>) => void;
  onUpdateSubs: (mKey: string, subs: Record<string, Record<string, string>>) => void;
  dailyAdjustments: Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function DailyLogView({
  slots,
  students,
  teachers,
  logDate,
  onUpdateLogDate,
  logsByMonth,
  subsByMonth,
  onUpdateLogs,
  onUpdateSubs,
  dailyAdjustments,
}: DailyLogViewProps) {
  const [filterTeacher, setFilterTeacher] = useState('');
  const [activeDate, setActiveDate] = useState(logDate);

  // Buffer date string to update when parent date changes
  useEffect(() => {
    setActiveDate(logDate);
  }, [logDate]);

  const parseDate = (s: string) => {
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };

  const getMonthKey = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[0]}-${parts[1]}`;
  };

  const dateObj = parseDate(activeDate);
  const mKey = getMonthKey(activeDate);

  const monthLogs = logsByMonth[mKey] || {};
  const monthSubs = subsByMonth[mKey] || {};

  // Filter slots using dynamic resolution helper (makeup classes + overrides)
  const daySlots = getSlotsForDate(activeDate, slots, dailyAdjustments)
    .filter((s) => {
      if (filterTeacher && s.teacherId !== filterTeacher) return false;
      return true;
    });

  const getEffectiveTeacherId = (slot: ClassSlot) => {
    const subsForSlot = monthSubs[slot.id];
    if (subsForSlot && subsForSlot[activeDate]) {
      return subsForSlot[activeDate];
    }
    return slot.teacherId;
  };

  const handleSubstituteChange = async (slotId: string, value: string) => {
    const updatedSubs = { ...monthSubs };
    if (!updatedSubs[slotId]) {
      updatedSubs[slotId] = {};
    }

    if (!value) {
      delete updatedSubs[slotId][activeDate];
      if (Object.keys(updatedSubs[slotId]).length === 0) {
        delete updatedSubs[slotId];
      }
    } else {
      updatedSubs[slotId][activeDate] = value;
    }

    onUpdateSubs(mKey, updatedSubs);
    await StorageService.saveMonthSubs(mKey, updatedSubs);
  };

  const handleSaveEntry = async (
    slotId: string,
    status: 'present' | 'absent' | 'leave' | '',
    actualDuration: number,
    lessonSource: string,
    lessonDetail: string,
    content: string,
    remarks: string
  ) => {
    if (!status) {
      alert('Please select attendance status (Present, Absent, or On Leave) before saving.');
      return;
    }

    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;

    const effTeacherId = getEffectiveTeacherId(slot);
    const teacher = teachers.find((t) => t.id === effTeacherId);

    const updatedLogs = { ...monthLogs };
    if (!updatedLogs[slotId]) {
      updatedLogs[slotId] = {};
    }

    updatedLogs[slotId][activeDate] = {
      status,
      actualDuration,
      lessonSource,
      lessonDetail,
      content: content.trim(),
      remarks: remarks.trim(),
      loggedBy: teacher ? teacher.name : 'Unknown Teacher',
      loggedAt: new Date().toISOString(),
    };

    onUpdateLogs(mKey, updatedLogs);
    await StorageService.saveMonthLogs(mKey, updatedLogs);
    alert('Lesson entry saved successfully!');
  };

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

  return (
    <div>
      {/* Date & Teacher Selector */}
      <div className="flex flex-wrap gap-4 mb-6 items-center bg-slate-50 p-4 rounded-xl border border-[var(--line)]">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Log Date</label>
          <input
            type="date"
            className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)] text-sm"
            value={activeDate}
            onChange={(e) => {
              setActiveDate(e.target.value);
              onUpdateLogDate(e.target.value);
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Filter by Regular Teacher</label>
          <select
            className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)] text-sm"
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
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
      </div>

      {/* Cards List */}
      <div className="space-y-6">
        {daySlots.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400">
            No classes scheduled on <strong>{DAY_NAMES[dateObj.getDay()]}</strong>
            {filterTeacher ? ' for this teacher.' : '.'}
          </div>
        ) : (
          daySlots.map((s) => {
            const student = students.find((st) => st.id === s.studentId);
            const entry = (monthLogs[s.id] && monthLogs[s.id][activeDate]) || {
              status: '',
              actualDuration: s.duration,
              lessonSource: '',
              lessonDetail: '',
              content: '',
              remarks: '',
            };

            const effTeacherId = getEffectiveTeacherId(s);
            const isSub = effTeacherId !== s.teacherId;

            // Log state helpers
            return (
              <LogEntryCard
                key={s.id}
                slot={s}
                studentName={student?.name || 'Removed Student'}
                student={student}
                entry={entry}
                teachers={teachers}
                effTeacherId={effTeacherId}
                isSub={isSub}
                getSubjectClass={getSubjectClass}
                onSubstituteChange={handleSubstituteChange}
                onSave={handleSaveEntry}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// Separate helper component for each Daily Log card to keep internal UI state local
function LogEntryCard({
  slot,
  studentName,
  student,
  entry,
  teachers,
  effTeacherId,
  isSub,
  getSubjectClass,
  onSubstituteChange,
  onSave,
}: {
  key?: string;
  slot: ClassSlot;
  studentName: string;
  student?: Student;
  entry: any;
  teachers: Teacher[];
  effTeacherId: string;
  isSub: boolean;
  getSubjectClass: (sub: string) => string;
  onSubstituteChange: (slotId: string, value: string) => void;
  onSave: (
    slotId: string,
    status: 'present' | 'absent' | 'leave' | '',
    actualDuration: number,
    lessonSource: string,
    lessonDetail: string,
    content: string,
    remarks: string
  ) => void;
}) {
  const [status, setStatus] = useState<'present' | 'absent' | 'leave' | ''>(entry.status || '');
  const [duration, setDuration] = useState<number>(
    entry.actualDuration !== undefined && entry.actualDuration !== null ? entry.actualDuration : slot.duration
  );
  const [source, setSource] = useState<string>(entry.lessonSource || '');
  const [detail, setDetail] = useState<string>(entry.lessonDetail || '');
  const [content, setContent] = useState<string>(entry.content || '');
  const [remarks, setRemarks] = useState<string>(entry.remarks || '');

  // Reset local state if entry or slot changes
  useEffect(() => {
    setStatus(entry.status || '');
    setDuration(
      entry.actualDuration !== undefined && entry.actualDuration !== null ? entry.actualDuration : slot.duration
    );
    setSource(entry.lessonSource || '');
    setDetail(entry.lessonDetail || '');
    setContent(entry.content || '');
    setRemarks(entry.remarks || '');
  }, [entry, slot]);

  const getBorderColor = () => {
    if (status === 'present') return 'border-l-4 border-l-[var(--quran)]';
    if (status === 'absent') return 'border-l-4 border-l-[var(--warn)]';
    if (status === 'leave') return 'border-l-4 border-l-[var(--science)]';
    return 'border-l-4 border-l-slate-300';
  };

  const isQuranClass = slot.subject === 'Quran / Islamic Studies';

  return (
    <div className={`bg-[#FBFCFD] p-6 rounded-xl border border-[var(--line)] shadow-sm ${getBorderColor()}`}>
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-2 border-b border-dashed border-slate-200 pb-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-base text-[var(--ink)]">{studentName}</span>
            <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${getSubjectClass(slot.subject)}`}>
              {slot.subject}
            </span>
          </div>

          {/* Student Connection Links */}
          {(student?.zoom || student?.teamsId || student?.googleMeet) && (
            <div className="flex flex-wrap gap-2 items-center mt-2">
              {student.teamsId && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  <span className="text-[9px] font-bold uppercase opacity-75">Teams:</span>
                  <span>{student.teamsId}</span>
                </span>
              )}
              {student.zoom && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                  <span className="text-[9px] font-bold uppercase opacity-75">Zoom:</span>
                  {student.zoom.startsWith('http') ? (
                    <a href={student.zoom} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">Open Link</a>
                  ) : (
                    <span>{student.zoom}</span>
                  )}
                </span>
              )}
              {student.googleMeet && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-100">
                  <span className="text-[9px] font-bold uppercase opacity-75">Meet:</span>
                  {student.googleMeet.startsWith('http') ? (
                    <a href={student.googleMeet} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">Open Link</a>
                  ) : (
                    <span>{student.googleMeet}</span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-xs text-[var(--ink-soft)] font-medium">
          Scheduled: <strong>{formatTimeToAMPM(slot.time)}</strong> &middot; {slot.duration} min
        </div>
      </div>

      {/* Substitute controls */}
      <div className="flex items-center gap-3 flex-wrap mb-4 bg-slate-50 p-2.5 rounded border border-slate-200">
        <label className="text-xs font-bold text-slate-600 uppercase">Teacher Today</label>
        <select
          className="text-xs px-2 py-1 border border-slate-300 bg-white rounded focus:outline-none focus:border-[var(--accent)]"
          value={isSub ? effTeacherId : ''}
          onChange={(e) => onSubstituteChange(slot.id, e.target.value)}
        >
          <option value="">
            Scheduled — {teachers.find((t) => t.id === slot.teacherId)?.name || 'Removed Teacher'}
          </option>
          {teachers
            .filter((t) => t.id !== slot.teacherId)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => (
              <option key={t.id} value={t.id}>
                Substitute: {t.name}
              </option>
            ))}
        </select>
        {isSub && (
          <span className="inline-flex items-center text-[10px] bg-[var(--science-soft)] text-[var(--science)] font-semibold px-2 py-0.5 rounded-full">
            Substitute Covering Today
          </span>
        )}
      </div>

      {/* Grid Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Attendance</label>
          <select
            className="w-full px-3 py-1.5 border border-slate-300 bg-white rounded text-sm focus:outline-none focus:border-[var(--accent)] font-medium"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="">— Select —</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="leave">On Leave</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Actual Duration (minutes)</label>
          <input
            type="number"
            min="0"
            step="5"
            className="w-full px-3 py-1.5 border border-slate-300 bg-white rounded text-sm focus:outline-none focus:border-[var(--accent)]"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Special Quran fields */}
      {isQuranClass && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 p-3 bg-teal-50/30 rounded border border-teal-100">
          <div>
            <label className="block text-xs font-bold text-[var(--quran)] uppercase mb-1">Lesson From</label>
            <select
              className="w-full px-3 py-1.5 border border-teal-200 bg-white rounded text-sm focus:outline-none focus:border-[var(--quran)]"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">— Select —</option>
              <option value="Qaida">Qaida</option>
              <option value="Quran">Quran</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--quran)] uppercase mb-1">
              Detail (Page or Surah/Ayat)
            </label>
            <input
              type="text"
              className="w-full px-3 py-1.5 border border-teal-200 bg-white rounded text-sm focus:outline-none focus:border-[var(--quran)]"
              placeholder="e.g. Page 12-14 or Surah Al-Baqarah 1-10"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Free Text Areas */}
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lesson Taught / Notes</label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-[var(--accent)]"
            placeholder="What was worked on during the class? (e.g. Worked on fractions, page 42)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Teacher's Remarks / Homework</label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-[var(--accent)]"
            placeholder="Specific remarks, struggles, or homework assigned for next time…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onSave(slot.id, status, duration, source, detail, content, remarks)}
          className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded hover:bg-[var(--accent-dark)] cursor-pointer flex items-center gap-1 shadow-sm"
        >
          <Check size={14} /> Save entry
        </button>
        {entry.loggedBy && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-faint)] font-mono">
            <Info size={12} /> Last saved by {entry.loggedBy}
          </span>
        )}
      </div>
    </div>
  );
}
