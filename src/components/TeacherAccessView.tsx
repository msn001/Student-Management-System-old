import React, { useState, useEffect } from 'react';
import {
  AttendanceService,
  AttendanceTeacher,
  AttendanceRecord,
  AttendanceSettings,
  calculateDistanceMeters,
  parseTimeToMinutes
} from '../lib/attendanceService';
import { Fingerprint, CheckCircle2, AlertTriangle, MapPin, RefreshCw, Clock, Lock, KeyRound, User, LogIn, LogOut } from 'lucide-react';

interface TeacherAccessViewProps {
  mainTeachers?: { id: string; name: string; subject?: string }[];
}

export default function TeacherAccessView({ mainTeachers = [] }: TeacherAccessViewProps) {
  const [teachers, setTeachers] = useState<AttendanceTeacher[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings>({
    latitude: 31.5204,
    longitude: 74.3587,
    maxDistanceMeters: 50,
    defaultExpectedTime: '08:00',
  });

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [verifiedTeacher, setVerifiedTeacher] = useState<AttendanceTeacher | null>(null);

  // GPS state
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);

  // Today's record for verified teacher
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Initial setup
  useEffect(() => {
    loadData();
    getGPSLocation();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const setts = await AttendanceService.getSettings();
      setSettings(setts);

      let tList = await AttendanceService.getTeachers();
      if (mainTeachers && mainTeachers.length > 0) {
        tList = await AttendanceService.syncMainTeachers(mainTeachers);
      }
      setTeachers(tList);
    } catch (e) {
      console.error('Error loading teacher access data:', e);
    } finally {
      setLoading(false);
    }
  };

  const getGPSLocation = () => {
    setIsLocating(true);
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLat(lat);
        setUserLng(lng);

        const dist = calculateDistanceMeters(lat, lng, settings.latitude, settings.longitude);
        setDistanceMeters(dist);
        setIsLocating(false);
      },
      (err) => {
        setGpsError('Unable to retrieve GPS location. Please allow location permissions.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleVerifyPin = () => {
    setActionMessage(null);
    if (!selectedTeacherId) {
      setActionMessage({ type: 'error', text: 'Please select your name from the list.' });
      return;
    }
    if (!pin || pin.length < 4) {
      setActionMessage({ type: 'error', text: 'Please enter a valid 4-digit PIN.' });
      return;
    }

    const t = teachers.find((item) => item.id === selectedTeacherId);
    if (!t) {
      setActionMessage({ type: 'error', text: 'Selected teacher profile not found.' });
      return;
    }

    const expectedPin = t.pin || '1234';
    if (pin.trim() === expectedPin.trim()) {
      setIsVerified(true);
      setVerifiedTeacher(t);
      loadTodayRecordForTeacher(t);
      setActionMessage({ type: 'success', text: `Welcome, ${t.name}! PIN verified successfully.` });
    } else {
      setActionMessage({ type: 'error', text: 'Incorrect PIN. Please try again or ask Admin for assistance.' });
    }
  };

  const loadTodayRecordForTeacher = async (teacher: AttendanceTeacher) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const records = await AttendanceService.getRecordsForDate(todayStr);
    const existing = records.find((r) => r.teacherId === teacher.id || r.teacherName === teacher.name);
    if (existing) {
      setTodayRecord(existing);
    } else {
      setTodayRecord(null);
    }
  };

  const isWithinGeofence = distanceMeters !== null && distanceMeters <= (settings.maxDistanceMeters || 50);

  const handleCheckIn = async () => {
    if (!verifiedTeacher) return;

    if (!isWithinGeofence && distanceMeters !== null) {
      setActionMessage({
        type: 'error',
        text: `Check-in blocked! You are ${distanceMeters}m away from school. Attendance requires being within ${settings.maxDistanceMeters || 50}m.`,
      });
      return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const formattedDisplay = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    const expected = verifiedTeacher.expectedTime || settings.defaultExpectedTime || '08:00';
    const nowMins = parseTimeToMinutes(timeStr);
    const expMins = parseTimeToMinutes(expected);
    const isLate = nowMins > expMins + 5; // 5 min grace period
    const lateMins = isLate ? nowMins - expMins : 0;

    const recordId = todayRecord?.id || `REC_${todayStr}_${verifiedTeacher.id}`;
    const newRecord: AttendanceRecord = {
      id: recordId,
      teacherId: verifiedTeacher.id,
      teacherName: verifiedTeacher.name,
      date: todayStr,
      checkIn: formattedDisplay,
      checkOut: todayRecord?.checkOut || '',
      status: isLate ? 'Late' : 'On Time',
      lateMinutes: lateMins,
      updatedAt: new Date().toISOString(),
    };

    setLoading(true);
    try {
      await AttendanceService.saveRecord(newRecord);
      setTodayRecord(newRecord);
      const statusText = isLate
        ? `Checked in at ${formattedDisplay} (LATE by ${lateMins} minutes)`
        : `Checked in at ${formattedDisplay} (ON TIME)`;
      setActionMessage({ type: 'success', text: statusText });
    } catch (e: any) {
      setActionMessage({ type: 'error', text: 'Failed to record check-in. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!verifiedTeacher || !todayRecord) return;

    if (!isWithinGeofence && distanceMeters !== null) {
      setActionMessage({
        type: 'error',
        text: `Check-out blocked! You are ${distanceMeters}m away from school. Attendance requires being within ${settings.maxDistanceMeters || 50}m.`,
      });
      return;
    }

    const now = new Date();
    const formattedDisplay = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    const updatedRecord: AttendanceRecord = {
      ...todayRecord,
      checkOut: formattedDisplay,
      updatedAt: new Date().toISOString(),
    };

    setLoading(true);
    try {
      await AttendanceService.saveRecord(updatedRecord);
      setTodayRecord(updatedRecord);
      setActionMessage({ type: 'success', text: `Checked out successfully at ${formattedDisplay}!` });
    } catch (e: any) {
      setActionMessage({ type: 'error', text: 'Failed to record check-out. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setIsVerified(false);
    setVerifiedTeacher(null);
    setSelectedTeacherId('');
    setPin('');
    setTodayRecord(null);
    setActionMessage(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 rounded-2xl p-6 md:p-8 text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start space-x-2">
            <Fingerprint className="w-8 h-8 text-blue-300" />
            <h1 className="text-2xl font-black tracking-tight">Teacher Check-In Kiosk</h1>
          </div>
          <p className="text-blue-100 text-sm">
            Quick PIN Verification & GPS Location Check (Required within {settings.maxDistanceMeters || 50}m radius)
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-center border border-white/20">
          <div className="text-xs text-blue-200 uppercase font-semibold">Today's Date</div>
          <div className="text-lg font-bold">
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* GPS Location Status Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className={`p-3 rounded-xl shrink-0 ${
            isLocating
              ? 'bg-blue-50 text-blue-600'
              : isWithinGeofence
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-amber-50 text-amber-600'
          }`}>
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              School GPS Geofence Status
              {isWithinGeofence && (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                  Verified In Range
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isLocating ? (
                'Detecting your GPS location...'
              ) : gpsError ? (
                <span className="text-amber-600 font-medium">{gpsError}</span>
              ) : distanceMeters !== null ? (
                <span>
                  Current distance: <strong className="text-slate-800">{distanceMeters} meters</strong> from school premise. Maximum allowed is{' '}
                  <strong className="text-slate-800">{settings.maxDistanceMeters || 50} meters</strong>.
                </span>
              ) : (
                'GPS position required to check in.'
              )}
            </p>
          </div>
        </div>

        <button
          onClick={getGPSLocation}
          disabled={isLocating}
          className="inline-flex items-center space-x-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
          <span>Refresh Location</span>
        </button>
      </div>

      {/* Action Notification Box */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border flex items-center space-x-3 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : actionMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Verification Step or Active Kiosk Step */}
      {!isVerified ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
              <KeyRound className="w-5 h-5 text-blue-600" />
              <span>Step 1: Select Profile & Enter 4-Digit PIN</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">Select your teacher name and enter your personal attendance security PIN.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Teacher Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Select Your Name
              </label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedTeacherId}
                  onChange={(e) => {
                    setSelectedTeacherId(e.target.value);
                    setActionMessage(null);
                  }}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">-- Choose Teacher Profile --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.subject ? `(${t.subject})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* PIN Entry */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Enter 4-Digit Security PIN
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  maxLength={6}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setActionMessage(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerifyPin();
                  }}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold tracking-widest text-slate-800 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleVerifyPin}
              disabled={!selectedTeacherId || !pin}
              className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Verify & Continue</span>
            </button>
          </div>
        </div>
      ) : (
        /* Verified Teacher Check-In / Check-Out Dashboard */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-5 gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs">
                {verifiedTeacher?.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-800">{verifiedTeacher?.name}</h2>
                <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                  <span className="font-medium text-slate-600">{verifiedTeacher?.subject || 'Teacher'}</span>
                  <span>•</span>
                  <span>Target Time: <strong>{verifiedTeacher?.expectedTime || settings.defaultExpectedTime || '08:00 AM'}</strong></span>
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Switch Teacher / Exit</span>
            </button>
          </div>

          {/* Attendance Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Check In Box */}
            <div className={`p-6 rounded-2xl border ${
              todayRecord?.checkIn
                ? 'bg-slate-50 border-slate-200'
                : 'bg-emerald-50/60 border-emerald-200'
            } flex flex-col justify-between space-y-4`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Morning Check-In</span>
                  {todayRecord?.checkIn && (
                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                      DONE
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-black text-slate-800">
                    {todayRecord?.checkIn ? todayRecord.checkIn : 'Not Checked In Yet'}
                  </div>
                  {todayRecord?.status && (
                    <div className="mt-1 text-xs font-semibold text-slate-600">
                      Status: <span className={todayRecord.status === 'Late' ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                        {todayRecord.status}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {!todayRecord?.checkIn ? (
                <button
                  onClick={handleCheckIn}
                  disabled={loading || (!isWithinGeofence && distanceMeters !== null)}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{loading ? 'Recording...' : 'Check In Now'}</span>
                </button>
              ) : (
                <div className="text-xs text-slate-400 font-medium italic">Check-in recorded for today.</div>
              )}
            </div>

            {/* Check Out Box */}
            <div className={`p-6 rounded-2xl border ${
              todayRecord?.checkOut
                ? 'bg-slate-50 border-slate-200'
                : todayRecord?.checkIn
                ? 'bg-blue-50/60 border-blue-200'
                : 'bg-slate-50 border-slate-200 opacity-60'
            } flex flex-col justify-between space-y-4`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Evening Check-Out</span>
                  {todayRecord?.checkOut && (
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                      COMPLETED
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-black text-slate-800">
                    {todayRecord?.checkOut ? todayRecord.checkOut : 'Not Checked Out Yet'}
                  </div>
                </div>
              </div>

              {todayRecord?.checkIn && !todayRecord?.checkOut ? (
                <button
                  onClick={handleCheckOut}
                  disabled={loading || (!isWithinGeofence && distanceMeters !== null)}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{loading ? 'Recording...' : 'Check Out Now'}</span>
                </button>
              ) : todayRecord?.checkOut ? (
                <div className="text-xs text-slate-400 font-medium italic">Check-out completed for today.</div>
              ) : (
                <div className="text-xs text-slate-400 font-medium italic">Check in first before checking out.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
