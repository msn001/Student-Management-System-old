import React, { useState, useEffect } from 'react';
import { Teacher, Student, ClassSlot, LessonEntry, StudentProfile } from './types';
import { StorageService } from './lib/storage';
import DashboardView from './components/DashboardView';
import TimetableView from './components/TimetableView';
import DailyLogView from './components/DailyLogView';
import MonthlyReportView from './components/MonthlyReportView';
import StudentProfilesView from './components/StudentProfilesView';
import PeopleView from './components/PeopleView';
import AdjustmentsView from './components/AdjustmentsView';
import { BookOpen, Calendar, Clock, Clipboard, Users, GraduationCap, Menu, X, Lock, Unlock, Settings, Key, CalendarClock } from 'lucide-react';

const LOCKED_TABS = ['timetable', 'people'];

const SCHOOL_DAY_CUTOFF_HOUR = 6;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Calendar },
  { id: 'timetable', label: 'Weekly Timetable', icon: Clock },
  { id: 'adjustments', label: 'Daily Adjustments', icon: CalendarClock },
  { id: 'dailylog', label: 'Daily Log', icon: Clipboard },
  { id: 'report', label: 'Monthly Report', icon: BookOpen },
  { id: 'profiles', label: 'Student Profiles', icon: GraduationCap },
  { id: 'people', label: 'Teachers & Students', icon: Users },
];

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard Overview',
  timetable: 'Weekly Timetable',
  adjustments: 'Daily Adjustments & Makeup Classes',
  dailylog: 'Daily Log Registers',
  report: 'Monthly Progress Report',
  profiles: 'Student Learning Profiles',
  people: 'Teachers & Students Directory',
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Shared application state
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [slots, setSlots] = useState<ClassSlot[]>([]);
  const [studentProfiles, setStudentProfiles] = useState<Record<string, StudentProfile>>({});
  const [dailyAdjustments, setDailyAdjustments] = useState<Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>>({});

  // Monthly and substitute buffers (keyed by "YYYY-MM")
  const [logsByMonth, setLogsByMonth] = useState<Record<string, Record<string, Record<string, LessonEntry>>>>({});
  const [subsByMonth, setSubsByMonth] = useState<Record<string, Record<string, Record<string, string>>>>({});

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
      if (pendingTab) {
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
    setShowPinSettings(false);
    alert('PIN updated successfully!');
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

        setTeachers(loadedTeachers);
        setStudents(loadedStudents);
        setSlots(loadedSlots);
        setStudentProfiles(loadedProfiles);
        setDailyAdjustments(loadedAdjustments);

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
        <div className="font-mono text-xs text-slate-400">Loading Lesson Register…</div>
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
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-sm text-white font-serif">
              L
            </div>
            <span className="font-bold text-base tracking-tight">Lesson<span className="text-blue-500 font-extrabold">Register</span></span>
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
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Lesson<span className="text-blue-500">Register</span></h1>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-extrabold">Admin Dashboard</p>
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
              
              <div className="flex gap-2">
                {isUnlocked && (
                  <button 
                    onClick={() => {
                      setNewPinInput('');
                      setShowPinSettings(true);
                    }}
                    className="p-1 hover:text-white text-slate-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                    title="Change Passcode"
                  >
                    <Settings size={14} />
                  </button>
                )}
                
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
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 min-h-[460px]">
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
                />
              )}

              {activeTab === 'profiles' && (
                <StudentProfilesView
                  students={students}
                  teachers={teachers}
                  studentProfiles={studentProfiles}
                  onUpdateProfiles={setStudentProfiles}
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
            </div>

            <p className="text-center text-xs text-slate-400 font-semibold mt-6">
              All changes are synchronized in real-time. Shared database instance &copy; Lesson Register.
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

      {/* PIN Change Settings Modal */}
      {showPinSettings && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] no-print">
          <div className="bg-white rounded-xl border-2 border-slate-300 p-6 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-100 text-slate-700 rounded-lg">
                <Settings size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base serif-title">Update Admin Passcode</h3>
                <p className="text-xs text-slate-500">Secure access to Teacher, Student, & Timetable settings</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">New Admin PIN (Min. 4 chars)</label>
              <input
                type="text"
                maxLength={8}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded focus:outline-none focus:border-blue-500 text-center tracking-widest text-lg font-mono font-bold bg-white"
                placeholder="e.g. 5678"
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChangePin()}
                autoFocus
              />
            </div>
            
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleChangePin}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm cursor-pointer"
              >
                Save PIN
              </button>
              <button
                onClick={() => {
                  setShowPinSettings(false);
                  setNewPinInput('');
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
