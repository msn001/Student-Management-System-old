import React, { useState, useEffect } from 'react';
import { AttendanceService, AttendanceTeacher, AttendanceRecord, AttendanceSettings, DEFAULT_ATTENDANCE_SETTINGS, getDailyPasscode, getDistanceInMeters } from '../lib/attendanceService';
import { Clock, Fingerprint, Calendar, ClipboardList, RefreshCw, AlertTriangle, Printer, LogIn, ChevronRight, User, MapPin, Lock, KeyRound, Smartphone } from 'lucide-react';
import { formatTimeToAMPM } from '../lib/utils';
import { StorageService } from '../lib/storage';


const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface ScanResult {
  type: 'in' | 'out' | 'info' | 'err';
  icon: string;
  name: string;
  time?: string;
  status: string;
}

export default function TeacherAttendanceView() {
  const [activeSubTab, setActiveSubTab] = useState<'live' | 'report'>('live');
  const [teachers, setTeachers] = useState<AttendanceTeacher[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Security settings & state
  const [securitySettings, setSecuritySettings] = useState<AttendanceSettings>(DEFAULT_ATTENDANCE_SETTINGS);
  const [dailyPasscodeInput, setDailyPasscodeInput] = useState('');
  const [isThisKiosk, setIsThisKiosk] = useState(false);

  // Clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  // PIN Pad state
  const [pinBuffer, setPinBuffer] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Report filters and results state
  const [reportTeacherId, setReportTeacherId] = useState('all');
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportRecords, setReportRecords] = useState<AttendanceRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  // 1. Tick Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Fetch initial data (teachers + today's attendance logs + security settings)
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      // Check if this device is authorized as central kiosk
      const isKiosk = localStorage.getItem('is_authorized_kiosk') === 'true';
      setIsThisKiosk(isKiosk);

      const [fetchedTeachers, fetchedSettings] = await Promise.all([
        AttendanceService.getTeachers(),
        StorageService.loadKey<AttendanceSettings>('attendanceSettings', DEFAULT_ATTENDANCE_SETTINGS)
      ]);
      setTeachers(fetchedTeachers);
      setSecuritySettings(fetchedSettings);

      // Fetch today's records (and yesterday's for night shifts, following the HTML structure)
      const nowStr = getLocalDateString();
      const ydStr = getLocalDateString(new Date(Date.now() - 86400000));
      
      const [r1, r2] = await Promise.all([
        AttendanceService.getRecords(nowStr.slice(0, 7)),
        AttendanceService.getRecords(ydStr.slice(0, 7))
      ]);

      const merged = [...r2, ...r1];
      const seenIds = new Set<string>();
      const uniques = merged.filter((r) => {
        if (seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      });

      setTodayRecords(uniques);
    } catch (err: any) {
      setError(err.message || 'Failed to load teachers list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Keyboard support for PIN Pad
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeSubTab !== 'live' || pinBusy || scanResult) return;
      if (/^[0-9]$/.test(e.key)) {
        handlePinPress(e.key);
      } else if (e.key === 'Backspace') {
        handlePinBack();
      } else if (e.key === 'Escape') {
        handlePinClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinBuffer, pinBusy, scanResult, activeSubTab]);

  // Helper date conversions
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getLocalTimeString = (d = new Date()) => {
    return d.toTimeString().slice(0, 5);
  };

  // PIN Actions
  const handlePinPress = (num: string) => {
    if (pinBuffer.length >= 4) return;
    const newBuf = pinBuffer + num;
    setPinBuffer(newBuf);
    if (newBuf.length === 4) {
      submitPin(newBuf);
    }
  };

  const handlePinBack = () => {
    setPinBuffer((prev) => prev.slice(0, -1));
  };

  const handlePinClear = () => {
    setPinBuffer('');
  };

  const submitPin = async (pin: string) => {
    setPinBusy(true);

    // 1. Check Mobile Lockout Constraint
    if (securitySettings.lockMobileCheckIn && !isThisKiosk) {
      setScanResult({
        type: 'err',
        icon: '🚫',
        name: 'Check-In Restricted',
        status: 'Direct mobile check-ins are disabled. Use the physical kiosk at reception.',
      });
      setPinBuffer('');
      setPinBusy(false);
      setTimeout(() => setScanResult(null), 4000);
      return;
    }

    // 2. Validate Noticeboard Passcode Constraint
    if (securitySettings.dailyPasscodeEnabled && !isThisKiosk) {
      const todayStr = getLocalDateString(new Date());
      const expectedCode = getDailyPasscode(todayStr, securitySettings.dailyPasscodeSeed);
      if (dailyPasscodeInput !== expectedCode) {
        setScanResult({
          type: 'err',
          icon: '🔑',
          name: 'Invalid Passcode',
          status: 'Noticeboard passcode is incorrect. Check the board and retry.',
        });
        setPinBuffer('');
        setPinBusy(false);
        setTimeout(() => setScanResult(null), 3500);
        return;
      }
    }

    // 3. Validate GPS Geofencing Constraint
    if (securitySettings.geofencingEnabled && !isThisKiosk) {
      setScanResult({
        type: 'info',
        icon: '📡',
        name: 'Verifying GPS Location',
        status: 'Retrieving your coordinates...',
      });

      if (!navigator.geolocation) {
        setScanResult({
          type: 'err',
          icon: '📍',
          name: 'GPS Unsupported',
          status: 'Browser location is unsupported. Check in on the reception kiosk.',
        });
        setPinBuffer('');
        setPinBusy(false);
        setTimeout(() => setScanResult(null), 3500);
        return;
      }

      try {
        const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });

        const distance = getDistanceInMeters(
          coords.latitude,
          coords.longitude,
          securitySettings.schoolLatitude,
          securitySettings.schoolLongitude
        );

        if (distance > securitySettings.allowedRadius) {
          setScanResult({
            type: 'err',
            icon: '🚫',
            name: 'Out of Range',
            status: `Blocked: You are ${Math.round(distance)}m from the center. (Allowed: ${securitySettings.allowedRadius}m)`,
          });
          setPinBuffer('');
          setPinBusy(false);
          setTimeout(() => setScanResult(null), 5000);
          return;
        }
      } catch (err: any) {
        setScanResult({
          type: 'err',
          icon: '❌',
          name: 'GPS Verification Failed',
          status: `Location access denied or unavailable: ${err.message || 'Check browser permissions'}.`,
        });
        setPinBuffer('');
        setPinBusy(false);
        setTimeout(() => setScanResult(null), 4000);
        return;
      }
    }

    // All anti-fraud constraints passed. Proceed with check-in/out.
    setScanResult({
      type: 'info',
      icon: '⏳',
      name: 'Verifying PIN...',
      status: 'Connecting to server',
    });

    const now = new Date();
    const dateStr = getLocalDateString(now);
    const timeStr = getLocalTimeString(now);

    try {
      const res = await AttendanceService.scan(pin, dateStr, timeStr);
      
      if (res.action === 'checkIn') {
        // Add to active today records list
        const newRecord: AttendanceRecord = {
          id: res.recordId,
          teacherId: findTeacherIdByName(res.teacher, teachers),
          date: res.date,
          checkIn: res.time,
          checkOut: '',
        };
        setTodayRecords((prev) => [...prev, newRecord]);
        setScanResult({
          type: 'in',
          icon: '✅',
          name: res.teacher,
          time: res.time,
          status: 'Checked in successfully',
        });
      } else {
        // Update check-out in records list
        setTodayRecords((prev) =>
          prev.map((r) => (r.id === res.recordId ? { ...r, checkOut: res.time } : r))
        );
        const overnight = res.date !== dateStr;
        setScanResult({
          type: 'out',
          icon: '👋',
          name: res.teacher,
          time: res.time,
          status: 'Checked out' + (overnight ? ' (overnight shift)' : ''),
        });
      }

      setPinBuffer('');
      setTimeout(() => {
        setScanResult(null);
      }, 2500);
    } catch (err: any) {
      setScanResult({
        type: 'err',
        icon: '❌',
        name: 'Incorrect PIN',
        status: err.message || 'Please try again',
      });
      setTimeout(() => {
        setPinBuffer('');
        setScanResult(null);
      }, 1500);
    } finally {
      setPinBusy(false);
    }
  };


  const findTeacherIdByName = (name: string, list: AttendanceTeacher[]): string => {
    const t = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return t ? t.id : name;
  };

  // Report Loading
  const fetchReport = async () => {
    setReportLoading(true);
    setReportError('');
    try {
      const monthPrefix = `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}`;
      const records = await AttendanceService.getRecords(monthPrefix);
      setReportRecords(records);
    } catch (err: any) {
      setReportError(err.message || 'Failed to fetch report records.');
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'report') {
      fetchReport();
    }
  }, [activeSubTab, reportMonth, reportYear]);

  // Calculations for Report stats
  const calculateMins = (a: string, b: string): number => {
    if (!a || !b) return 0;
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    const m = (bh * 60 + bm) - (ah * 60 + am);
    return m < 0 ? m + 1440 : m;
  };

  const formatMins = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  };

  return (
    <div className="space-y-6">
      {/* Tab Selector */}
      <div className="flex border-b border-slate-200 no-print print:hidden">
        <button
          onClick={() => setActiveSubTab('live')}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'live'
              ? 'border-blue-600 text-blue-600 font-bold bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock size={16} /> Live Clock Kiosk
        </button>
        <button
          onClick={() => setActiveSubTab('report')}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'report'
              ? 'border-blue-600 text-blue-600 font-bold bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardList size={16} /> Read-Only Report
        </button>
      </div>

      {activeSubTab === 'live' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* PIN Pad Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Clock Widget */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 shadow-md text-white flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <span className="text-xs uppercase tracking-widest font-extrabold text-blue-100">Live Server Status</span>
                <div className="text-sm font-medium opacity-90 mt-1">
                  {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
              <div className="text-3xl md:text-4xl font-black font-mono tracking-tight drop-shadow-xs">
                {currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </div>
            </div>

            {/* PIN Pad Interface */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs relative overflow-hidden min-h-[380px] flex flex-col justify-center items-center">
              {scanResult ? (
                // Success / Error / Status screen
                <div className="flex flex-col items-center text-center space-y-4 animate-fadeIn">
                  <div className="text-6xl animate-bounce">{scanResult.icon}</div>
                  <div className="text-2xl font-black text-slate-800">{scanResult.name}</div>
                  {scanResult.time && (
                    <div className="font-mono text-lg font-bold text-slate-500">{formatTimeToAMPM(scanResult.time)}</div>
                  )}
                  <span
                    className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                      scanResult.type === 'in'
                        ? 'bg-green-100 text-green-700'
                        : scanResult.type === 'out'
                        ? 'bg-blue-100 text-blue-700'
                        : scanResult.type === 'err'
                        ? 'bg-red-100 text-red-700 animate-pulse'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {scanResult.status}
                  </span>
                </div>
              ) : securitySettings.lockMobileCheckIn && !isThisKiosk ? (
                // Lockout screen if mobile check-in is disabled and this is not the reception kiosk
                <div className="w-full max-w-sm flex flex-col items-center text-center space-y-5 p-4 animate-fadeIn">
                  <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center border border-red-150 shadow-2xs">
                    <Lock size={24} />
                  </div>
                  <div>
                    <h3 className="serif-title font-bold text-lg text-slate-800">Mobile Check-In Restricted</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Islamic Education Center requires all clock-ins and clock-outs to be performed on the central physical kiosk tablet at the reception desk.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 text-[10px] text-slate-400 p-3 rounded-xl w-full select-none">
                    Direct scanning/bookmarks on personal mobile phones are disabled.
                  </div>
                </div>
              ) : (
                // Standard PIN entry mode
                <div className="w-full max-w-sm flex flex-col items-center space-y-6">
                  <div className="text-center">
                    <h3 className="serif-title font-bold text-lg text-slate-800">Enter Your 4-Digit PIN</h3>
                    <p className="text-xs text-slate-500 mt-1">Check yourself in or out automatically</p>
                  </div>

                  {/* Daily Whiteboard Passcode input if enabled and not the authorized Kiosk */}
                  {securitySettings.dailyPasscodeEnabled && !isThisKiosk && (
                    <div className="w-full bg-amber-50/60 p-4 rounded-xl border border-amber-100 flex flex-col items-center space-y-2 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-amber-800">
                        <KeyRound size={13} className="text-amber-600 animate-pulse" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wider">Whiteboard Passcode Required</span>
                      </div>
                      <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                        Enter the daily 4-digit security code written on the physical whiteboard.
                      </p>
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="••••"
                        className="w-24 px-2 py-1 border border-slate-300 rounded-lg text-center font-mono font-bold tracking-widest text-slate-700 bg-white shadow-3xs focus:outline-none focus:border-amber-500 text-sm"
                        value={dailyPasscodeInput}
                        onChange={(e) => setDailyPasscodeInput(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  )}

                  {/* Dot slots */}
                  <div className="flex gap-4">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                          idx < pinBuffer.length
                            ? 'bg-blue-600 border-blue-600 scale-110 shadow-sm'
                            : 'border-slate-300'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Tactile Keypad */}
                  <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                      <button
                        key={digit}
                        disabled={pinBusy}
                        onClick={() => handlePinPress(digit)}
                        className="h-14 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-800 font-mono font-bold text-xl cursor-pointer flex items-center justify-center transition-all shadow-xs"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      disabled={pinBusy}
                      onClick={handlePinClear}
                      className="h-14 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 cursor-pointer flex items-center justify-center transition-all"
                    >
                      Clear
                    </button>
                    <button
                      disabled={pinBusy}
                      onClick={() => handlePinPress('0')}
                      className="h-14 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-800 font-mono font-bold text-xl cursor-pointer flex items-center justify-center transition-all shadow-xs"
                    >
                      0
                    </button>
                    <button
                      disabled={pinBusy}
                      onClick={handlePinBack}
                      className="h-14 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 cursor-pointer flex items-center justify-center transition-all"
                    >
                      ⌫
                    </button>
                  </div>

                  {/* GPS Verification Badge */}
                  {securitySettings.geofencingEnabled && !isThisKiosk && (
                    <div className="flex items-center gap-1 text-[10px] text-blue-600 font-bold bg-blue-50/50 px-2.5 py-1 rounded-full border border-blue-100 shadow-3xs select-none">
                      <MapPin size={11} /> GPS Location Verification Enabled
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Today's Activity Column */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col h-[480px]">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <h4 className="serif-title font-bold text-slate-800 text-sm">Today's Activity Log</h4>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                  title="Reload"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>

              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                  Loading activity...
                </div>
              ) : error ? (
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-xs text-red-500 bg-red-50/50 rounded-xl border border-red-100">
                  <AlertTriangle size={24} className="mb-2 text-red-400" />
                  {error}
                </div>
              ) : todayRecords.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center text-slate-400 text-xs font-medium italic">
                  No check-ins yet today.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {todayRecords
                    .slice()
                    .reverse()
                    .map((rec) => {
                      const teacher = teachers.find((t) => t.id === rec.teacherId || t.name === rec.teacherId);
                      const isComplete = !!rec.checkOut;
                      return (
                        <div
                          key={rec.id}
                          className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between gap-3 shadow-2xs hover:border-slate-200 transition-colors"
                        >
                          <div>
                            <div className="font-semibold text-sm text-slate-800">
                              {teacher ? teacher.name : rec.teacherId}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                              {formatTimeToAMPM(rec.checkIn)} {isComplete ? `→ ${formatTimeToAMPM(rec.checkOut)}` : ' (active)'}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isComplete
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-green-100 text-green-700 animate-pulse'
                            }`}
                          >
                            {isComplete ? 'Done' : 'In'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

        </div>
      ) : (
        // Read-only Report View
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-100 rounded-xl border border-slate-200 no-print print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600 uppercase">Teacher:</label>
                <select
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-500 text-xs font-semibold"
                  value={reportTeacherId}
                  onChange={(e) => setReportTeacherId(e.target.value)}
                >
                  <option value="all">All Teachers</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600 uppercase">Month:</label>
                <select
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-500 text-xs font-semibold"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600 uppercase">Year:</label>
                <select
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-500 text-xs font-semibold"
                  value={reportYear}
                  onChange={(e) => setReportYear(Number(e.target.value))}
                >
                  {[2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
            >
              <Printer size={13} /> Print Report
            </button>
          </div>

          {reportLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
              Loading attendance sheets...
            </div>
          ) : reportError ? (
            <div className="p-4 text-center text-xs text-red-500 bg-red-50/50 rounded-xl border border-red-100">
              <AlertTriangle size={24} className="mb-2 text-red-400 mx-auto" />
              {reportError}
            </div>
          ) : (
            // Output lists of reports grouped by teacher
            <div className="space-y-8">
              {teachers
                .filter((t) => reportTeacherId === 'all' || t.id === reportTeacherId)
                .map((teacher) => {
                  const tRecs = reportRecords.filter(
                    (r) => r.teacherId === teacher.id || r.teacherId === teacher.name
                  );

                  // Calculate stats
                  const daysInMonth = new Date(reportYear, reportMonth + 1, 0).getDate();
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);

                  let totalMins = 0;
                  let presentCount = 0;
                  let absentCount = 0;

                  for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const targetDate = new Date(dateStr);
                    const isPast = targetDate <= today;
                    const dayRecs = tRecs.filter((r) => r.date === dateStr);

                    if (dayRecs.length > 0) {
                      presentCount++;
                      dayRecs.forEach((r) => {
                        if (r.checkIn && r.checkOut) {
                          totalMins += calculateMins(r.checkIn, r.checkOut);
                        }
                      });
                    } else if (isPast) {
                      absentCount++;
                    }
                  }

                  return (
                    <div key={teacher.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                      {/* Header */}
                      <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance sheet</div>
                          <h4 className="serif-title font-bold text-base text-slate-800 flex items-center gap-1.5 mt-0.5">
                            <User size={16} className="text-blue-500" /> {teacher.name}
                            <span className="text-xs font-normal text-slate-500">({teacher.subject || 'No subject'})</span>
                          </h4>
                        </div>
                        <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-lg">
                          {MONTH_NAMES[reportMonth]} {reportYear}
                        </span>
                      </div>

                      {/* Summary blocks */}
                      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-slate-100">
                        <div className="p-4 border-r border-slate-100 text-center">
                          <div className="text-2xl font-black font-mono text-green-600">{presentCount}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-wider">Days Present</div>
                        </div>
                        <div className="p-4 border-r border-slate-100 text-center">
                          <div className="text-2xl font-black font-mono text-red-500">{absentCount}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-wider">Days Absent</div>
                        </div>
                        <div className="p-4 border-r border-slate-100 text-center">
                          <div className="text-2xl font-black font-mono text-slate-700">{presentCount + absentCount}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-wider">Total Days</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-2xl font-black font-mono text-blue-600">{formatMins(totalMins)}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-wider">Hours Worked</div>
                        </div>
                      </div>

                      {/* Detail Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              <th className="p-3 pl-5">Date</th>
                              <th className="p-3">Weekday</th>
                              <th className="p-3">Check-In</th>
                              <th className="p-3">Check-Out</th>
                              <th className="p-3">Total Hours</th>
                              <th className="p-3 pr-5">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: daysInMonth }).map((_, dIdx) => {
                              const dNum = dIdx + 1;
                              const dateStr = `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                              const dateObj = new Date(dateStr);
                              const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
                              const dayRecs = tRecs.filter((r) => r.date === dateStr);
                              const isPast = dateObj <= today;

                              if (dayRecs.length > 0) {
                                return dayRecs.map((r, subIdx) => {
                                  const hoursVal = r.checkIn && r.checkOut ? formatMins(calculateMins(r.checkIn, r.checkOut)) : '—';
                                  const isComplete = !!r.checkOut;
                                  return (
                                    <tr key={`${r.id}-${subIdx}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                                      <td className="p-3 pl-5 font-mono text-slate-700 font-semibold">{String(dNum).padStart(2, '0')}</td>
                                      <td className="p-3 text-slate-500">{dayName}</td>
                                      <td className="p-3 text-slate-800 font-medium">{r.checkIn ? formatTimeToAMPM(r.checkIn) : '—'}</td>
                                      <td className="p-3 text-slate-800 font-medium">{r.checkOut ? formatTimeToAMPM(r.checkOut) : '—'}</td>
                                      <td className="p-3 font-mono text-slate-600 font-medium">{hoursVal}</td>
                                      <td className="p-3 pr-5">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                          isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                        }`}>
                                          {isComplete ? 'Complete' : 'Open'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                });
                              } else {
                                return (
                                  <tr key={dateStr} className={`border-b border-slate-100 ${isPast ? 'opacity-40' : 'opacity-20'}`}>
                                    <td className="p-3 pl-5 font-mono text-slate-500">{String(dNum).padStart(2, '0')}</td>
                                    <td className="p-3 text-slate-400">{dayName}</td>
                                    <td colSpan={3} className="p-3 text-slate-400 italic">
                                      {isPast ? 'Absent' : '—'}
                                    </td>
                                    <td className="p-3 pr-5">
                                      {isPast && (
                                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600">
                                          Absent
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              }
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
