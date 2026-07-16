import React, { useState } from 'react';
import { Student, Teacher, StudentProfile } from '../types';
import { StorageService } from '../lib/storage';
import { Search, AlertTriangle, CheckCircle, Edit, Calendar } from 'lucide-react';

interface StudentProfilesViewProps {
  students: Student[];
  teachers: Teacher[];
  studentProfiles: Record<string, StudentProfile>;
  onUpdateProfiles: (profiles: Record<string, StudentProfile>) => void;
}

const PROFILE_STALE_DAYS = 15;

export default function StudentProfilesView({
  students,
  teachers,
  studentProfiles,
  onUpdateProfiles,
}: StudentProfilesViewProps) {
  const [search, setSearch] = useState('');
  const [staleOnly, setStaleOnly] = useState(false);

  // Edit Mode state
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editBook, setEditBook] = useState('');
  const [editQaida, setEditQaida] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSubInstructions, setEditSubInstructions] = useState('');
  const [editUpdatedBy, setEditUpdatedBy] = useState('');

  const parseDate = (s: string) => {
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };

  const daysSince = (dateStr: string | undefined): number | null => {
    if (!dateStr) return null;
    const then = parseDate(dateStr);
    const now = new Date();
    const ms =
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
    return Math.round(ms / 86400000);
  };

  const formatDateNice = (d: Date) => {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const handleStartEdit = (studentId: string, p: StudentProfile | undefined) => {
    setEditingProfileId(studentId);
    setEditBook(p?.book || '');
    setEditQaida(p?.qaida || '');
    setEditNotes(p?.notes || '');
    setEditSubInstructions(p?.subInstructions || '');
    setEditUpdatedBy(p?.updatedBy || '');
  };

  const handleSaveProfile = async (studentId: string) => {
    if (!editUpdatedBy) {
      alert('Please choose which teacher is updating this profile.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const updatedProfiles = {
      ...studentProfiles,
      [studentId]: {
        book: editBook.trim(),
        qaida: editQaida.trim(),
        notes: editNotes.trim(),
        subInstructions: editSubInstructions.trim(),
        updatedBy: editUpdatedBy,
        updatedAt: todayStr,
      },
    };

    setEditingProfileId(null);
    onUpdateProfiles(updatedProfiles);
    await StorageService.saveKey('studentProfiles', updatedProfiles);
  };

  const sortedStudents = students.slice().sort((a, b) => a.name.localeCompare(b.name));

  const filteredStudents = sortedStudents.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    
    const p = studentProfiles[s.id];
    const d = p ? daysSince(p.updatedAt) : null;
    const isStale = d === null || d > PROFILE_STALE_DAYS;

    if (staleOnly && !isStale) return false;
    return matchesSearch;
  });

  return (
    <div>
      <div className="toolbar flex flex-wrap gap-4 items-center mb-6 no-print bg-slate-50 p-4 rounded-xl border border-[var(--line)]">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:border-[var(--accent)] focus:outline-none"
            placeholder="Search student by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-soft)] select-none cursor-pointer">
          <input
            type="checkbox"
            className="rounded text-[var(--accent)] cursor-pointer"
            checked={staleOnly}
            onChange={(e) => setStaleOnly(e.target.checked)}
          />
          Needs review / update only
        </label>
      </div>

      <div className="space-y-6">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400">
            {staleOnly ? 'Every profile is up-to-date and refreshed within the last 15 days!' : 'No students found.'}
          </div>
        ) : (
          filteredStudents.map((s) => {
            const p = studentProfiles[s.id];
            const d = p ? daysSince(p.updatedAt) : null;
            const isStale = d === null || d > PROFILE_STALE_DAYS;
            const isEditing = editingProfileId === s.id;

            if (isEditing) {
              return (
                <div key={s.id} className="bg-white rounded-xl border-2 border-[var(--accent)] p-6 space-y-4 shadow-sm">
                  <div className="flex justify-between items-center border-b pb-2 mb-2">
                    <h3 className="serif-title font-bold text-lg text-[var(--accent-dark)]">
                      Update Profile: {s.name}
                    </h3>
                    <span className="text-xs text-slate-400">All changes are saved instantly.</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Book Currently Reading</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)]"
                        placeholder="e.g. NCERT Math Class 4"
                        value={editBook}
                        onChange={(e) => setEditBook(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Qaida / Quran Progress</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)]"
                        placeholder="e.g. Qaida Noorania, page 18"
                        value={editQaida}
                        onChange={(e) => setEditQaida(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Updated By (Teacher)</label>
                      <select
                        className="w-full px-3 py-2 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)]"
                        value={editUpdatedBy}
                        onChange={(e) => setEditUpdatedBy(e.target.value)}
                      >
                        <option value="">Choose teacher…</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">General Progress Notes</label>
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2 border border-[var(--line-strong)] rounded focus:outline-none focus:border-[var(--accent)]"
                      placeholder="How the student is doing overall, strengths, areas to work on…"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  </div>

                  <div className="bg-[var(--accent-soft)] p-4 rounded-lg border border-[var(--accent)]">
                    <label className="block text-xs font-bold text-[var(--accent-dark)] mb-1">
                      Instructions for a Substitute Teacher
                    </label>
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2 border border-[var(--accent)] bg-white rounded focus:outline-none focus:border-[var(--accent-dark)] text-slate-800"
                      placeholder="Specify exactly where a substitute should pick up, what pacing/rules to use, or what the student struggles with…"
                      value={editSubInstructions}
                      onChange={(e) => setEditSubInstructions(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleSaveProfile(s.id)}
                      className="px-4 py-2 bg-[var(--accent)] text-white font-semibold rounded hover:bg-[var(--accent-dark)] cursor-pointer"
                    >
                      Save Profile
                    </button>
                    <button
                      onClick={() => setEditingProfileId(null)}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded font-semibold hover:bg-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            const teacher = p ? teachers.find((t) => t.id === p.updatedBy) : null;
            const metaText =
              p && p.updatedAt
                ? `Last updated ${formatDateNice(parseDate(p.updatedAt))}${
                    teacher ? ` by ${teacher.name}` : ''
                  } · ${d} day${d === 1 ? '' : 's'} ago`
                : 'Never updated yet';

            return (
              <div
                key={s.id}
                className={`bg-[#FBFCFD] rounded-xl border-2 p-6 transition-all shadow-sm ${
                  isStale
                    ? 'border-l-4 border-l-[var(--warn)] border-[var(--line)]'
                    : 'border-l-4 border-l-[var(--accent)] border-[var(--line)]'
                }`}
              >
                <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
                  <div>
                    <h3 className="serif-title font-bold text-lg text-[var(--ink)]">{s.name}</h3>
                    <div className="text-xs text-[var(--ink-soft)] flex items-center gap-1 mt-0.5">
                      <Calendar size={12} /> {metaText}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isStale ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--warn)] bg-[var(--warn-soft)] px-2.5 py-1 rounded-full">
                        <AlertTriangle size={12} /> Needs update
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent-dark)] bg-[var(--accent-soft)] px-2.5 py-1 rounded-full">
                        <CheckCircle size={12} /> Up to date
                      </span>
                    )}
                    <button
                      onClick={() => handleStartEdit(s.id, p)}
                      className="px-3 py-1 bg-white border border-[var(--line-strong)] hover:border-[var(--ink-soft)] rounded text-xs font-semibold flex items-center gap-1 cursor-pointer no-print"
                    >
                      <Edit size={12} /> {p ? 'Edit profile' : 'Add profile'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider mb-1">
                      Book Currently Reading
                    </div>
                    <div className={`text-sm ${p?.book ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)] italic'}`}>
                      {p?.book || 'Not filled in yet'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider mb-1">
                      Qaida / Quran Progress
                    </div>
                    <div className={`text-sm ${p?.qaida ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)] italic'}`}>
                      {p?.qaida || 'Not filled in yet'}
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider mb-1">
                      General Progress Notes
                    </div>
                    <div className={`text-sm whitespace-pre-wrap leading-relaxed ${p?.notes ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)] italic'}`}>
                      {p?.notes || 'No progress notes recorded yet.'}
                    </div>
                  </div>
                  <div className="md:col-span-3 bg-teal-50/50 p-4 rounded-lg border border-teal-100">
                    <div className="text-[10px] font-bold text-[var(--accent-dark)] uppercase tracking-wider mb-1">
                      Instructions for a Substitute Teacher
                    </div>
                    <div className={`text-sm whitespace-pre-wrap leading-relaxed ${p?.subInstructions ? 'text-[var(--ink)] font-medium' : 'text-[var(--ink-faint)] italic'}`}>
                      {p?.subInstructions || 'No substitute instructions set. Please write down pacing or key notes to help substitute teachers cover your class seamlessly.'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
