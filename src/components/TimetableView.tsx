import React, { useState, useEffect, useRef } from 'react';
import { ClassSlot, Student, Teacher } from '../types';
import { StorageService } from '../lib/storage';
import { Plus, Edit, Trash2, Search, X, Check, ChevronDown } from 'lucide-react';
import { getStudentDisplayName, formatTimeToAMPM } from '../lib/utils';

interface TimetableViewProps {
  slots: ClassSlot[];
  students: Student[];
  teachers: Teacher[];
  onUpdateSlots: (slots: ClassSlot[]) => void;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon', defaultTime: '17:00' },
  { value: 2, label: 'Tue', defaultTime: '17:00' },
  { value: 3, label: 'Wed', defaultTime: '17:00' },
  { value: 4, label: 'Thu', defaultTime: '17:00' },
  { value: 5, label: 'Fri', defaultTime: '17:00' },
  { value: 6, label: 'Sat', defaultTime: '10:00' },
  { value: 0, label: 'Sun', defaultTime: '10:00' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TimetableView({ slots, students, teachers, onUpdateSlots }: TimetableViewProps) {
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState('Math');
  const [subjectOther, setSubjectOther] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [duration, setDuration] = useState(30);

  // Student Search states
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const studentDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(event.target as Node)) {
        setIsStudentDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedStudent = students.find((s) => s.id === studentId);

  const sortedStudents = students
    .slice()
    .sort((a, b) => getStudentDisplayName(a).localeCompare(getStudentDisplayName(b)));

  const filteredStudents = sortedStudents.filter((s) =>
    getStudentDisplayName(s).toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  const handleSelectStudent = (sId: string) => {
    setStudentId(sId);
    const s = students.find((item) => item.id === sId);
    if (s) {
      setStudentSearchQuery(getStudentDisplayName(s));
    }
    setIsStudentDropdownOpen(false);
  };

  const handleClearStudent = () => {
    setStudentId('');
    setStudentSearchQuery('');
    setIsStudentDropdownOpen(false);
  };

  // Day Selection States
  const [selectedDays, setSelectedDays] = useState<Record<number, boolean>>({});
  const [dayTimes, setDayTimes] = useState<Record<number, string>>({});
  const [bulkTime, setBulkTime] = useState('17:00');

  // Filter states
  const [search, setSearch] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterDay, setFilterDay] = useState<string>('');
  const [filterStudent, setFilterStudent] = useState('');

  // Editing state
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);

  const [formError, setFormError] = useState('');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Initialize day times
  useEffect(() => {
    const times: Record<number, string> = {};
    DAYS_OF_WEEK.forEach((d) => {
      times[d.value] = d.defaultTime;
    });
    setDayTimes(times);
  }, []);

  const handleDayCheckChange = (day: number, checked: boolean) => {
    setSelectedDays((prev) => ({ ...prev, [day]: checked }));
    if (checked) {
      setDayTimes((prev) => ({ ...prev, [day]: bulkTime || prev[day] }));
    }
  };

  const handleApplyBulkTime = () => {
    if (!bulkTime) return;
    const updatedTimes = { ...dayTimes };
    Object.keys(selectedDays).forEach((dayStr) => {
      const dayNum = Number(dayStr);
      if (selectedDays[dayNum]) {
        updatedTimes[dayNum] = bulkTime;
      }
    });
    setDayTimes(updatedTimes);
  };

  const handleAddClass = async () => {
    if (students.length === 0) {
      setFormError('Please add a student first in the Teachers & Students tab.');
      return;
    }
    if (teachers.length === 0) {
      setFormError('Please add a teacher first in the Teachers & Students tab.');
      return;
    }
    if (!studentId || !teacherId) {
      setFormError('Please select both a student and a teacher.');
      return;
    }

    const finalSubject = subject === 'Other' ? subjectOther.trim() : subject;
    if (!finalSubject) {
      setFormError('Please specify a subject name.');
      return;
    }

    const tickedDays = Object.keys(selectedDays)
      .map(Number)
      .filter((day) => selectedDays[day]);

    if (tickedDays.length === 0) {
      setFormError('Please select at least one day.');
      return;
    }

    for (const d of tickedDays) {
      if (!dayTimes[d]) {
        setFormError('Please select a valid time for all checked days.');
        return;
      }
    }

    if (duration <= 0) {
      setFormError('Please enter a valid class duration.');
      return;
    }

    setFormError('');

    let updatedSlots = [...slots];

    if (editingSlotId) {
      // Edit mode: replace the main slot and insert any additional ticked days
      const currentSlotIndex = updatedSlots.findIndex((s) => s.id === editingSlotId);
      if (currentSlotIndex !== -1) {
        // Update first ticked day for current slot
        const firstDay = tickedDays[0];
        updatedSlots[currentSlotIndex] = {
          ...updatedSlots[currentSlotIndex],
          studentId,
          teacherId,
          subject: finalSubject,
          day: firstDay,
          time: dayTimes[firstDay],
          duration,
        };

        // Add secondary ticked days as fresh new slots
        for (let i = 1; i < tickedDays.length; i++) {
          const nextDay = tickedDays[i];
          updatedSlots.push({
            id: uid(),
            studentId,
            teacherId,
            subject: finalSubject,
            day: nextDay,
            time: dayTimes[nextDay],
            duration,
          });
        }
      }
      setEditingSlotId(null);
    } else {
      // Create new slots for each ticked day
      tickedDays.forEach((d) => {
        updatedSlots.push({
          id: uid(),
          studentId,
          teacherId,
          subject: finalSubject,
          day: d,
          time: dayTimes[d],
          duration,
        });
      });
    }

    onUpdateSlots(updatedSlots);
    await StorageService.saveKey('slots', updatedSlots);
    resetForm();
  };

  const handleStartEdit = (slot: ClassSlot) => {
    setEditingSlotId(slot.id);
    setStudentId(slot.studentId);
    const s = students.find((item) => item.id === slot.studentId);
    if (s) {
      setStudentSearchQuery(getStudentDisplayName(s));
    } else {
      setStudentSearchQuery('');
    }
    setTeacherId(slot.teacherId);
    setDuration(slot.duration);

    const isKnownSubject = ['Math', 'Science', 'English', 'Quran / Islamic Studies'].includes(slot.subject);
    if (isKnownSubject) {
      setSubject(slot.subject);
      setSubjectOther('');
    } else {
      setSubject('Other');
      setSubjectOther(slot.subject);
    }

    const initialSelectedDays: Record<number, boolean> = { [slot.day]: true };
    const initialDayTimes = { ...dayTimes, [slot.day]: slot.time };

    setSelectedDays(initialSelectedDays);
    setDayTimes(initialDayTimes);
    setBulkTime(slot.time);
    setFormError('');
  };

  const resetForm = () => {
    setEditingSlotId(null);
    setStudentId('');
    setStudentSearchQuery('');
    setIsStudentDropdownOpen(false);
    setSubject('Math');
    setSubjectOther('');
    setTeacherId('');
    setDuration(30);
    setSelectedDays({});
    const baseTimes: Record<number, string> = {};
    DAYS_OF_WEEK.forEach((d) => {
      baseTimes[d.value] = d.defaultTime;
    });
    setDayTimes(baseTimes);
    setBulkTime('17:00');
    setFormError('');
  };

  const handleRemoveSlot = async (id: string) => {
    if (!confirm('Remove this class from the timetable permanently?')) return;
    const updated = slots.filter((s) => s.id !== id);
    onUpdateSlots(updated);
    await StorageService.saveKey('slots', updated);
  };

  const handleReassignTeacher = async (slotId: string, newId: string) => {
    const updated = slots.map((s) => (s.id === slotId ? { ...s, teacherId: newId } : s));
    onUpdateSlots(updated);
    await StorageService.saveKey('slots', updated);
  };

  // Filter slots for list
  const filteredSlots = slots
    .map((s) => {
      const studentObj = students.find((st) => st.id === s.studentId);
      return {
        slot: s,
        studentName: studentObj?.name || '(removed student)',
        teamsId: studentObj?.teamsId || '',
        teacherName: teachers.find((t) => t.id === s.teacherId)?.name || '(removed teacher)',
      };
    })
    .filter((item) => {
      if (filterTeacher && item.slot.teacherId !== filterTeacher) return false;
      if (filterStudent && item.slot.studentId !== filterStudent) return false;
      if (filterDay !== '' && item.slot.day.toString() !== filterDay) return false;
      if (search) {
        const query = search.toLowerCase();
        const hay = `${item.studentName} ${item.teamsId} ${item.teacherName} ${item.slot.subject}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.slot.day !== b.slot.day) return a.slot.day - b.slot.day;
      return a.slot.time.localeCompare(b.slot.time);
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

  return (
    <div>
      {/* Add / Edit Class Fieldset */}
      <fieldset className="border-2 border-[var(--line)] rounded-xl p-6 bg-white mb-8">
        <legend className="serif-title font-bold text-base px-2 text-[var(--accent)]">
          {editingSlotId ? 'Edit class' : 'Add a class'}
        </legend>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Student</label>
              <div ref={studentDropdownRef} className="relative w-full">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                    <Search size={15} />
                  </span>
                  <input
                    type="text"
                    className="w-full pl-8 pr-7 py-2 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)] text-sm placeholder-slate-400"
                    placeholder="Search student..."
                    value={isStudentDropdownOpen ? studentSearchQuery : (selectedStudent ? getStudentDisplayName(selectedStudent) : studentSearchQuery)}
                    onChange={(e) => {
                      setStudentSearchQuery(e.target.value);
                      setIsStudentDropdownOpen(true);
                    }}
                    onFocus={() => {
                      setIsStudentDropdownOpen(true);
                      if (studentId) {
                        setStudentSearchQuery('');
                      }
                    }}
                  />
                  {studentId ? (
                    <button
                      type="button"
                      onClick={handleClearStudent}
                      className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Clear selection"
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
                      className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <ChevronDown size={14} />
                    </button>
                  )}
                </div>

                {isStudentDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                    {filteredStudents.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400 text-center">
                        No students found
                      </div>
                    ) : (
                      filteredStudents.map((s) => {
                        const isSelected = s.id === studentId;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleSelectStudent(s.id)}
                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                              isSelected ? 'bg-slate-50 text-[var(--accent-dark)] font-semibold' : 'text-slate-700'
                            }`}
                          >
                            <span>{getStudentDisplayName(s)}</span>
                            {isSelected && <Check size={13} className="text-[var(--accent-dark)]" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Subject</label>
              <select
                className="w-full px-3 py-2 border border-[var(--line-strong)] rounded bg-white focus:outline-none focus:border-[var(--accent)]"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="Math">Math</option>
                <option value="Science">Science</option>
                <option value="English">English</option>
                <option value="Quran / Islamic Studies">Quran / Islamic Studies</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {subject === 'Other' && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Subject name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)]"
                  placeholder="e.g. Urdu"
                  value={subjectOther}
                  onChange={(e) => setSubjectOther(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Teacher</label>
              <select
                className="w-full px-3 py-2 border border-[var(--line-strong)] rounded bg-white focus:outline-none focus:border-[var(--accent)]"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
              >
                <option value="">Choose teacher…</option>
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
              <label className="block text-xs font-bold text-slate-600 mb-1">Duration (minutes)</label>
              <input
                type="number"
                min="5"
                step="5"
                className="w-full px-3 py-2 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)]"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Days checklist & separate times */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-4">
            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Day(s) &amp; Time — tick a day, then set its own time
            </div>
            
            <div className="flex flex-col gap-2">
              {DAYS_OF_WEEK.map((d) => {
                const isChecked = !!selectedDays[d.value];
                return (
                  <div key={d.value} className="flex items-center gap-4 bg-white p-2 rounded border border-slate-200 max-w-sm">
                    <label className="flex items-center gap-2 font-medium cursor-pointer select-none text-sm w-16">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleDayCheckChange(d.value, e.target.checked)}
                        className="rounded cursor-pointer"
                      />
                      {d.label}
                    </label>
                    <input
                      type="time"
                      disabled={!isChecked}
                      value={dayTimes[d.value] || '17:00'}
                      onChange={(e) => setDayTimes((prev) => ({ ...prev, [d.value]: e.target.value }))}
                      className="px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 disabled:bg-slate-100"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-dashed border-slate-200">
              <input
                type="time"
                value={bulkTime}
                onChange={(e) => setBulkTime(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 bg-white rounded text-xs"
              />
              <button
                type="button"
                onClick={handleApplyBulkTime}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs bg-white hover:bg-slate-50 cursor-pointer font-semibold text-slate-700"
              >
                Apply this time to all ticked days
              </button>
            </div>
          </div>

          {formError && <p className="text-xs font-semibold text-[var(--warn)]">{formError}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleAddClass}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded font-semibold hover:bg-[var(--accent-dark)] cursor-pointer flex items-center gap-1"
            >
              <Plus size={16} /> {editingSlotId ? 'Save changes' : 'Add class'}
            </button>
            {editingSlotId && (
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded font-semibold hover:bg-slate-300 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </fieldset>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center bg-slate-50 p-4 rounded-xl border border-[var(--line)]">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:border-[var(--accent)] focus:outline-none text-sm placeholder-slate-400"
            placeholder="Search student, Teams ID, teacher, subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)] text-sm"
          value={filterStudent}
          onChange={(e) => setFilterStudent(e.target.value)}
        >
          <option value="">All students</option>
          {students
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.teamsId ? `(Teams: ${s.teamsId})` : ''}
              </option>
            ))}
        </select>

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

        <select
          className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)]"
          value={filterDay}
          onChange={(e) => setFilterDay(e.target.value)}
        >
          <option value="">All days</option>
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
          <option value="0">Sunday</option>
        </select>
      </div>

      {/* Slots Table */}
      {filteredSlots.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400">
          No classes fall in this selection. Add classes in the timetable form.
        </div>
      ) : (
        <div className="overflow-x-auto border-2 border-[var(--line-strong)] rounded-xl bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Day</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Teacher</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Duration</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredSlots.map(({ slot, studentName, teacherName }) => (
                <tr key={slot.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-block px-2 py-0.5 bg-slate-100 font-mono text-[11px] font-bold text-slate-600 rounded">
                      {DAY_SHORT[slot.day]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-700">
                    {formatTimeToAMPM(slot.time)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">
                    <div>{studentName}</div>
                    {(() => {
                      const studentObj = students.find((s) => s.id === slot.studentId);
                      if (!studentObj) return null;
                      return (
                        <div className="flex gap-1.5 mt-0.5">
                          {studentObj.zoom && (
                            <span className="inline-block text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-100 font-mono" title={`Zoom: ${studentObj.zoom}`}>
                              Zoom: {studentObj.zoom}
                            </span>
                          )}
                          {studentObj.teamsId && (
                            <span className="inline-block text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-100 font-mono" title={`Teams: ${studentObj.teamsId}`}>
                              Teams: {studentObj.teamsId}
                            </span>
                          )}
                          {studentObj.googleMeet && (
                            <span className="inline-block text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-100 font-mono" title={`Meet: ${studentObj.googleMeet}`}>
                              Meet: {studentObj.googleMeet}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${getSubjectClass(slot.subject)}`}>
                      {slot.subject}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <select
                      className="text-sm px-2 py-1 border border-slate-300 bg-white rounded focus:outline-none focus:border-[var(--accent)]"
                      value={slot.teacherId}
                      onChange={(e) => handleReassignTeacher(slot.id, e.target.value)}
                    >
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {slot.duration} min
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleStartEdit(slot)}
                      className="text-[var(--accent)] hover:text-[var(--accent-dark)] font-semibold mr-3 cursor-pointer inline-flex items-center gap-1 text-xs"
                    >
                      <Edit size={12} /> Edit
                    </button>
                    <button
                      onClick={() => handleRemoveSlot(slot.id)}
                      className="text-[var(--warn)] hover:text-red-700 font-semibold cursor-pointer inline-flex items-center gap-1 text-xs"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
