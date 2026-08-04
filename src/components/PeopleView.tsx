import React, { useState } from 'react';
import { Teacher, Student, ClassSlot } from '../types';
import { StorageService } from '../lib/storage';
import { Plus, Edit2, Trash2, Download, Check, X, RotateCcw } from 'lucide-react';

interface PeopleViewProps {
  teachers: Teacher[];
  students: Student[];
  slots: ClassSlot[];
  onUpdateTeachers: (teachers: Teacher[]) => void;
  onUpdateStudents: (students: Student[]) => void;
  onDownloadTimetable: (teacherId: string) => void;
  onDownloadStudentTimetable?: (studentId: string) => void;
  onOpenRestoreModal?: () => void;
}

export default function PeopleView({
  teachers,
  students,
  slots,
  onUpdateTeachers,
  onUpdateStudents,
  onDownloadTimetable,
  onDownloadStudentTimetable,
  onOpenRestoreModal,
}: PeopleViewProps) {
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newTeamsId, setNewTeamsId] = useState('');
  const [newZoom, setNewZoom] = useState('');
  const [newGoogleMeet, setNewGoogleMeet] = useState('');

  // Search filter states
  const [teacherQuery, setTeacherQuery] = useState('');
  const [studentQuery, setStudentQuery] = useState('');

  // Editing state
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [editingTeacherName, setEditingTeacherName] = useState('');

  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingStudentName, setEditingStudentName] = useState('');
  const [editingTeamsId, setEditingTeamsId] = useState('');
  const [editingZoom, setEditingZoom] = useState('');
  const [editingGoogleMeet, setEditingGoogleMeet] = useState('');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const handleAddTeacher = async () => {
    const name = newTeacherName.trim();
    if (!name) return;
    const updated = [...teachers, { id: uid(), name }];
    setNewTeacherName('');
    onUpdateTeachers(updated);
    await StorageService.saveKey('teachers', updated);
  };

  const handleAddStudent = async () => {
    const name = newStudentName.trim();
    if (!name) return;
    const updated = [
      ...students,
      {
        id: uid(),
        name,
        teamsId: newTeamsId.trim() || undefined,
        zoom: newZoom.trim() || undefined,
        googleMeet: newGoogleMeet.trim() || undefined,
      },
    ];
    setNewStudentName('');
    setNewTeamsId('');
    setNewZoom('');
    setNewGoogleMeet('');
    onUpdateStudents(updated);
    await StorageService.saveKey('students', updated);
  };

  const handleStartEditTeacher = (t: Teacher) => {
    setEditingTeacherId(t.id);
    setEditingTeacherName(t.name);
  };

  const handleSaveTeacher = async (id: string) => {
    const name = editingTeacherName.trim();
    if (!name) return;
    const updated = teachers.map((t) => (t.id === id ? { ...t, name } : t));
    setEditingTeacherId(null);
    onUpdateTeachers(updated);
    await StorageService.saveKey('teachers', updated);
  };

  const handleRemoveTeacher = async (id: string) => {
    const hasSlots = slots.some((s) => s.teacherId === id);
    if (hasSlots && !confirm("This teacher has classes assigned in the timetable. Removing them will leave those classes unassigned. Continue?")) {
      return;
    }
    const updated = teachers.filter((t) => t.id !== id);
    onUpdateTeachers(updated);
    await StorageService.saveKey('teachers', updated);
  };

  const handleStartEditStudent = (s: Student) => {
    setEditingStudentId(s.id);
    setEditingStudentName(s.name);
    setEditingTeamsId(s.teamsId || '');
    setEditingZoom(s.zoom || '');
    setEditingGoogleMeet(s.googleMeet || '');
  };

  const handleSaveStudent = async (id: string) => {
    const name = editingStudentName.trim();
    if (!name) return;
    const updated = students.map((s) =>
      s.id === id
        ? {
            ...s,
            name,
            teamsId: editingTeamsId.trim() || undefined,
            zoom: editingZoom.trim() || undefined,
            googleMeet: editingGoogleMeet.trim() || undefined,
          }
        : s
    );
    setEditingStudentId(null);
    onUpdateStudents(updated);
    await StorageService.saveKey('students', updated);
  };

  const handleRemoveStudent = async (id: string) => {
    const hasSlots = slots.some((s) => s.studentId === id);
    if (hasSlots && !confirm("This student has classes in the timetable. Removing them will also clear all their timetable entries. Continue?")) {
      return;
    }
    const updated = students.filter((s) => s.id !== id);
    onUpdateStudents(updated);
    await StorageService.saveKey('students', updated);
  };

  const filteredTeachers = teachers.filter((t) =>
    t.name.toLowerCase().includes(teacherQuery.toLowerCase())
  );

  const filteredStudents = students.filter((s) => {
    const query = studentQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(query) ||
      (s.teamsId || '').toLowerCase().includes(query) ||
      (s.zoom || '').toLowerCase().includes(query) ||
      (s.googleMeet || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Teachers Column */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <h3 className="serif-title font-semibold text-lg text-slate-800">Teachers</h3>
          {onOpenRestoreModal && (
            <button
              onClick={onOpenRestoreModal}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shadow-3xs transition-colors"
              title="Diagnose corrupted teacher IDs or restore backup snapshots"
            >
              <RotateCcw size={13} className="text-blue-600" />
              <span>Data Health &amp; Restore</span>
            </button>
          )}
        </div>
        
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            className="flex-1 px-3 py-2 border border-slate-300 rounded focus:border-[var(--accent)] focus:outline-none"
            placeholder="Teacher's name"
            value={newTeacherName}
            onChange={(e) => setNewTeacherName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTeacher()}
          />
          <button
            onClick={handleAddTeacher}
            className="px-4 py-2 bg-[var(--accent)] text-white font-semibold rounded hover:bg-[var(--accent-dark)] cursor-pointer flex items-center gap-1 transition-colors"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <input
            type="text"
            className="w-full px-3 py-1.5 border border-slate-200 rounded bg-slate-50 focus:bg-white focus:border-[var(--accent)] focus:outline-none text-xs placeholder-slate-400"
            placeholder="🔍 Search teachers by name..."
            value={teacherQuery}
            onChange={(e) => setTeacherQuery(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          {filteredTeachers.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
              {teacherQuery ? 'No matching teachers found.' : 'No teachers added yet.'}
            </div>
          ) : (
            filteredTeachers
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => {
                const classCount = slots.filter((s) => s.teacherId === t.id).length;
                const isEditing = editingTeacherId === t.id;

                if (isEditing) {
                  return (
                    <div key={t.id} className="flex gap-2 p-3 border border-[var(--line)] bg-[#FBFCFD] rounded-lg items-center">
                      <input
                        type="text"
                        className="flex-1 px-3 py-1.5 border-2 border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)]"
                        value={editingTeacherName}
                        onChange={(e) => setEditingTeacherName(e.target.value)}
                      />
                      <button
                        onClick={() => handleSaveTeacher(t.id)}
                        className="p-1.5 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-dark)] cursor-pointer"
                        title="Save Changes"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingTeacherId(null)}
                        className="p-1.5 bg-slate-200 rounded hover:bg-slate-300 cursor-pointer"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={t.id} className="p-3 border border-[var(--line)] bg-[#FBFCFD] rounded-lg flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <div className="font-semibold text-[var(--ink)]">{t.name}</div>
                      <div className="text-xs text-[var(--ink-soft)]">{classCount} weekly class{classCount === 1 ? '' : 'es'}</div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => onDownloadTimetable(t.id)}
                        className="px-2 py-1 text-xs border border-[var(--line-strong)] rounded hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                        title="Download Timetable"
                      >
                        <Download size={12} /> Timetable
                      </button>
                      <button
                        onClick={() => handleStartEditTeacher(t)}
                        className="p-1.5 text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-slate-50 rounded cursor-pointer"
                        title="Edit Name"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleRemoveTeacher(t.id)}
                        className="p-1.5 text-[var(--warn)] hover:bg-red-50 rounded cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* Students Column */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <h3 className="serif-title font-semibold text-lg border-b pb-2 mb-4 text-slate-800">Students</h3>
        <div className="space-y-3 mb-6 p-4 border border-slate-150 rounded-lg bg-slate-50/50">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Add New Student</div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
            <input
              type="text"
              className="w-full px-3 py-1.5 border border-slate-300 bg-white rounded focus:border-[var(--accent)] focus:outline-none"
              placeholder="Student's name"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Microsoft Teams ID</label>
              <input
                type="text"
                className="w-full px-3 py-1.5 border border-slate-300 bg-white rounded focus:border-[var(--accent)] focus:outline-none text-xs"
                placeholder="e.g. msnadeem@..."
                value={newTeamsId}
                onChange={(e) => setNewTeamsId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Zoom Meeting Link/ID</label>
              <input
                type="text"
                className="w-full px-3 py-1.5 border border-slate-300 bg-white rounded focus:border-[var(--accent)] focus:outline-none text-xs"
                placeholder="Zoom ID or Link"
                value={newZoom}
                onChange={(e) => setNewZoom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Google Meet Link/ID</label>
              <input
                type="text"
                className="w-full px-3 py-1.5 border border-slate-300 bg-white rounded focus:border-[var(--accent)] focus:outline-none text-xs"
                placeholder="Meet Link"
                value={newGoogleMeet}
                onChange={(e) => setNewGoogleMeet(e.target.value)}
              />
            </div>
          </div>
          <div className="pt-2">
            <button
              onClick={handleAddStudent}
              className="w-full px-4 py-2 bg-[var(--accent)] text-white font-semibold rounded hover:bg-[var(--accent-dark)] cursor-pointer flex justify-center items-center gap-1 transition-colors"
            >
              <Plus size={16} /> Add Student
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <input
            type="text"
            className="w-full px-3 py-1.5 border border-slate-200 rounded bg-slate-50 focus:bg-white focus:border-[var(--accent)] focus:outline-none text-xs placeholder-slate-400"
            placeholder="🔍 Search students by name, Teams ID, Zoom or Meet..."
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
              {studentQuery ? 'No matching students found.' : 'No students added yet.'}
            </div>
          ) : (
            filteredStudents
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => {
                const classCount = slots.filter((x) => x.studentId === s.id).length;
                const isEditing = editingStudentId === s.id;

                if (isEditing) {
                  return (
                    <div key={s.id} className="p-4 border border-[var(--accent)] bg-[#FBFCFD] rounded-lg space-y-3">
                      <div className="text-xs font-bold text-[var(--accent-dark)]">Editing {s.name}</div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Student Name</label>
                        <input
                          type="text"
                          className="w-full px-3 py-1.5 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)] bg-white"
                          value={editingStudentName}
                          onChange={(e) => setEditingStudentName(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Teams ID</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)] bg-white text-xs"
                            value={editingTeamsId}
                            onChange={(e) => setEditingTeamsId(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Zoom Option</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)] bg-white text-xs"
                            value={editingZoom}
                            onChange={(e) => setEditingZoom(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Google Meet</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)] bg-white text-xs"
                            value={editingGoogleMeet}
                            onChange={(e) => setEditingGoogleMeet(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSaveStudent(s.id)}
                          className="px-3 py-1.5 bg-[var(--accent)] text-white rounded font-semibold hover:bg-[var(--accent-dark)] cursor-pointer flex items-center gap-1"
                        >
                          <Check size={14} /> Save
                        </button>
                        <button
                          onClick={() => setEditingStudentId(null)}
                          className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded font-semibold hover:bg-slate-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={s.id} className="p-3 border border-[var(--line)] bg-[#FBFCFD] rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-[var(--ink)]">{s.name}</div>
                        <div className="text-xs text-[var(--ink-soft)]">{classCount} weekly class{classCount === 1 ? '' : 'es'}</div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        {onDownloadStudentTimetable && (
                          <button
                            onClick={() => onDownloadStudentTimetable(s.id)}
                            className="px-2 py-1 text-xs border border-[var(--line-strong)] rounded hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                            title="Download Timetable"
                          >
                            <Download size={12} /> Timetable
                          </button>
                        )}
                        <button
                          onClick={() => handleStartEditStudent(s)}
                          className="p-1.5 text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-slate-50 rounded cursor-pointer"
                          title="Edit Student Info"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleRemoveStudent(s.id)}
                          className="p-1.5 text-[var(--warn)] hover:bg-red-50 rounded cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    {(s.teamsId || s.zoom || s.googleMeet) && (
                      <div className="flex gap-2 flex-wrap pt-1 border-t border-dashed border-slate-200">
                        {s.teamsId && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-mono">
                            <strong>Teams:</strong> {s.teamsId}
                          </span>
                        )}
                        {s.zoom && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono">
                            <strong>Zoom:</strong> {s.zoom}
                          </span>
                        )}
                        {s.googleMeet && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-mono">
                            <strong>Meet:</strong> {s.googleMeet}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
}
