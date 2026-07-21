import React, { useState } from 'react';
import { ClassSlot, Student, Teacher } from '../types';
import { StorageService } from '../lib/storage';
import { Plus, Trash2, Edit2, X, Check, AlertTriangle, CalendarClock, RotateCcw, User, Clock, ChevronRight, Video } from 'lucide-react';
import { formatTimeToAMPM } from '../lib/utils';

interface AdjustmentsViewProps {
  slots: ClassSlot[];
  students: Student[];
  teachers: Teacher[];
  onUpdateSlots: (slots: ClassSlot[]) => void;
  dailyAdjustments: Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>;
  onUpdateAdjustments: (adjustments: Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>) => void;
  defaultDate: string;
}

const SUBJECT_OPTIONS = ['Quran / Islamic Studies', 'Math', 'Science', 'English', 'Other'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AdjustmentsView({
  slots,
  students,
  teachers,
  onUpdateSlots,
  dailyAdjustments,
  onUpdateAdjustments,
  defaultDate,
}: AdjustmentsViewProps) {
  const [selectedDateStr, setSelectedDateStr] = useState(defaultDate);
  
  // States for scheduling a new makeup class
  const [mkStudentId, setMkStudentId] = useState('');
  const [mkTeacherId, setMkTeacherId] = useState('');
  const [mkSubject, setMkSubject] = useState(SUBJECT_OPTIONS[0]);
  const [mkTime, setMkTime] = useState('16:00');
  const [mkDuration, setMkDuration] = useState(30);

  // States for adjusting an existing weekly slot for today
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [adjTime, setAdjTime] = useState('');
  const [adjDuration, setAdjDuration] = useState(30);
  const [adjTeacherId, setAdjTeacherId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const parseDate = (s: string) => {
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };

  const selectedDateObj = parseDate(selectedDateStr);
  const selectedDayOfWeek = selectedDateObj.getDay();

  // Get current adjustment overrides for this date
  const dayAdjustments = dailyAdjustments[selectedDateStr] || {};

  // Find regular weekly slots scheduled for this day of week (regular means s.date is undefined)
  const regularWeeklySlots = slots.filter((s) => !s.date && s.day === selectedDayOfWeek);

  // Find one-off makeup classes scheduled specifically for this date
  const oneOffMakeupClasses = slots.filter((s) => s.date === selectedDateStr);

  // Filter lists based on searchQuery
  const filteredWeeklySlots = regularWeeklySlots.filter((s) => {
    if (!searchQuery) return true;
    const student = students.find((st) => st.id === s.studentId);
    const originalTeacher = teachers.find((t) => t.id === s.teacherId);
    const currentAdj = dayAdjustments[s.id];
    const displayTeacherId = currentAdj?.teacherId || s.teacherId;
    const displayTeacher = teachers.find((t) => t.id === displayTeacherId);
    
    const query = searchQuery.toLowerCase();
    const studentName = (student?.name || '').toLowerCase();
    const teamsId = (student?.teamsId || '').toLowerCase();
    const zoom = (student?.zoom || '').toLowerCase();
    const googleMeet = (student?.googleMeet || '').toLowerCase();
    const teacherName = (originalTeacher?.name || '').toLowerCase();
    const displayTeacherName = (displayTeacher?.name || '').toLowerCase();
    const subject = s.subject.toLowerCase();
    
    return (
      studentName.includes(query) ||
      teamsId.includes(query) ||
      zoom.includes(query) ||
      googleMeet.includes(query) ||
      teacherName.includes(query) ||
      displayTeacherName.includes(query) ||
      subject.includes(query)
    );
  });

  const filteredMakeupClasses = oneOffMakeupClasses.filter((s) => {
    if (!searchQuery) return true;
    const student = students.find((st) => st.id === s.studentId);
    const teacher = teachers.find((t) => t.id === s.teacherId);
    
    const query = searchQuery.toLowerCase();
    const studentName = (student?.name || '').toLowerCase();
    const teamsId = (student?.teamsId || '').toLowerCase();
    const zoom = (student?.zoom || '').toLowerCase();
    const googleMeet = (student?.googleMeet || '').toLowerCase();
    const teacherName = (teacher?.name || '').toLowerCase();
    const subject = s.subject.toLowerCase();
    
    return (
      studentName.includes(query) ||
      teamsId.includes(query) ||
      zoom.includes(query) ||
      googleMeet.includes(query) ||
      teacherName.includes(query) ||
      subject.includes(query)
    );
  });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const handleAddMakeupClass = async () => {
    if (!mkStudentId || !mkTeacherId) {
      alert('Please select both a student and a teacher for the makeup class.');
      return;
    }

    const newSlot: ClassSlot = {
      id: uid(),
      studentId: mkStudentId,
      teacherId: mkTeacherId,
      subject: mkSubject,
      day: selectedDayOfWeek,
      time: mkTime,
      duration: Number(mkDuration),
      date: selectedDateStr, // One-off flag
    };

    const updatedSlots = [...slots, newSlot];
    onUpdateSlots(updatedSlots);
    await StorageService.saveKey('slots', updatedSlots);

    // Reset inputs except date
    setMkStudentId('');
    setMkTeacherId('');
    alert('One-off makeup class scheduled successfully!');
  };

  const handleRemoveMakeupClass = async (slotId: string) => {
    if (!confirm('Are you sure you want to cancel and remove this makeup class?')) {
      return;
    }
    const updated = slots.filter((s) => s.id !== slotId);
    onUpdateSlots(updated);
    await StorageService.saveKey('slots', updated);
  };

  const handleCancelRegularClass = async (slotId: string) => {
    const updatedAdjustments = { ...dailyAdjustments };
    if (!updatedAdjustments[selectedDateStr]) {
      updatedAdjustments[selectedDateStr] = {};
    }

    updatedAdjustments[selectedDateStr][slotId] = {
      ...updatedAdjustments[selectedDateStr][slotId],
      isCancelled: true,
    };

    onUpdateAdjustments(updatedAdjustments);
    alert('Weekly class cancelled for today.');
  };

  const handleStartEditAdjustment = (slot: ClassSlot) => {
    setEditingSlotId(slot.id);
    const currentAdj = dayAdjustments[slot.id] || {};
    setAdjTime(currentAdj.time || slot.time);
    setAdjDuration(currentAdj.duration || slot.duration);
    setAdjTeacherId(currentAdj.teacherId || slot.teacherId);
  };

  const handleSaveAdjustment = async (slotId: string) => {
    const updatedAdjustments = { ...dailyAdjustments };
    if (!updatedAdjustments[selectedDateStr]) {
      updatedAdjustments[selectedDateStr] = {};
    }

    updatedAdjustments[selectedDateStr][slotId] = {
      ...updatedAdjustments[selectedDateStr][slotId],
      time: adjTime,
      duration: Number(adjDuration),
      teacherId: adjTeacherId,
      isCancelled: false, // If we modify, make sure it is active
    };

    onUpdateAdjustments(updatedAdjustments);
    setEditingSlotId(null);
    alert('Temporary schedule adjustments saved successfully!');
  };

  const handleResetAdjustment = async (slotId: string) => {
    const updatedAdjustments = { ...dailyAdjustments };
    if (updatedAdjustments[selectedDateStr]) {
      delete updatedAdjustments[selectedDateStr][slotId];
      if (Object.keys(updatedAdjustments[selectedDateStr]).length === 0) {
        delete updatedAdjustments[selectedDateStr];
      }
    }
    onUpdateAdjustments(updatedAdjustments);
    alert('Reset class to its weekly default schedule.');
  };

  return (
    <div className="space-y-8">
      {/* Date Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-blue-50/50 rounded-xl border border-blue-100 shadow-xs">
        <div>
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
            <CalendarClock size={12} /> Live Day-to-Day Adjustments & Makeup Engine
          </div>
          <h3 className="serif-title font-bold text-xl text-slate-800 mt-1">
            Selected Date: {selectedDateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Modifications made here affect the roster for <strong className="text-slate-600">{selectedDateStr}</strong> only. Regular weekly timetables will remain unaffected.
          </p>
        </div>
        <div className="shrink-0">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Target Adjustment Date</label>
          <input
            type="date"
            className="px-3.5 py-1.5 border border-blue-200 bg-white rounded-lg focus:outline-none focus:border-blue-500 text-sm font-semibold shadow-xs"
            value={selectedDateStr}
            onChange={(e) => setSelectedDateStr(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Schedule Makeup Class */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h4 className="serif-title font-semibold text-base text-slate-800 border-b pb-2 mb-4 flex items-center gap-1.5">
                <Plus size={16} className="text-blue-500" /> Schedule Makeup Class
              </h4>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Add a temporary one-off lesson slot for this specific date. This does not repeat on subsequent weeks.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Student</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs"
                    value={mkStudentId}
                    onChange={(e) => setMkStudentId(e.target.value)}
                  >
                    <option value="">-- Choose Student --</option>
                    {students
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.teamsId ? `(${s.teamsId})` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Teacher</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs"
                    value={mkTeacherId}
                    onChange={(e) => setMkTeacherId(e.target.value)}
                  >
                    <option value="">-- Choose Teacher --</option>
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

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Subject</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs"
                    value={mkSubject}
                    onChange={(e) => setMkSubject(e.target.value)}
                  >
                    {SUBJECT_OPTIONS.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Start Time</label>
                    <input
                      type="time"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs"
                      value={mkTime}
                      onChange={(e) => setMkTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Duration (Min)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs"
                      value={mkDuration}
                      onChange={(e) => setMkDuration(Number(e.target.value))}
                      min={5}
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleAddMakeupClass}
              className="mt-6 w-full py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors shadow-xs flex justify-center items-center gap-1 text-xs cursor-pointer"
            >
              <Plus size={14} /> Schedule One-off Makeup
            </button>
          </div>
        </div>

        {/* Right Columns: Adjust existing Weekly list for selected date */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h4 className="serif-title font-semibold text-base text-slate-800 border-b pb-2 mb-4 flex items-center justify-between">
              <span>Modify Roster for {selectedDateStr} ({DAY_NAMES[selectedDayOfWeek]}s)</span>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">
                {regularWeeklySlots.length + oneOffMakeupClasses.length} classes scheduled today
              </span>
            </h4>

            {/* Search Bar */}
            {(regularWeeklySlots.length > 0 || oneOffMakeupClasses.length > 0) && (
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search classes by student, Teams/Zoom ID, teacher, or subject..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-xs shadow-3xs bg-slate-50/50 font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {regularWeeklySlots.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                No regular weekly classes scheduled on {DAY_NAMES[selectedDayOfWeek]}s.
              </div>
            ) : filteredWeeklySlots.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                No classes match your search query "{searchQuery}".
              </div>
            ) : (
              <div className="space-y-4">
                {filteredWeeklySlots.map((s) => {
                  const student = students.find((st) => st.id === s.studentId);
                  const originalTeacher = teachers.find((t) => t.id === s.teacherId);
                  const isEditing = editingSlotId === s.id;

                  const currentAdj = dayAdjustments[s.id];
                  const hasAdjustment = !!currentAdj && !currentAdj.isCancelled;
                  const isCancelled = !!currentAdj && currentAdj.isCancelled;

                  // Resolve display teacher
                  const displayTeacherId = currentAdj?.teacherId || s.teacherId;
                  const displayTeacher = teachers.find((t) => t.id === displayTeacherId);

                  if (isEditing) {
                    return (
                      <div key={s.id} className="p-4 border border-blue-200 bg-blue-50/20 rounded-xl space-y-4">
                        <div className="flex justify-between items-center border-b pb-1">
                          <span className="text-xs font-bold text-blue-700">Adjusting Class for: {student?.name || 'Student'}</span>
                          <button onClick={() => setEditingSlotId(null)} className="p-0.5 text-slate-400 hover:text-slate-600">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Time</label>
                            <input
                              type="time"
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:border-blue-500 text-xs"
                              value={adjTime}
                              onChange={(e) => setAdjTime(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Duration (min)</label>
                            <input
                              type="number"
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:border-blue-500 text-xs"
                              value={adjDuration}
                              onChange={(e) => setAdjDuration(Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Teacher</label>
                            <select
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:border-blue-500 text-xs"
                              value={adjTeacherId}
                              onChange={(e) => setAdjTeacherId(e.target.value)}
                            >
                              {teachers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            onClick={() => handleSaveAdjustment(s.id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Check size={12} /> Save Adjustment
                          </button>
                          <button
                            onClick={() => setEditingSlotId(null)}
                            className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-xs font-semibold hover:bg-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={s.id}
                      className={`p-4 border rounded-xl flex justify-between items-start flex-wrap gap-4 transition-all duration-300 ${
                        isCancelled
                          ? 'bg-red-50/40 border-red-100/80 hover:bg-red-50/60'
                          : hasAdjustment
                          ? 'bg-amber-50/30 border-amber-200/60 hover:bg-amber-50/50'
                          : 'bg-slate-50/30 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-800">{student?.name || 'Removed Student'}</span>
                          {isCancelled && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-extrabold uppercase">
                              <AlertTriangle size={8} /> Cancelled Today
                            </span>
                          )}
                          {hasAdjustment && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                              Adjusted Today
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" />
                            <span>
                              {isCancelled ? (
                                <del className="text-red-400">{formatTimeToAMPM(s.time)}</del>
                              ) : hasAdjustment ? (
                                <span>
                                  <span className="font-bold text-amber-700">{formatTimeToAMPM(currentAdj.time || s.time)}</span>{' '}
                                  <span className="text-slate-400 text-[10px]">(was {formatTimeToAMPM(s.time)})</span>
                                </span>
                              ) : (
                                <span>{formatTimeToAMPM(s.time)}</span>
                              )}
                              {` · `}
                              {hasAdjustment ? (
                                <span>
                                  <span className="font-bold text-amber-700">{currentAdj.duration || s.duration} mins</span>{' '}
                                  <span className="text-slate-400 text-[10px]">(was {s.duration}m)</span>
                                </span>
                              ) : (
                                <span>{s.duration} mins</span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <User size={12} className="text-slate-400" />
                            <span>
                              Subject: <strong className="text-slate-600">{s.subject}</strong>
                              {` · `}
                              Teacher:{' '}
                              {hasAdjustment && currentAdj.teacherId !== s.teacherId ? (
                                <span>
                                  <span className="font-bold text-amber-700">{displayTeacher?.name}</span>{' '}
                                  <span className="text-slate-400 text-[10px]">(was {originalTeacher?.name})</span>
                                </span>
                              ) : (
                                <strong className="text-slate-600">{displayTeacher?.name || 'None'}</strong>
                              )}
                            </span>
                          </div>

                          {(student?.teamsId || student?.zoom || student?.googleMeet) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {student.teamsId && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium border border-blue-100">
                                  <Video size={10} className="text-blue-500 shrink-0" />
                                  Teams: {student.teamsId}
                                </span>
                              )}
                              {student.zoom && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-cyan-50 text-cyan-700 rounded text-[10px] font-medium border border-cyan-100">
                                  <Video size={10} className="text-cyan-500 shrink-0" />
                                  Zoom: {student.zoom}
                                </span>
                              )}
                              {student.googleMeet && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-medium border border-green-100">
                                  <Video size={10} className="text-green-500 shrink-0" />
                                  Meet: {student.googleMeet}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-1.5 flex-wrap">
                        {!isCancelled && !isEditing && (
                          <button
                            onClick={() => handleStartEditAdjustment(s)}
                            className="p-1 px-2.5 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-800 cursor-pointer flex items-center gap-1 transition-all"
                            title="Adjust schedule details for today"
                          >
                            <Edit2 size={12} /> Adjust
                          </button>
                        )}

                        {!isCancelled && (
                          <button
                            onClick={() => handleCancelRegularClass(s.id)}
                            className="p-1 px-2.5 bg-red-50 text-xs font-semibold text-red-600 rounded-lg hover:bg-red-100 cursor-pointer flex items-center gap-1 transition-all"
                            title="Cancel this class for today only"
                          >
                            <AlertTriangle size={12} /> Cancel Class
                          </button>
                        )}

                        {(hasAdjustment || isCancelled) && (
                          <button
                            onClick={() => handleResetAdjustment(s.id)}
                            className="p-1 px-2 bg-slate-100 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-200 cursor-pointer flex items-center gap-1 transition-all"
                            title="Reset to standard weekly schedule"
                          >
                            <RotateCcw size={12} /> Reset
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* List of Scheduled Makeup Classes for Selected Date */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h4 className="serif-title font-semibold text-base text-slate-800 border-b pb-2 mb-4 flex items-center justify-between">
              <span>Scheduled One-Off Makeup Classes on {selectedDateStr}</span>
              <span className="text-xs bg-blue-50 px-2 py-0.5 rounded text-blue-700 font-bold">
                {oneOffMakeupClasses.length} Scheduled
              </span>
            </h4>

            {oneOffMakeupClasses.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                No one-off makeup classes scheduled for this date yet.
              </div>
            ) : filteredMakeupClasses.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                No makeup classes match your search query "{searchQuery}".
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMakeupClasses.map((s) => {
                  const student = students.find((st) => st.id === s.studentId);
                  const teacher = teachers.find((t) => t.id === s.teacherId);
                  return (
                    <div
                      key={s.id}
                      className="p-4 border border-blue-200 bg-blue-50/10 rounded-xl flex justify-between items-center flex-wrap gap-2 hover:bg-blue-50/20 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-blue-800">{student?.name || 'Removed Student'}</span>
                          <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                            Makeup
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 space-y-0.5 mt-1">
                          <div>
                            Subject: <strong className="text-slate-700">{s.subject}</strong> · Teacher:{' '}
                            <strong className="text-slate-700">{teacher?.name || 'Removed Teacher'}</strong>
                          </div>
                          <div>
                            Time: <strong className="text-slate-700">{formatTimeToAMPM(s.time)}</strong> ({s.duration} mins)
                          </div>
                          {(student?.teamsId || student?.zoom || student?.googleMeet) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {student.teamsId && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium border border-blue-100">
                                  <Video size={10} className="text-blue-500 shrink-0" />
                                  Teams: {student.teamsId}
                                </span>
                              )}
                              {student.zoom && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-cyan-50 text-cyan-700 rounded text-[10px] font-medium border border-cyan-100">
                                  <Video size={10} className="text-cyan-500 shrink-0" />
                                  Zoom: {student.zoom}
                                </span>
                              )}
                              {student.googleMeet && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-medium border border-green-100">
                                  <Video size={10} className="text-green-500 shrink-0" />
                                  Meet: {student.googleMeet}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMakeupClass(s.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove Makeup Class"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}
