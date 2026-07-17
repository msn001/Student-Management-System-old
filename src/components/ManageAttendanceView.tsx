import React, { useState, useEffect } from 'react';
import { AttendanceService, AttendanceTeacher, AttendanceRecord } from '../lib/attendanceService';
import { UserCheck, Plus, Trash2, Edit2, X, Check, AlertTriangle, Printer, User, QrCode, ClipboardList } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function ManageAttendanceView() {
  const [activeSubTab, setActiveSubTab] = useState<'teachers' | 'report'>('teachers');
  const [teachers, setTeachers] = useState<AttendanceTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Add Teacher form state
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newPin, setNewPin] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addSuccess, setAddSuccess] = useState('');
  const [addError, setAddError] = useState('');

  // Local storage/memory cache for PINs of newly created teachers in this session (as the server doesn't return PINs back for safety)
  const [sessionPins, setSessionPins] = useState<Record<string, string>>({});

  // QR Code base URL state
  const [baseUrl, setBaseUrl] = useState(() => {
    return window.location.href.split('?')[0];
  });

  // Report state
  const [reportTeacherId, setReportTeacherId] = useState('all');
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportRecords, setReportRecords] = useState<AttendanceRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  // Edit Record Modal state
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Load teachers
  const loadTeachers = async () => {
    setLoading(true);
    setError('');
    try {
      const fetched = await AttendanceService.getTeachers();
      setTeachers(fetched);
    } catch (err: any) {
      setError(err.message || 'Failed to load teachers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  // Fetch report data
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

  // Add Teacher Action
  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');

    const trimmedName = newName.trim();
    const trimmedSubject = newSubject.trim();
    const trimmedPin = newPin.trim();

    if (!trimmedName) {
      setAddError('Full name is required.');
      return;
    }
    if (!/^\d{4}$/.test(trimmedPin)) {
      setAddError('PIN must be exactly 4 digits.');
      return;
    }

    setAddLoading(true);
    try {
      const res = await AttendanceService.addTeacher(trimmedName, trimmedSubject, trimmedPin);
      
      // Store in session pins so we can display it temporarily in the list
      setSessionPins((prev) => ({ ...prev, [res.id]: trimmedPin }));

      // Append to local teachers state
      const newTeacher: AttendanceTeacher = {
        id: res.id,
        name: trimmedName,
        subject: trimmedSubject,
        pin: trimmedPin,
      };

      setTeachers((prev) => [...prev, newTeacher]);
      
      // Reset inputs
      setNewName('');
      setNewSubject('');
      setNewPin('');
      setAddSuccess(`${trimmedName} added successfully! Remember PIN: ${trimmedPin}`);
    } catch (err: any) {
      setAddError(err.message || 'Failed to add teacher.');
    } finally {
      setAddLoading(false);
    }
  };

  // Remove Teacher Action
  const handleRemoveTeacher = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name}? Attendance logs will be kept but they will not be able to clock in anymore.`)) {
      return;
    }

    try {
      await AttendanceService.removeTeacher(id);
      setTeachers((prev) => prev.filter((t) => t.id !== id));
      alert(`${name} removed successfully.`);
    } catch (err: any) {
      alert(`Error removing teacher: ${err.message}`);
    }
  };

  // Edit Record Modal Triggers
  const handleOpenEdit = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setEditCheckIn(rec.checkIn || '');
    setEditCheckOut(rec.checkOut || '');
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    if (!editCheckIn) {
      setEditError('Check-in time is required.');
      return;
    }

    setEditLoading(true);
    setEditError('');
    try {
      await AttendanceService.editRecord(editingRecord.id, editCheckIn, editCheckOut);
      
      // Update local report list state
      setReportRecords((prev) =>
        prev.map((r) =>
          r.id === editingRecord.id ? { ...r, checkIn: editCheckIn, checkOut: editCheckOut } : r
        )
      );

      setEditingRecord(null);
      alert('Attendance record updated successfully.');
    } catch (err: any) {
      setEditError(err.message || 'Failed to update attendance record.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!editingRecord) return;
    if (!confirm('Are you sure you want to delete this attendance record? This cannot be undone.')) {
      return;
    }

    setEditLoading(true);
    setEditError('');
    try {
      await AttendanceService.deleteRecord(editingRecord.id);
      
      // Remove from local list state
      setReportRecords((prev) => prev.filter((r) => r.id !== editingRecord.id));
      setEditingRecord(null);
      alert('Attendance record deleted successfully.');
    } catch (err: any) {
      setEditError(err.message || 'Failed to delete attendance record.');
    } finally {
      setEditLoading(false);
    }
  };

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
      {/* Sub-navigation tabs */}
      <div className="flex border-b border-slate-200 no-print print:hidden">
        <button
          onClick={() => setActiveSubTab('teachers')}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'teachers'
              ? 'border-blue-600 text-blue-600 font-bold bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck size={16} /> Manage Teachers & QR Kiosk
        </button>
        <button
          onClick={() => setActiveSubTab('report')}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'report'
              ? 'border-blue-600 text-blue-600 font-bold bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardList size={16} /> Full Reports & Adjustments
        </button>
      </div>

      {activeSubTab === 'teachers' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Add Teacher Column */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h4 className="serif-title font-semibold text-base text-slate-800 border-b pb-2 mb-4 flex items-center gap-1.5">
                  <Plus size={16} className="text-blue-600" /> Add New Teacher
                </h4>
                <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                  Register a new teacher. A unique 4-digit PIN allows them to clock in/out at the kiosk.
                </p>

                <form onSubmit={handleAddTeacher} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ali Khan"
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs font-medium"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Subject</label>
                    <input
                      type="text"
                      placeholder="e.g. Mathematics"
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs font-medium"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">4-Digit PIN</label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="e.g. 1234"
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs font-mono font-bold tracking-widest text-center"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>

                  {addError && (
                    <div className="p-3 bg-red-50 text-red-600 text-xs font-semibold rounded-lg border border-red-100 flex items-center gap-1">
                      <AlertTriangle size={14} /> {addError}
                    </div>
                  )}

                  {addSuccess && (
                    <div className="p-3 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100 leading-relaxed">
                      {addSuccess}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={addLoading}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded hover:shadow-xs transition-all flex justify-center items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
                  >
                    {addLoading ? (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-white animate-spin" />
                    ) : (
                      <>
                        <Plus size={14} /> Add Teacher
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Teacher List & QR Code Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Teacher Directory Table */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h4 className="serif-title font-semibold text-base text-slate-800 border-b pb-2 mb-4 flex items-center justify-between">
                <span>Registered Teacher Directory</span>
                <span className="text-xs bg-slate-100 px-2.5 py-0.5 rounded-full text-slate-600 font-bold">
                  {teachers.length} registered
                </span>
              </h4>

              {loading ? (
                <div className="text-center py-12 text-slate-400 text-xs gap-2 flex flex-col items-center">
                  <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                  Fetching roster...
                </div>
              ) : teachers.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No teachers registered in the attendance database.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="p-3">Name</th>
                        <th className="p-3">Subject</th>
                        <th className="p-3 text-center">PIN</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map((t) => (
                        <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/30">
                          <td className="p-3 font-semibold text-slate-800">{t.name}</td>
                          <td className="p-3 text-slate-500">{t.subject || '—'}</td>
                          <td className="p-3 text-center font-mono font-bold text-slate-600 tracking-widest">
                            {sessionPins[t.id] || t.pin || '••••'}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleRemoveTeacher(t.id, t.name)}
                              className="p-1 px-2.5 bg-red-50 text-[10px] font-bold text-red-600 rounded-lg hover:bg-red-100 transition-colors cursor-pointer inline-flex items-center gap-0.5"
                            >
                              <Trash2 size={10} /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-slate-400 leading-normal p-3 bg-slate-50 rounded-xl border border-slate-100 mt-4 italic">
                    Note: To maximize system security, PINs are only shown right after adding a teacher. Once you leave this page or refresh, they will be masked.
                  </p>
                </div>
              )}
            </div>

            {/* QR Kiosk Generator */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h4 className="serif-title font-semibold text-base text-slate-800 border-b pb-2 mb-3 flex items-center gap-1.5">
                <QrCode size={16} className="text-blue-500" /> Kiosk Access QR Code
              </h4>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                There is only **one** QR code for everyone. Print and post this code on the wall. When teachers scan it, the clock-in kiosk app will load on their mobile phones automatically.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Deployment URL address</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded focus:border-blue-500 bg-white focus:outline-none text-xs font-mono text-slate-600"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded text-xs cursor-pointer flex justify-center items-center gap-1"
                  >
                    <Printer size={13} /> Print Kiosk Flyer
                  </button>
                </div>

                <div className="flex flex-col items-center bg-slate-50 p-4 border border-slate-200 rounded-2xl shadow-2xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-3xs">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(baseUrl)}`}
                      alt="Clock In Kiosk QR"
                      referrerPolicy="no-referrer"
                      className="w-[140px] h-[140px]"
                    />
                  </div>
                  <div className="text-center mt-3">
                    <span className="text-xs font-bold text-slate-700">Scan to Check In/Out</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Static shared code for all staff</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        // Reports View with pencil editing tools
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
              Loading database records...
            </div>
          ) : reportError ? (
            <div className="p-4 text-center text-xs text-red-500 bg-red-50/50 rounded-xl border border-red-100">
              <AlertTriangle size={24} className="mb-2 text-red-400 mx-auto" />
              {reportError}
            </div>
          ) : (
            // Full interactive grouped reports
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
                              <th className="p-3 pr-5 text-right">Status / Edit</th>
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
                                      <td className="p-3 text-slate-800 font-medium">{r.checkIn || '—'}</td>
                                      <td className="p-3 text-slate-800 font-medium">{r.checkOut || '—'}</td>
                                      <td className="p-3 font-mono text-slate-600 font-medium">{hoursVal}</td>
                                      <td className="p-3 pr-5 text-right flex items-center justify-end gap-2 h-11">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                          isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                        }`}>
                                          {isComplete ? 'Complete' : 'Open'}
                                        </span>
                                        <button
                                          onClick={() => handleOpenEdit(r)}
                                          className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 cursor-pointer transition-colors"
                                          title="Adjust times or delete"
                                        >
                                          <Edit2 size={12} />
                                        </button>
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
                                    <td className="p-3 pr-5 text-right">
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

      {/* Edit Record Overlay Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="serif-title font-bold text-slate-800 text-base">Adjust Record Times</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Date: {editingRecord.date}</p>
              </div>
              <button
                onClick={() => setEditingRecord(null)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Check-In</label>
                <input
                  type="time"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white"
                  value={editCheckIn}
                  onChange={(e) => setEditCheckIn(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Check-Out</label>
                <input
                  type="time"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white"
                  value={editCheckOut}
                  onChange={(e) => setEditCheckOut(e.target.value)}
                />
              </div>
            </div>

            {editError && (
              <div className="p-2.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg border border-red-100 flex items-center gap-1">
                <AlertTriangle size={14} /> {editError}
              </div>
            )}

            <div className="flex justify-between items-center pt-2 gap-2">
              <button
                onClick={handleDeleteRecord}
                disabled={editLoading}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-0.5"
              >
                <Trash2 size={12} /> Delete
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingRecord(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editLoading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-0.5 disabled:opacity-50"
                >
                  {editLoading ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-white animate-spin" />
                  ) : (
                    <>
                      <Check size={12} /> Save
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
