import React, { useState, useEffect } from 'react';
import { Student, Teacher, StudentProfile, ClassSlot } from '../types';
import { StorageService } from '../lib/storage';
import { Search, AlertTriangle, CheckCircle, Edit, Calendar, Users, UserCheck, Printer, ChevronLeft, ChevronRight } from 'lucide-react';

interface StudentProfilesViewProps {
  students: Student[];
  teachers: Teacher[];
  slots: ClassSlot[];
  studentProfiles: Record<string, StudentProfile>;
  onUpdateProfiles: (profiles: Record<string, StudentProfile>) => void;
  schoolLogo?: string;
}

interface ProfileItem {
  student: Student;
  subject: string;
  profileKey: string;
  teachers: Teacher[];
}

const PROFILE_STALE_DAYS = 15;

export default function StudentProfilesView({
  students,
  teachers,
  slots,
  studentProfiles,
  onUpdateProfiles,
  schoolLogo,
}: StudentProfilesViewProps) {
  const [search, setSearch] = useState('');
  const [staleOnly, setStaleOnly] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('all');
  const [printingStudentId, setPrintingStudentId] = useState<string | null>(null);

  // Edit Mode state - scoped by profileKey
  const [editingProfileKey, setEditingProfileKey] = useState<string | null>(null);
  const [editBook, setEditBook] = useState('');
  const [editQaida, setEditQaida] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSubInstructions, setEditSubInstructions] = useState('');
  const [editUpdatedBy, setEditUpdatedBy] = useState('');

  // Slider states
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [groupSlideIndices, setGroupSlideIndices] = useState<Record<string, number>>({});

  useEffect(() => {
    setCurrentSlideIndex(0);
    setGroupSlideIndices({});
  }, [search, selectedTeacherId, staleOnly]);

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

  const handleStartEdit = (profileKey: string, p: StudentProfile | undefined) => {
    setEditingProfileKey(profileKey);
    setEditBook(p?.book || '');
    setEditQaida(p?.qaida || '');
    setEditNotes(p?.notes || '');
    setEditSubInstructions(p?.subInstructions || '');
    setEditUpdatedBy(p?.updatedBy || '');
  };

  const handleSaveProfile = async (profileKey: string) => {
    if (!editUpdatedBy) {
      alert('Please choose which teacher is updating this profile.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const updatedProfiles = {
      ...studentProfiles,
      [profileKey]: {
        book: editBook.trim(),
        qaida: editQaida.trim(),
        notes: editNotes.trim(),
        subInstructions: editSubInstructions.trim(),
        updatedBy: editUpdatedBy,
        updatedAt: todayStr,
      },
    };

    setEditingProfileKey(null);
    onUpdateProfiles(updatedProfiles);
    await StorageService.saveKey('studentProfiles', updatedProfiles);
  };

  // Generate Profile Items (Student + Subject combinations)
  const getProfileItems = (): ProfileItem[] => {
    const items: ProfileItem[] = [];
    const sortedStudents = students.slice().sort((a, b) => a.name.localeCompare(b.name));

    sortedStudents.forEach((s) => {
      const studentSlots = slots.filter((slot) => slot.studentId === s.id);
      const uniqueSubjects = Array.from(new Set(studentSlots.map((slot) => slot.subject).filter(Boolean)));

      if (uniqueSubjects.length === 0) {
        // Fallback for students with no slots/subjects
        items.push({
          student: s,
          subject: 'General',
          profileKey: s.id,
          teachers: []
        });
      } else {
        uniqueSubjects.forEach((sub) => {
          const subjectTeachers = teachers.filter((t) =>
            studentSlots.some((slot) => slot.teacherId === t.id && slot.subject === sub)
          );
          items.push({
            student: s,
            subject: sub,
            profileKey: `${s.id}_${sub}`,
            teachers: subjectTeachers
          });
        });
      }
    });

    return items;
  };

  // Regular filtered list for Flat view or Specific Teacher view
  const getFilteredProfileItems = () => {
    const allItems = getProfileItems();
    return allItems.filter((item) => {
      const matchesSearch = item.student.name.toLowerCase().includes(search.toLowerCase()) ||
                            item.subject.toLowerCase().includes(search.toLowerCase());

      const p = studentProfiles[item.profileKey] || studentProfiles[item.student.id];
      const d = p ? daysSince(p.updatedAt) : null;
      const isStale = d === null || d > PROFILE_STALE_DAYS;

      if (staleOnly && !isStale) return false;
      if (!matchesSearch) return false;

      // Filter by specific teacher if chosen
      if (selectedTeacherId !== 'all' && selectedTeacherId !== 'grouped') {
        if (!item.teachers.some((t) => t.id === selectedTeacherId)) {
          return false;
        }
      }

      return true;
    });
  };

  // Grouped data structure for "Group by Teacher" mode
  const getGroupedProfileItems = () => {
    const groupedData: { teacher: Teacher | null; items: ProfileItem[] }[] = [];
    const filteredItems = getFilteredProfileItems();

    // 1. Group for each teacher
    const sortedTeachersList = teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
    sortedTeachersList.forEach((t) => {
      const teacherItems = filteredItems.filter((item) =>
        item.teachers.some((st) => st.id === t.id)
      );

      if (teacherItems.length > 0) {
        groupedData.push({ teacher: t, items: teacherItems });
      }
    });

    // 2. Group for items with NO teacher assigned
    const unassignedItems = filteredItems.filter((item) => item.teachers.length === 0);
    if (unassignedItems.length > 0) {
      groupedData.push({ teacher: null, items: unassignedItems });
    }

    return groupedData;
  };

  const renderStudentCard = (
    s: Student,
    subject: string,
    profileKey: string,
    teachersForSubject: Teacher[]
  ) => {
    const p = studentProfiles[profileKey] || studentProfiles[s.id];
    const d = p ? daysSince(p.updatedAt) : null;
    const isStale = d === null || d > PROFILE_STALE_DAYS;
    const isEditing = editingProfileKey === profileKey;

    if (isEditing) {
      return (
        <div key={profileKey} className="bg-slate-50/40 rounded-xl border border-blue-200 p-6 space-y-4 shadow-sm transition-all">
          <div className="flex justify-between items-center border-b pb-2 mb-2">
            <div>
              <h3 className="serif-title font-bold text-lg text-[var(--accent-dark)]">
                Update Profile: {s.name}
              </h3>
              <div className="text-xs font-semibold text-slate-500 mt-0.5">
                Subject: <span className="font-bold text-[var(--accent-dark)]">{subject}</span>
              </div>
            </div>
            <span className="text-xs text-slate-400">All changes are saved instantly.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Book Currently Reading</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-[var(--line-strong)] rounded bg-white focus:outline-none focus:border-[var(--accent)]"
                placeholder="e.g. NCERT Math Class 4"
                value={editBook}
                onChange={(e) => setEditBook(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Qaida / Quran Progress</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-[var(--line-strong)] rounded bg-white focus:outline-none focus:border-[var(--accent)]"
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
              className="w-full px-3 py-2 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)]"
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
              onClick={() => handleSaveProfile(profileKey)}
              className="px-4 py-2 bg-[var(--accent)] text-white font-semibold rounded hover:bg-[var(--accent-dark)] cursor-pointer transition-colors shadow-xs"
            >
              Save Profile
            </button>
            <button
              onClick={() => setEditingProfileKey(null)}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded font-semibold hover:bg-slate-300 cursor-pointer transition-colors"
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

    const isOtherStudentPrinting = printingStudentId !== null && printingStudentId !== s.id;

    return (
      <div
        key={profileKey}
        className={`bg-white rounded-xl border border-slate-200 p-6 transition-all hover:shadow-md duration-300 print:shadow-none print:border-none print:p-0 print-page-break ${
          isStale
            ? 'border-l-4 border-l-[var(--warn)]'
            : 'border-l-4 border-l-[var(--accent)]'
        } ${isOtherStudentPrinting ? 'print:hidden' : ''}`}
      >
        {/* Print-only Logo Header */}
        <div className="hidden print:flex items-center justify-between border-b pb-4 mb-6">
          <div>
            <h1 className="serif-title font-bold text-xl text-slate-900">Student Learning Profile</h1>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              <span className="font-extrabold"><span style={{ color: '#2596be' }}>Islamic Education</span> <span style={{ color: '#ff8610' }}>Centre</span></span> &middot; Individual Progress Record
            </p>
          </div>
          {schoolLogo && (
            <img 
              src={schoolLogo} 
              alt="School Logo" 
              className="h-10 max-w-[120px] object-contain rounded"
              referrerPolicy="no-referrer"
            />
          )}
        </div>

        <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="serif-title font-bold text-lg text-[var(--ink)]">{s.name}</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--accent-dark)] border border-[var(--accent-soft)]">
                Subject: {subject}
              </span>
            </div>
            <div className="text-xs text-[var(--ink-soft)] flex items-center gap-1 mt-1.5">
              <Calendar size={12} /> {metaText}
            </div>
            
            {/* Assigned Teachers List */}
            <div className="flex flex-wrap gap-1.5 items-center mt-2.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Teachers for this Subject:</span>
              {teachersForSubject.length > 0 ? (
                teachersForSubject.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200/60"
                  >
                    <UserCheck size={10} className="text-slate-400" />
                    {t.name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400 italic">No assigned teacher</span>
              )}
            </div>

            {/* Class Connection Links */}
            {(s.zoom || s.teamsId || s.googleMeet) && (
              <div className="flex flex-wrap gap-2 items-center mt-2.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Links / IDs:</span>
                {s.teamsId && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-75">Teams:</span>
                    <span>{s.teamsId}</span>
                  </span>
                )}
                {s.zoom && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-75">Zoom:</span>
                    {s.zoom.startsWith('http') ? (
                      <>
                        <a href={s.zoom} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 no-print">Open Link</a>
                        <span className="hidden print:inline font-mono text-[10px]">{s.zoom}</span>
                      </>
                    ) : (
                      <span>{s.zoom}</span>
                    )}
                  </span>
                )}
                {s.googleMeet && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100">
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-75">Meet:</span>
                    {s.googleMeet.startsWith('http') ? (
                      <>
                        <a href={s.googleMeet} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 no-print">Open Link</a>
                        <span className="hidden print:inline font-mono text-[10px]">{s.googleMeet}</span>
                      </>
                    ) : (
                      <span>{s.googleMeet}</span>
                    )}
                  </span>
                )}
              </div>
            )}
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
              onClick={() => {
                setPrintingStudentId(s.id);
                setTimeout(() => {
                  window.print();
                  setPrintingStudentId(null);
                }, 150);
              }}
              className="px-3 py-1 bg-white border border-[var(--line-strong)] hover:border-[var(--ink-soft)] hover:bg-slate-50 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer no-print"
              title="Print learning profile for this student"
            >
              <Printer size={12} /> Print
            </button>

            <button
              onClick={() => handleStartEdit(profileKey, p)}
              className="px-3 py-1 bg-white border border-[var(--line-strong)] hover:border-[var(--ink-soft)] rounded text-xs font-semibold flex items-center gap-1 cursor-pointer no-print"
            >
              <Edit size={12} /> {p ? 'Edit' : 'Add'}
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
  };

  const isGroupedMode = selectedTeacherId === 'grouped';
  const filteredProfileItems = getFilteredProfileItems();
  const groupedProfileItems = getGroupedProfileItems();

  const renderSlider = (
    sliderId: string,
    list: ProfileItem[],
    activeIndex: number,
    onChangeIndex: (idx: number) => void
  ) => {
    if (list.length === 0) return null;

    // Ensure activeIndex is in bounds
    const idx = Math.max(0, Math.min(activeIndex, list.length - 1));
    const activeItem = list[idx];
    if (!activeItem) return null;

    return (
      <div className="space-y-4 no-print">
        {/* Horizontal Ribbon selector of student/subject names */}
        {list.length > 1 && (
          <div className="flex overflow-x-auto gap-2 pb-2 mb-1 scrollbar-none max-w-full">
            {list.map((item, index) => {
              const p = studentProfiles[item.profileKey] || studentProfiles[item.student.id];
              const d = p ? daysSince(p.updatedAt) : null;
              const isStale = d === null || d > PROFILE_STALE_DAYS;
              const isSelected = index === idx;
              return (
                <button
                  key={item.profileKey}
                  type="button"
                  onClick={() => onChangeIndex(index)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {item.student.name} ({item.subject})
                  {isStale && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-[var(--warn)] rounded-full animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Slide Controls and active student label */}
        <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => onChangeIndex(idx - 1)}
            className="p-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer transition-colors shadow-2xs"
            title="Previous Student"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="text-center select-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block leading-tight">Viewing Profile</span>
            <div className="text-sm font-extrabold text-slate-800 truncate max-w-[180px] sm:max-w-xs">{activeItem.student.name}</div>
            <div className="text-xs font-bold text-[var(--accent-dark)] mt-0.5 px-2 py-0.5 bg-[var(--accent-soft)] rounded-md inline-block">Subject: {activeItem.subject}</div>
            <div className="text-[10px] font-medium text-slate-500 mt-1">
              {idx + 1} of {list.length} Items
            </div>
          </div>

          <button
            type="button"
            disabled={idx === list.length - 1}
            onClick={() => onChangeIndex(idx + 1)}
            className="p-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer transition-colors shadow-2xs"
            title="Next Student"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Selected Student Card */}
        <div className="pt-2">
          {renderStudentCard(activeItem.student, activeItem.subject, activeItem.profileKey, activeItem.teachers)}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Print-only general Page Header when printing all profiles */}
      {printingStudentId === null && (
        <div className="hidden print:flex items-center justify-between border-b-2 border-slate-300 pb-4 mb-8">
          <div>
            <h1 className="serif-title font-bold text-2xl text-slate-900">Student Learning Profiles</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">
              <span className="font-extrabold"><span style={{ color: '#2596be' }}>Islamic Education</span> <span style={{ color: '#ff8610' }}>Centre</span></span> &middot; Complete Student Progress Directory
            </p>
          </div>
          {schoolLogo && (
            <img src={schoolLogo} alt="School Logo" className="h-14 max-w-[150px] object-contain rounded" referrerPolicy="no-referrer" />
          )}
        </div>
      )}

      <div className="toolbar flex flex-wrap gap-4 items-center mb-6 no-print bg-slate-50 p-4 rounded-xl border border-[var(--line)]">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:border-[var(--accent)] focus:outline-none"
            placeholder="Search student or subject name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Group / Filter Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Group/Filter:</span>
          <select
            className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded text-xs sm:text-sm focus:border-[var(--accent)] focus:outline-none font-semibold text-slate-700 cursor-pointer"
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
          >
            <option value="all">All Students (Alphabetical)</option>
            <option value="grouped">Group by Teacher</option>
            <optgroup label="Filter by Teacher">
              {teachers
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          </select>
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

        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs ml-auto"
          title="Print entire list of active student profiles"
        >
          <Printer size={14} /> Print All Profiles
        </button>
      </div>

      {/* Screen-only Interactive Slider View */}
      <div className="space-y-6 print:hidden">
        {isGroupedMode ? (
          groupedProfileItems.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400">
              No grouped student profiles found.
            </div>
          ) : (
            groupedProfileItems.map((group) => {
              const groupId = group.teacher?.id || 'unassigned';
              const groupIndex = groupSlideIndices[groupId] || 0;
              return (
                <div key={groupId} className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                    <Users size={16} className="text-slate-400" />
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                      {group.teacher ? `Teacher: ${group.teacher.name}` : 'No Scheduled Teacher'}
                      <span className="ml-2 text-xs text-slate-400 font-normal bg-slate-100 px-2 py-0.5 rounded-full">
                        {group.items.length} profile{group.items.length === 1 ? '' : 's'}
                      </span>
                    </h3>
                  </div>
                  <div className="pl-0 md:pl-4">
                    {renderSlider(
                      groupId,
                      group.items,
                      groupIndex,
                      (newIdx) => setGroupSlideIndices(prev => ({ ...prev, [groupId]: newIdx }))
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : (
          filteredProfileItems.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400">
              {staleOnly ? 'Every profile is up-to-date and refreshed within the last 15 days!' : 'No student profiles found.'}
            </div>
          ) : (
            renderSlider('flat', filteredProfileItems, currentSlideIndex, setCurrentSlideIndex)
          )
        )}
      </div>

      {/* Print-only complete listed profiles */}
      <div className="hidden print:block space-y-6">
        {isGroupedMode ? (
          groupedProfileItems.map((group) => (
            <div key={group.teacher?.id || 'unassigned'} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80 print:hidden">
                <Users size={16} className="text-slate-400" />
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                  {group.teacher ? `Teacher: ${group.teacher.name}` : 'No Scheduled Teacher'}
                </h3>
              </div>
              <div className="space-y-6">
                {group.items.map((item) => renderStudentCard(item.student, item.subject, item.profileKey, item.teachers))}
              </div>
            </div>
          ))
        ) : (
          filteredProfileItems.map((item) => renderStudentCard(item.student, item.subject, item.profileKey, item.teachers))
        )}
      </div>
    </div>
  );
}
