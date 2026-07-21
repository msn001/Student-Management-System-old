import React, { useState, useEffect } from 'react';
import { Teacher, Student, ClassSlot, LessonEntry, StudentProfile } from './types';
import { StorageService } from './lib/storage';
import { db } from './lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import DashboardView from './components/DashboardView';
import TimetableView from './components/TimetableView';
import DailyLogView from './components/DailyLogView';
import MonthlyReportView from './components/MonthlyReportView';
import StudentProfilesView from './components/StudentProfilesView';
import PeopleView from './components/PeopleView';
import AdjustmentsView from './components/AdjustmentsView';
import TeacherAttendanceView from './components/TeacherAttendanceView';
import ManageAttendanceView from './components/ManageAttendanceView';
import StudentAbsenceView from './components/StudentAbsenceView';
import { BookOpen, Calendar, Clock, Clipboard, Users, GraduationCap, Menu, X, Lock, Unlock, Settings, Key, CalendarClock, Fingerprint, UserCheck, UserX, Upload, Trash2, Image } from 'lucide-react';

const LOCKED_TABS = ['timetable', 'people', 'adjustments', 'manage_attendance', 'student_absence'];

const SCHOOL_DAY_CUTOFF_HOUR = 10;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Calendar },
  { id: 'timetable', label: 'Weekly Timetable', icon: Clock },
  { id: 'adjustments', label: 'Daily Adjustments', icon: CalendarClock },
  { id: 'dailylog', label: 'Daily Log', icon: Clipboard },
  { id: 'report', label: 'Monthly Report', icon: BookOpen },
  { id: 'student_absence', label: 'Absent/Leave Tracker', icon: UserX },
  { id: 'profiles', label: 'Student Profiles', icon: GraduationCap },
  { id: 'people', label: 'Teachers & Students', icon: Users },
  { id: 'teacher_attendance', label: 'Teacher Attendance', icon: Fingerprint },
  { id: 'manage_attendance', label: 'Manage Attendance', icon: UserCheck },
];

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard Overview',
  timetable: 'Weekly Timetable',
  adjustments: 'Daily Adjustments & Makeup Classes',
  dailylog: 'Daily Log Registers',
  report: 'Monthly Progress Report',
  student_absence: 'Absent & On Leave Students',
  profiles: 'Student Learning Profiles',
  people: 'Teachers & Students Directory',
  teacher_attendance: 'Teacher Attendance Kiosk & Sheets',
  manage_attendance: 'Manage Attendance & Roster',
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [schoolLogo, setSchoolLogo] = useState(() => {
    return localStorage.getItem('lesson_register_logo') || '';
  });

  // Shared application state
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [slots, setSlots] = useState<ClassSlot[]>([]);
  const [studentProfiles, setStudentProfiles] = useState<Record<string, StudentProfile>>({});
  const [dailyAdjustments, setDailyAdjustments] = useState<Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>>({});

  // Monthly and substitute buffers (keyed by "YYYY-MM")
  const [logsByMonth, setLogsByMonth] = useState<Record<string, Record<string, Record<string, LessonEntry>>>>({});
  const [subsByMonth, setSubsByMonth] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const [activeMonths, setActiveMonths] = useState<string[]>([]);

  // 1. Core real-time sync listeners (onSnapshot)
  useEffect(() => {
    if (!db) return;

    const unsubscribers: (() => void)[] = [];

    const setupDocListener = (key: string, setter: (val: any) => void) => {
      const docRef = doc(db, 'lesson_register_store', key);
      const unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists() && typeof docSnap.data().value !== 'undefined') {
          try {
            const val = JSON.parse(docSnap.data().value);
            setter(val);
          } catch (e) {
            console.error(`Error parsing real-time value for ${key}`, e);
          }
        }
      }, (error) => {
        console.error(`Real-time listener failed for ${key}`, error);
      });
      unsubscribers.push(unsub);
    };

    setupDocListener('teachers', setTeachers);
    setupDocListener('students', setStudents);
    setupDocListener('slots', setSlots);
    setupDocListener('studentProfiles', setStudentProfiles);
    setupDocListener('dailyAdjustments', setDailyAdjustments);
    setupDocListener('schoolLogo', (val) => {
      setSchoolLogo(val || '');
      if (val) {
        localStorage.setItem('lesson_register_logo', val);
      } else {
        localStorage.removeItem('lesson_register_logo');
      }
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  // 2. Monthly logs & substitutions real-time sync listeners (onSnapshot)
  useEffect(() => {
    if (!db || activeMonths.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    activeMonths.forEach((mKey) => {
      const logsDocRef = doc(db, 'lesson_register_store', `logs-${mKey}`);
      const unsubLogs = onSnapshot(logsDocRef, (docSnap) => {
        if (docSnap.exists() && typeof docSnap.data().value !== 'undefined') {
          try {
            const val = JSON.parse(docSnap.data().value);
            setLogsByMonth((prev) => ({ ...prev, [mKey]: val }));
          } catch (e) {
            console.error(`Error parsing real-time logs for ${mKey}`, e);
          }
        } else {
          setLogsByMonth((prev) => ({ ...prev, [mKey]: {} }));
        }
      }, (error) => {
        console.error(`Real-time logs listener failed for ${mKey}`, error);
      });
      unsubscribers.push(unsubLogs);

      const subsDocRef = doc(db, 'lesson_register_store', `subs-${mKey}`);
      const unsubSubs = onSnapshot(subsDocRef, (docSnap) => {
        if (docSnap.exists() && typeof docSnap.data().value !== 'undefined') {
          try {
            const val = JSON.parse(docSnap.data().value);
            setSubsByMonth((prev) => ({ ...prev, [mKey]: val }));
          } catch (e) {
            console.error(`Error parsing real-time subs for ${mKey}`, e);
          }
        } else {
          setSubsByMonth((prev) => ({ ...prev, [mKey]: {} }));
        }
      }, (error) => {
        console.error(`Real-time subs listener failed for ${mKey}`, error);
      });
      unsubscribers.push(unsubSubs);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [activeMonths]);

  // Active dates for logs and dashboards
  const [dashDate, setDashDate] = useState('');
  const [logDate, setLogDate] = useState('');

  // Printable Teacher Timetable HTML State
  const [printTeacherHtml, setPrintTeacherHtml] = useState<string>('');

  // Lock / Unlock features for Administrative Tabs (Weekly Timetable & Teachers/Students)
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return localStorage.getItem('lesson_register_unlocked') === 'true';
  });
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [adminPin, setAdminPin] = useState(() => {
    return localStorage.getItem('lesson_register_pin') || '1234';
  });
  const [showPinSettings, setShowPinSettings] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');

  const handleLock = () => {
    setIsUnlocked(false);
    localStorage.removeItem('lesson_register_unlocked');
    if (LOCKED_TABS.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  };

  const handleUnlockAttempt = () => {
    if (pinInput === adminPin) {
      setIsUnlocked(true);
      localStorage.setItem('lesson_register_unlocked', 'true');
      setPinError('');
      setPinInput('');
      setShowUnlockModal(false);
      if (pendingTab === 'settings') {
        setNewPinInput('');
        setShowPinSettings(true);
        setPendingTab(null);
      } else if (pendingTab) {
        setActiveTab(pendingTab);
        setPendingTab(null);
      }
    } else {
      setPinError('Incorrect passcode. Try again.');
    }
  };

  const handleChangePin = () => {
    const trimmed = newPinInput.trim();
    if (trimmed.length < 4) {
      alert('PIN must be at least 4 characters long.');
      return;
    }
    setAdminPin(trimmed);
    localStorage.setItem('lesson_register_pin', trimmed);
    setNewPinInput('');
    alert('PIN updated successfully!');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // File size safety check (e.g., limit to 2MB to keep localStorage reasonable)
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo image should be under 2MB to ensure smooth performance.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setSchoolLogo(base64);
      localStorage.setItem('lesson_register_logo', base64);
      try {
        await StorageService.saveKey('schoolLogo', base64);
      } catch (err) {
        console.error('Error syncing school logo to Firestore:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    if (window.confirm('Are you sure you want to remove the custom school logo?')) {
      setSchoolLogo('');
      localStorage.removeItem('lesson_register_logo');
      try {
        await StorageService.saveKey('schoolLogo', '');
      } catch (err) {
        console.error('Error removing school logo from Firestore:', err);
      }
    }
  };

  // Overnight school-day cutoff calculations (9 PM - 6 AM session handling)
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

  // Initial load
  useEffect(() => {
    const loadAppData = async () => {
      try {
        const loadedTeachers = await StorageService.loadKey<Teacher[]>('teachers', []);
        const loadedStudents = await StorageService.loadKey<Student[]>('students', []);
        const loadedSlots = await StorageService.loadKey<ClassSlot[]>('slots', []);
        const loadedProfiles = await StorageService.loadKey<Record<string, StudentProfile>>('studentProfiles', {});
        const loadedAdjustments = await StorageService.loadKey<Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>>('dailyAdjustments', {});
        const loadedLogo = await StorageService.loadKey<string>('schoolLogo', '');

        setTeachers(loadedTeachers);
        setStudents(loadedStudents);
        setSlots(loadedSlots);
        setStudentProfiles(loadedProfiles);
        setDailyAdjustments(loadedAdjustments);

        const localLogo = localStorage.getItem('lesson_register_logo') || '';
        if (loadedLogo) {
          setSchoolLogo(loadedLogo);
          localStorage.setItem('lesson_register_logo', loadedLogo);
        } else if (localLogo) {
          // If we have a local logo but the server is empty, sync it to Firebase
          setSchoolLogo(localLogo);
          StorageService.saveKey('schoolLogo', localLogo).catch((err) => {
            console.error('Error migrating local logo to Firebase:', err);
          });
        } else {
          setSchoolLogo('');
        }

        // Compute current session date
        const schoolDate = getSchoolDateNow();
        const schoolDateStr = getSchoolDateString(schoolDate);
        setDashDate(schoolDateStr);
        setLogDate(schoolDateStr);

        // Pre-load current and nearby month registers
        const mKey = `${schoolDateStr.split('-')[0]}-${schoolDateStr.split('-')[1]}`;
        const currentMonthLogs = await StorageService.getMonthLogs(mKey);
        const currentMonthSubs = await StorageService.getMonthSubs(mKey);

        setLogsByMonth((prev) => ({ ...prev, [mKey]: currentMonthLogs }));
        setSubsByMonth((prev) => ({ ...prev, [mKey]: currentMonthSubs }));
        setActiveMonths([mKey]);
      } catch (e) {
        console.error('Error bootstrapping application data', e);
      } finally {
        setLoading(false);
      }
    };

    loadAppData();
  }, []);

  // Safely retrieve / pre-load logs and substitutions for any month selection
  const handleLoadMonthBuffer = async (mKey: string) => {
    if (!logsByMonth[mKey]) {
      const logs = await StorageService.getMonthLogs(mKey);
      setLogsByMonth((prev) => ({ ...prev, [mKey]: logs }));
    }
    if (!subsByMonth[mKey]) {
      const subs = await StorageService.getMonthSubs(mKey);
      setSubsByMonth((prev) => ({ ...prev, [mKey]: subs }));
    }
    setActiveMonths((prev) => prev.includes(mKey) ? prev : [...prev, mKey]);
  };

  // Trigger when dashboard date selection changes
  const handleUpdateDashDate = async (newDateStr: string) => {
    setDashDate(newDateStr);
    const parts = newDateStr.split('-');
    const mKey = `${parts[0]}-${parts[1]}`;
    await handleLoadMonthBuffer(mKey);
  };

  // Trigger when daily log date selection changes
  const handleUpdateLogDate = async (newDateStr: string) => {
    setLogDate(newDateStr);
    const parts = newDateStr.split('-');
    const mKey = `${parts[0]}-${parts[1]}`;
    await handleLoadMonthBuffer(mKey);
  };

  const handleUpdateAdjustments = async (newAdjustments: Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>) => {
    setDailyAdjustments(newAdjustments);
    await StorageService.saveKey('dailyAdjustments', newAdjustments);
  };

  // Callback to download individual teacher's weekly timetable as a printable PDF
  const handleDownloadTeacherTimetable = (teacherId: string) => {
    const teacher = teachers.find((t) => t.id === teacherId);
    if (!teacher) return;

    const teacherSlots = slots.filter((s) => s.teacherId === teacherId);
    
    // Sort days starting with Monday (1) through Sunday (0)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const byDay: Record<number, ClassSlot[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
    teacherSlots.forEach((s) => {
      if (byDay[s.day]) byDay[s.day].push(s);
    });

    dayOrder.forEach((d) => {
      byDay[d].sort((a, b) => a.time.localeCompare(b.time));
    });

    const todayStr = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let html = `
      <div style="font-family:'IBM Plex Sans', sans-serif; color: #1B2430; max-width: 760px; margin: 0 auto; padding: 24px;">
        <h1 style="font-family:'Lora', serif; font-size: 24px; margin: 0 0 4px; font-weight: 600;">${teacher.name}</h1>
        <div style="color: #5B6672; font-size: 13px; margin-bottom: 24px; border-bottom: 2px solid #C3CBD4; padding-bottom: 8px;">
          Weekly Timetable &middot; Generated ${todayStr}
        </div>
    `;

    let hasClasses = false;
    dayOrder.forEach((dayNum) => {
      const daySlots = byDay[dayNum];
      if (daySlots.length === 0) return;
      hasClasses = true;

      html += `
        <div style="margin-bottom: 20px; page-break-inside: avoid;">
          <h2 style="font-family:'Lora', serif; font-size: 16px; margin: 0 0 8px; color: #0f6b5c; border-bottom: 1px solid #DCE1E7; padding-bottom: 4px;">
            ${DAY_NAMES[dayNum]}
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background-color: #F7F8FA;">
                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #C3CBD4; font-weight: 600; color: #5B6672;">Time</th>
                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #C3CBD4; font-weight: 600; color: #5B6672;">Student</th>
                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #C3CBD4; font-weight: 600; color: #5B6672;">Subject</th>
                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #C3CBD4; font-weight: 600; color: #5B6672;">Duration</th>
              </tr>
            </thead>
            <tbody>
      `;

      daySlots.forEach((s) => {
        const student = students.find((st) => st.id === s.studentId);
        html += `
          <tr style="border-bottom: 1px solid #EAEEF2;">
            <td style="padding: 8px; font-weight: 500;">${s.time}</td>
            <td style="padding: 8px; font-weight: 600;">${student?.name || 'Removed Student'}</td>
            <td style="padding: 8px;">${s.subject}</td>
            <td style="padding: 8px; color: #5B6672;">${s.duration} min</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
    });

    if (!hasClasses) {
      html += `<p style="color: #8792A0; font-style: italic; text-align: center; padding: 40px 0;">No weekly classes assigned to this teacher yet.</p>`;
    }

    html += `</div>`;

    setPrintTeacherHtml(html);

    // Apply print-specific flags on the document body
    document.body.classList.add('printing-teacher-timetable');
    
    // Trigger PDF printing dialog
    setTimeout(() => {
      window.print();
      // Remove class once print completes or is cancelled
      document.body.classList.remove('printing-teacher-timetable');
      setPrintTeacherHtml('');
    }, 300);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0f172a] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-4 border-slate-700 border-t-blue-500 animate-spin"></div>
        <div className="font-mono text-xs text-slate-400">Loading Islamic Education Center…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex bg-slate-50 font-sans overflow-x-hidden">
      {/* Printable Area - only visible under specific media print query */}
      {printTeacherHtml && (
        <div id="teacherPrintArea" className="hidden print:block" dangerouslySetInnerHTML={{ __html: printTeacherHtml }} />
      )}

      {/* Main App Layout */}
      <div className="print:hidden w-full flex flex-col md:flex-row">
        
        {/* Mobile Navbar Header */}
        <div className="md:hidden flex items-center justify-between px-6 py-4 bg-slate-900 text-white shadow-md z-20 no-print">
          <div className="flex items-center gap-2">
            {schoolLogo ? (
              <img src={schoolLogo} alt="Logo" className="w-8 h-8 object-contain rounded bg-white p-0.5" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center font-bold text-sm text-white font-serif shrink-0">
                I
              </div>
            )}
            <span className="font-bold text-base tracking-tight">Islamic <span className="text-emerald-500 font-extrabold">Education Center</span></span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Slide-out Drawer Overlay */}
        {isMobileMenuOpen && (
          <div 
            className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 transition-opacity no-print"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Left Sidebar - Desktop & Mobile Drawer */}
        <aside className={`
          fixed md:sticky top-0 left-0 h-screen w-64 bg-slate-900 text-white shrink-0 border-r border-slate-800 flex flex-col z-50 transition-transform duration-300 no-print
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            {schoolLogo ? (
              <img src={schoolLogo} alt="Logo" className="w-10 h-10 object-contain rounded bg-white p-1 shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded bg-emerald-600 flex items-center justify-center font-bold text-lg text-white font-serif shrink-0">
                I
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold tracking-tight truncate leading-tight">Islamic <span className="text-emerald-500 block">Education Center</span></h1>
              <p className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold mt-0.5">Admin Dashboard</p>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-3 ml-2 tracking-widest">Main Menu</p>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (LOCKED_TABS.includes(tab.id) && !isUnlocked) {
                      setPendingTab(tab.id);
                      setPinInput('');
                      setPinError('');
                      setShowUnlockModal(true);
                    } else {
                      setActiveTab(tab.id);
                    }
                    setIsMobileMenuOpen(false);
                  }}
                  className={`
                    w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer
                    ${isActive 
                      ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/20' 
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }
                  `}
                >
                  <div className="flex items-center">
                    <Icon size={18} className={`mr-3 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    {tab.label}
                  </div>
                  {LOCKED_TABS.includes(tab.id) && (
                    isUnlocked ? (
                      <Unlock size={14} className="text-emerald-500" title="Unlocked" />
                    ) : (
                      <Lock size={14} className="text-slate-500" title="Locked" />
                    )
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer with Lock Status */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/40 space-y-2 shrink-0">
            <div className="flex items-center justify-between text-xs text-slate-400 px-2">
              <span className="flex items-center gap-1.5 font-mono text-[10px]">
                {isUnlocked ? (
                  <>
                    <Unlock size={12} className="text-emerald-500 animate-pulse" />
                    ADMIN: UNLOCKED
                  </>
                ) : (
                  <>
                    <Lock size={12} className="text-slate-500" />
                    ADMIN: LOCKED
                  </>
                )}
              </span>
              
              <div className="flex gap-2 items-center">
                <button 
                  onClick={() => {
                    if (isUnlocked) {
                      setNewPinInput('');
                      setShowPinSettings(true);
                    } else {
                      setPendingTab('settings');
                      setPinInput('');
                      setPinError('');
                      setShowUnlockModal(true);
                    }
                  }}
                  className="p-1 hover:text-white text-slate-400 hover:bg-slate-800 rounded transition-colors cursor-pointer flex items-center gap-1 border border-slate-800/60 px-1.5 py-0.5 bg-slate-900/40"
                  title="Branding & Admin Settings (School Logo, PIN)"
                >
                  <Settings size={13} />
                  {!isUnlocked && <Lock size={9} className="text-slate-500" />}
                </button>
                
                {isUnlocked ? (
                  <button 
                    onClick={handleLock}
                    className="p-1 hover:text-red-400 text-slate-400 hover:bg-slate-800 rounded transition-colors cursor-pointer text-xs flex items-center gap-1 font-bold"
                    title="Lock Administrative Tabs"
                  >
                    Lock Tabs
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setPendingTab(null);
                      setPinInput('');
                      setPinError('');
                      setShowUnlockModal(true);
                    }}
                    className="p-1 hover:text-blue-400 text-slate-400 hover:bg-slate-800 rounded transition-colors cursor-pointer text-xs font-bold"
                    title="Unlock"
                  >
                    Unlock
                  </button>
                )}
              </div>
            </div>
          </div>


        </aside>

        {/* Right Panel Main Area */}
        <div className="flex-1 flex flex-col min-h-screen bg-slate-50 overflow-hidden">
          
          {/* Top Header Bar */}
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 md:px-8 shrink-0 no-print z-10 shadow-xs">
            <div className="flex items-center">
              <h2 className="text-base md:text-lg font-bold text-slate-800 serif-title tracking-tight">
                {TAB_LABELS[activeTab]}
              </h2>
              <span className="hidden sm:inline-block ml-4 px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100 uppercase tracking-wider">
                {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">System Online</span>
              </div>
            </div>
          </header>

          {/* Active Tab View Window */}
          <main className="flex-1 p-6 md:p-8 overflow-y-auto">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 min-h-[460px] print:p-0 print:border-none print:shadow-none">
              {activeTab === 'dashboard' && (
                <DashboardView
                  slots={slots}
                  students={students}
                  teachers={teachers}
                  logsByMonth={logsByMonth}
                  subsByMonth={subsByMonth}
                  onUpdateSubs={(m, s) => setSubsByMonth((prev) => ({ ...prev, [m]: s }))}
                  dashDate={dashDate}
                  onUpdateDashDate={handleUpdateDashDate}
                  dailyAdjustments={dailyAdjustments}
                  isUnlocked={isUnlocked}
                  onRequireUnlock={() => {
                    setPendingTab(null);
                    setPinInput('');
                    setPinError('');
                    setShowUnlockModal(true);
                  }}
                />
              )}

              {activeTab === 'timetable' && (
                <TimetableView
                  slots={slots}
                  students={students}
                  teachers={teachers}
                  onUpdateSlots={setSlots}
                />
              )}

              {activeTab === 'adjustments' && (
                <AdjustmentsView
                  slots={slots}
                  students={students}
                  teachers={teachers}
                  onUpdateSlots={setSlots}
                  dailyAdjustments={dailyAdjustments}
                  onUpdateAdjustments={handleUpdateAdjustments}
                  defaultDate={dashDate}
                />
              )}

              {activeTab === 'dailylog' && (
                <DailyLogView
                  slots={slots}
                  students={students}
                  teachers={teachers}
                  logDate={logDate}
                  onUpdateLogDate={handleUpdateLogDate}
                  logsByMonth={logsByMonth}
                  subsByMonth={subsByMonth}
                  onUpdateLogs={(m, l) => setLogsByMonth((prev) => ({ ...prev, [m]: l }))}
                  onUpdateSubs={(m, s) => setSubsByMonth((prev) => ({ ...prev, [m]: s }))}
                  dailyAdjustments={dailyAdjustments}
                />
              )}

              {activeTab === 'report' && (
                <MonthlyReportView
                  students={students}
                  teachers={teachers}
                  slots={slots}
                  logsByMonth={logsByMonth}
                  subsByMonth={subsByMonth}
                  schoolLogo={schoolLogo}
                />
              )}

              {activeTab === 'student_absence' && (
                <StudentAbsenceView
                  slots={slots}
                  students={students}
                  teachers={teachers}
                  dailyAdjustments={dailyAdjustments}
                  logDate={logDate}
                />
              )}

              {activeTab === 'profiles' && (
                <StudentProfilesView
                  students={students}
                  teachers={teachers}
                  slots={slots}
                  studentProfiles={studentProfiles}
                  onUpdateProfiles={setStudentProfiles}
                  schoolLogo={schoolLogo}
                />
              )}

              {activeTab === 'people' && (
                <PeopleView
                  teachers={teachers}
                  students={students}
                  slots={slots}
                  onUpdateTeachers={setTeachers}
                  onUpdateStudents={setStudents}
                  onDownloadTimetable={handleDownloadTeacherTimetable}
                />
              )}

              {activeTab === 'teacher_attendance' && (
                <TeacherAttendanceView />
              )}

              {activeTab === 'manage_attendance' && (
                <ManageAttendanceView />
              )}
            </div>

            <p className="text-center text-xs text-slate-400 font-semibold mt-6">
              All changes are synchronized in real-time. Shared database instance &copy; Islamic Education Center.
            </p>
          </main>
        </div>

      </div>

      {/* Unlock Passcode Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] no-print">
          <div className="bg-white rounded-xl border-2 border-slate-300 p-6 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <Lock size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base serif-title">Admin Passcode Required</h3>
                <p className="text-xs text-slate-500">Accessing administrative/scheduling tools</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Enter Admin PIN</label>
              <input
                type="password"
                className="w-full px-3 py-2 border-2 border-slate-300 rounded focus:outline-none focus:border-blue-500 text-center tracking-widest text-lg font-mono font-bold bg-white"
                placeholder="••••"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockAttempt()}
                autoFocus
              />
              {pinError && <p className="text-xs font-semibold text-red-500">{pinError}</p>}
            </div>
            
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleUnlockAttempt}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm cursor-pointer flex justify-center items-center gap-1"
              >
                <Key size={14} /> Unlock
              </button>
              <button
                onClick={() => {
                  setShowUnlockModal(false);
                  setPendingTab(null);
                  setPinInput('');
                  setPinError('');
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branding & Security Settings Modal */}
      {showPinSettings && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] no-print">
          <div className="bg-white rounded-xl border-2 border-slate-300 p-6 w-full max-w-md shadow-xl space-y-6">
            <div className="flex items-center gap-3 border-b pb-3">
              <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                <Settings size={22} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base serif-title">Branding & Admin Settings</h3>
                <p className="text-xs text-slate-500">Configure school branding, reports logo, and administrative access</p>
              </div>
            </div>

            {/* Logo Branding Section */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Image size={14} className="text-slate-500" />
                School Logo
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Upload your school or center logo. This logo will display on the sidebar, mobile header, and at the top of all printed attendance and progress reports.
              </p>

              <div className="flex items-center gap-4 pt-1">
                {schoolLogo ? (
                  <div className="relative group shrink-0">
                    <img
                      src={schoolLogo}
                      alt="Current Logo"
                      className="w-16 h-16 object-contain rounded border bg-white p-1 shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      onClick={handleRemoveLogo}
                      className="absolute -top-1.5 -right-1.5 p-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-full border border-red-200 shadow-xs cursor-pointer transition-colors"
                      title="Remove logo"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-slate-100/50 text-slate-400 shrink-0">
                    <Image size={24} />
                    <span className="text-[9px] mt-1">No Logo</span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded text-xs font-semibold text-slate-700 cursor-pointer shadow-xs transition-colors">
                    <Upload size={12} className="text-slate-400" />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Supports PNG, JPG, or SVG up to 2MB. Recommendation: transparent background.
                  </p>
                </div>
              </div>
            </div>

            {/* PIN Settings Section */}
            <div className="space-y-3">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Key size={14} className="text-slate-500" />
                Admin Passcode
              </h4>
              
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">New Admin PIN (Min. 4 chars)</label>
                  <input
                    type="text"
                    maxLength={8}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-center tracking-widest text-base font-mono font-bold bg-white"
                    placeholder="e.g. 5678"
                    value={newPinInput}
                    onChange={(e) => setNewPinInput(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleChangePin}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-xs cursor-pointer h-[34px] shadow-xs"
                >
                  Update PIN
                </button>
              </div>
            </div>
            
            <div className="flex justify-end border-t pt-3">
              <button
                onClick={() => {
                  setShowPinSettings(false);
                  setNewPinInput('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs cursor-pointer shadow-xs"
              >
                Done / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
