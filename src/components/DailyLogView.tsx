import React, { useState, useEffect, useRef } from 'react';
import { ClassSlot, Student, Teacher, LessonEntry } from '../types';
import { StorageService } from '../lib/storage';
import { 
  Check, 
  Info, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  BookOpen, 
  Clock, 
  Calendar, 
  User, 
  Save, 
  AlertCircle, 
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';
import { formatTimeToAMPM, getSlotsForDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

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

const getSubjectDotColor = (sub: string) => {
  switch (sub) {
    case 'Math':
      return '#3b82f6'; // Blue
    case 'Science':
      return '#10b981'; // Green
    case 'English':
      return '#8b5cf6'; // Purple
    case 'Quran / Islamic Studies':
      return '#14b8a6'; // Teal
    default:
      return '#6b7280'; // Gray
  }
};

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
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [dir, setDir] = useState<number>(0); // 1 for forward, -1 for backward
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  // Automatically clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  // Reset active index when date or filter changes
  useEffect(() => {
    setActiveCardIndex(0);
    setDir(0);
  }, [activeDate, filterTeacher]);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in a text field
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        if (activeCardIndex > 0) {
          setDir(-1);
          setActiveCardIndex((prev) => prev - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (activeCardIndex < daySlots.length - 1) {
          setDir(1);
          setActiveCardIndex((prev) => prev + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeCardIndex, daySlots.length]);

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
      showToast('Please select attendance status (Present, Absent, or On Leave) before saving.', 'error');
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
    
    const student = students.find((st) => st.id === slot.studentId);
    showToast(`Lesson entry for ${student?.name || 'student'} saved successfully!`, 'success');
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

  // Calculate stats for the progress bar
  const completedCount = daySlots.reduce((acc, s) => {
    const hasLog = monthLogs[s.id]?.[activeDate]?.status;
    return hasLog ? acc + 1 : acc;
  }, 0);
  const completionPercentage = daySlots.length > 0 ? Math.round((completedCount / daySlots.length) * 100) : 0;

  // Next and previous index transitions
  const handlePrev = () => {
    if (activeCardIndex > 0) {
      setDir(-1);
      setActiveCardIndex(activeCardIndex - 1);
    }
  };

  const handleNext = () => {
    if (activeCardIndex < daySlots.length - 1) {
      setDir(1);
      setActiveCardIndex(activeCardIndex + 1);
    }
  };

  // Variants for direction-aware slide animations
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 120 : direction < 0 ? -120 : 0,
      opacity: 0,
      scale: 0.98,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -120 : direction < 0 ? 120 : 0,
      opacity: 0,
      scale: 0.98,
    }),
  };

  return (
    <div className="relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%', scale: 0.95 }}
            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: -20, x: '-50%', scale: 0.95 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4.5 py-3 rounded-xl shadow-lg border text-xs font-bold tracking-tight ${
              toast.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-100/40'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100/40'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle size={15} className="text-rose-600 stroke-[2.5]" />
            ) : (
              <Check size={15} className="text-emerald-600 stroke-[2.5]" />
            )}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Date & Teacher Selector */}
      <div className="flex flex-wrap gap-4 mb-6 items-center bg-slate-50 p-4 rounded-xl border border-[var(--line)] shadow-2xs">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
            <Calendar size={13} className="text-slate-400" />
            Log Date
          </label>
          <input
            type="date"
            className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded-lg focus:outline-none focus:border-[var(--accent)] text-sm font-semibold"
            value={activeDate}
            onChange={(e) => {
              setActiveDate(e.target.value);
              onUpdateLogDate(e.target.value);
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
            <User size={13} className="text-slate-400" />
            Filter by Regular Teacher
          </label>
          <select
            className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded-lg focus:outline-none focus:border-[var(--accent)] text-sm font-semibold"
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

      {daySlots.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400 bg-slate-50/50">
          <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <p className="text-sm font-medium">No classes scheduled on <strong>{DAY_NAMES[dateObj.getDay()]}</strong></p>
          <p className="text-xs text-slate-400 mt-1">{filterTeacher ? 'Try selecting "All teachers" or changing the date.' : 'Please add classes or change the date.'}</p>
        </div>
      ) : (
        <>
          {/* Progress Completion Indicator */}
          <div className="mb-6 bg-slate-50/70 p-4 rounded-xl border border-slate-200/60 shadow-2xs">
            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet size={14} className="text-slate-400" />
                Lesson Log Completion
              </span>
              <span className="text-xs font-bold text-slate-700 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                {completedCount} of {daySlots.length} Classes Completed ({completionPercentage}%)
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/20">
              <div 
                className="bg-emerald-500 h-full transition-all duration-500 rounded-full" 
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          {/* Horizontal Quick-Jump Deck / Student Timeline */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-[var(--accent)]" /> 
                Today's Student Deck
              </h3>
              <span className="hidden md:flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full">
                <HelpCircle size={11} />
                Arrow keys &larr; &rarr; to slide
              </span>
            </div>
            
            <div className="flex gap-2.5 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              {daySlots.map((s, idx) => {
                const student = students.find((st) => st.id === s.studentId);
                const name = student?.name || 'Removed Student';
                const firstName = name.split(' ')[0];
                
                const entry: any = monthLogs[s.id]?.[activeDate] || {};
                const status = entry.status; // 'present' | 'absent' | 'leave' | ''
                
                const isActive = idx === activeCardIndex;
                
                let statusBadgeClass = 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50';
                let statusDotColor = 'bg-slate-300';
                
                if (status === 'present') {
                  statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100/50';
                  statusDotColor = 'bg-emerald-500';
                } else if (status === 'absent') {
                  statusBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200/50 hover:bg-rose-100/50';
                  statusDotColor = 'bg-rose-500';
                } else if (status === 'leave') {
                  statusBadgeClass = 'bg-sky-50 text-sky-700 border-sky-200/50 hover:bg-sky-100/50';
                  statusDotColor = 'bg-sky-500';
                }
                
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setDir(idx > activeCardIndex ? 1 : -1);
                      setActiveCardIndex(idx);
                    }}
                    className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl border text-xs font-medium transition-all duration-200 shadow-3xs cursor-pointer ${
                      isActive 
                        ? 'border-[var(--accent)] bg-slate-950 text-white ring-3 ring-[var(--accent)]/15 scale-[1.02]' 
                        : `${statusBadgeClass} text-slate-700 border-slate-200 hover:border-slate-300`
                    }`}
                  >
                    {/* Subject / Status Indicator Dot */}
                    <span 
                      className={`w-2.5 h-2.5 rounded-full ${status ? statusDotColor : ''}`} 
                      style={!status ? { backgroundColor: getSubjectDotColor(s.subject) } : undefined} 
                    />
                    
                    <div className="text-left">
                      <div className={`font-bold ${isActive ? 'text-white' : 'text-slate-800'}`}>{firstName}</div>
                      <div className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                        {formatTimeToAMPM(s.time)}
                      </div>
                    </div>
                    
                    {/* Tiny visual badge with shortcode */}
                    {status && (
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                        status === 'present' ? 'bg-emerald-500 text-white' :
                        status === 'absent' ? 'bg-rose-500 text-white' : 'bg-sky-500 text-white'
                      }`}>
                        {status === 'present' ? 'P' : status === 'absent' ? 'A' : 'L'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Slide Deck Layout */}
          <div className="relative">
            {/* Left Chevron (Desktop-only absolute, responsive layout handles mobile spacing) */}
            <button
              onClick={handlePrev}
              disabled={activeCardIndex === 0}
              className="absolute left-[-24px] top-[40%] -translate-y-1/2 z-10 hidden lg:flex p-3 rounded-full bg-white border border-slate-200 shadow-md hover:shadow-lg hover:scale-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-slate-600 hover:text-slate-900 transition-all duration-200 cursor-pointer"
              title="Previous Student"
            >
              <ChevronLeft size={22} className="stroke-[2.5]" />
            </button>

            {/* Active Sliding Student Card Window */}
            <div className="overflow-hidden py-1 px-0.5">
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div
                  key={daySlots[activeCardIndex].id}
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  {(() => {
                    const s = daySlots[activeCardIndex];
                    const student = students.find((st) => st.id === s.studentId);
                    const entry = monthLogs[s.id]?.[activeDate] || {
                      status: '',
                      actualDuration: s.duration,
                      lessonSource: '',
                      lessonDetail: '',
                      content: '',
                      remarks: '',
                    };
                    const effTeacherId = getEffectiveTeacherId(s);
                    const isSub = effTeacherId !== s.teacherId;

                    return (
                      <LogEntryCard
                        key={`${s.id}-${activeDate}`}
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
                  })()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right Chevron (Desktop-only absolute) */}
            <button
              onClick={handleNext}
              disabled={activeCardIndex === daySlots.length - 1}
              className="absolute right-[-24px] top-[40%] -translate-y-1/2 z-10 hidden lg:flex p-3 rounded-full bg-white border border-slate-200 shadow-md hover:shadow-lg hover:scale-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-slate-600 hover:text-slate-900 transition-all duration-200 cursor-pointer"
              title="Next Student"
            >
              <ChevronRight size={22} className="stroke-[2.5]" />
            </button>

            {/* Responsive Bottom Carousel Controls bar (Flawless on Mobile + Tablet) */}
            <div className="mt-5 flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <button
                onClick={handlePrev}
                disabled={activeCardIndex === 0}
                className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-2xs cursor-pointer"
              >
                <ChevronLeft size={15} /> Prev
              </button>

              <div className="text-center">
                <span className="text-xs font-bold text-slate-600">
                  Student <span className="text-slate-950 font-extrabold">{activeCardIndex + 1}</span> of <span className="text-slate-950 font-extrabold">{daySlots.length}</span>
                </span>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                  {students.find((st) => st.id === daySlots[activeCardIndex].studentId)?.name || 'Removed Student'}
                </p>
              </div>

              <button
                onClick={handleNext}
                disabled={activeCardIndex === daySlots.length - 1}
                className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-2xs cursor-pointer"
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const PRESET_LESSON_SOURCES = [
  'Qaida',
  'Quran',
  'Islamic Studies',
  'Qaida + Islamic Studies',
  'Quran + Islamic Studies',
];

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

  const isCustomSourceInitial = (entry.lessonSource || '') !== '' && !PRESET_LESSON_SOURCES.includes(entry.lessonSource || '');
  const [showCustomInput, setShowCustomInput] = useState<boolean>(isCustomSourceInitial);
  const [customSourceInput, setCustomSourceInput] = useState<string>(isCustomSourceInitial ? (entry.lessonSource || '') : '');

  // Keep state in sync if source changes externally (e.g. from DB / props)
  useEffect(() => {
    if (source !== '' && !PRESET_LESSON_SOURCES.includes(source)) {
      setShowCustomInput(true);
      setCustomSourceInput(source);
    } else if (source === '' || PRESET_LESSON_SOURCES.includes(source)) {
      setShowCustomInput(false);
    }
  }, [source]);

  const handleSourceSelectChange = (val: string) => {
    if (val === '__CUSTOM__') {
      setShowCustomInput(true);
      setSource(customSourceInput || '');
    } else {
      setShowCustomInput(false);
      setSource(val);
    }
  };

  const handleCustomSourceInputChange = (val: string) => {
    setCustomSourceInput(val);
    setSource(val);
  };

  // Keep track of what we last saw from the database / props to avoid wiping local unsaved edits
  const dbValuesRef = useRef({
    status: entry.status || '',
    duration: entry.actualDuration !== undefined && entry.actualDuration !== null ? entry.actualDuration : slot.duration,
    source: entry.lessonSource || '',
    detail: entry.lessonDetail || '',
    content: entry.content || '',
    remarks: entry.remarks || '',
  });

  // Reset or sync local state only if database actually has newer content AND user has not modified that specific field
  useEffect(() => {
    const currentDbValues = {
      status: entry.status || '',
      duration: entry.actualDuration !== undefined && entry.actualDuration !== null ? entry.actualDuration : slot.duration,
      source: entry.lessonSource || '',
      detail: entry.lessonDetail || '',
      content: entry.content || '',
      remarks: entry.remarks || '',
    };

    const previousDbValues = dbValuesRef.current;

    // Detect actual database changes (not just re-render reference differences)
    const statusDbChanged = currentDbValues.status !== previousDbValues.status;
    const durationDbChanged = currentDbValues.duration !== previousDbValues.duration;
    const sourceDbChanged = currentDbValues.source !== previousDbValues.source;
    const detailDbChanged = currentDbValues.detail !== previousDbValues.detail;
    const contentDbChanged = currentDbValues.content !== previousDbValues.content;
    const remarksDbChanged = currentDbValues.remarks !== previousDbValues.remarks;

    // Only update local state if database value changed and the user hasn't modified it away from previous database value
    if (statusDbChanged && status === previousDbValues.status) {
      setStatus(currentDbValues.status);
    }
    if (durationDbChanged && duration === previousDbValues.duration) {
      setDuration(currentDbValues.duration);
    }
    if (sourceDbChanged && source === previousDbValues.source) {
      setSource(currentDbValues.source);
    }
    if (detailDbChanged && detail === previousDbValues.detail) {
      setDetail(currentDbValues.detail);
    }
    if (contentDbChanged && content === previousDbValues.content) {
      setContent(currentDbValues.content);
    }
    if (remarksDbChanged && remarks === previousDbValues.remarks) {
      setRemarks(currentDbValues.remarks);
    }

    dbValuesRef.current = currentDbValues;
  }, [entry, slot, status, duration, source, detail, content, remarks]);

  const getBorderColor = () => {
    if (status === 'present') return 'border-l-4 border-l-[var(--quran)]';
    if (status === 'absent') return 'border-l-4 border-l-[var(--warn)]';
    if (status === 'leave') return 'border-l-4 border-l-[var(--science)]';
    return 'border-l-4 border-l-slate-300';
  };

  const isQuranClass = slot.subject === 'Quran / Islamic Studies';

  return (
    <div className={`bg-[#FBFCFD] p-6 rounded-xl border border-[var(--line)] shadow-xs ${getBorderColor()} transition-colors duration-300`}>
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-2 border-b border-dashed border-slate-200 pb-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-lg text-[var(--ink)]">{studentName}</span>
            <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${getSubjectClass(slot.subject)}`}>
              {slot.subject}
            </span>
          </div>

          {/* Student Connection Links */}
          {(student?.zoom || student?.teamsId || student?.googleMeet) && (
            <div className="flex flex-wrap gap-2 items-center mt-2.5">
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
        <div className="text-xs text-[var(--ink-soft)] font-medium bg-slate-100/60 px-2.5 py-1 rounded-lg border border-slate-200/40">
          Scheduled: <strong className="text-slate-900">{formatTimeToAMPM(slot.time)}</strong> &middot; <span className="text-slate-900 font-bold">{slot.duration}m</span>
        </div>
      </div>

      {/* Substitute controls */}
      <div className="flex items-center gap-3 flex-wrap mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <label className="text-xs font-bold text-slate-600 uppercase">Teacher Today</label>
        <select
          className="text-xs px-2.5 py-1 border border-slate-300 bg-white rounded-lg focus:outline-none focus:border-[var(--accent)] font-semibold text-slate-700"
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
          <span className="inline-flex items-center text-[10px] bg-[var(--science-soft)] text-[var(--science)] font-bold px-2.5 py-0.5 rounded-full">
            Substitute Covering Today
          </span>
        )}
      </div>

      {/* Grid Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Attendance</label>
          <select
            className="w-full px-3 py-1.5 border border-slate-300 bg-white rounded-lg text-sm focus:outline-none focus:border-[var(--accent)] font-bold text-slate-700"
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
            className="w-full px-3 py-1.5 border border-slate-300 bg-white rounded-lg text-sm focus:outline-none focus:border-[var(--accent)] font-semibold text-slate-700"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Special Quran / Islamic Studies fields */}
      {isQuranClass && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 p-3 bg-teal-50/30 rounded-lg border border-teal-100">
          <div>
            <label className="block text-xs font-bold text-[var(--quran)] uppercase mb-1">Lesson From</label>
            <select
              className="w-full px-3 py-1.5 border border-teal-200 bg-white rounded-lg text-sm focus:outline-none focus:border-[var(--quran)] font-semibold text-slate-700"
              value={showCustomInput ? '__CUSTOM__' : source}
              onChange={(e) => handleSourceSelectChange(e.target.value)}
            >
              <option value="">— Select —</option>
              <option value="Qaida">Qaida</option>
              <option value="Quran">Quran</option>
              <option value="Islamic Studies">Islamic Studies</option>
              <option value="Qaida + Islamic Studies">Qaida + Islamic Studies</option>
              <option value="Quran + Islamic Studies">Quran + Islamic Studies</option>
              <option value="__CUSTOM__">✏️ Custom option...</option>
            </select>

            {showCustomInput && (
              <input
                type="text"
                className="w-full mt-2 px-3 py-1.5 border border-teal-300 bg-white rounded-lg text-sm focus:outline-none focus:border-[var(--quran)] font-semibold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                placeholder="e.g. Seerah, Tajweed, Duas, etc."
                value={customSourceInput}
                onChange={(e) => handleCustomSourceInputChange(e.target.value)}
                autoFocus
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--quran)] uppercase mb-1">
              Detail (Page / Surah / Topic)
            </label>
            <input
              type="text"
              className="w-full px-3 py-1.5 border border-teal-200 bg-white rounded-lg text-sm focus:outline-none focus:border-[var(--quran)] font-semibold text-slate-700"
              placeholder="e.g. Page 12-14, Surah Al-Baqarah 1-10, or Lesson 3"
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
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[var(--accent)] text-slate-700 font-medium"
            placeholder="What was worked on during the class? (e.g. Worked on fractions, page 42)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Teacher's Remarks / Homework</label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[var(--accent)] text-slate-700 font-medium"
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
          className="px-4.5 py-2.5 bg-[var(--accent)] text-white text-xs font-bold rounded-lg hover:bg-[var(--accent-dark)] cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors duration-200"
        >
          <Check size={14} className="stroke-[2.5]" /> Save entry
        </button>
        {entry.loggedBy && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-faint)] font-mono font-semibold">
            <Info size={12} /> Last saved by {entry.loggedBy}
          </span>
        )}
      </div>
    </div>
  );
}
