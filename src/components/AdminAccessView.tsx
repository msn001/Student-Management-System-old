import React, { useState, useEffect } from 'react';
import {
  AttendanceService,
  AttendanceTeacher,
  AttendanceRecord,
  AttendanceSettings,
  parseTimeToMinutes
} from '../lib/attendanceService';
import {
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Edit3,
  Trash2,
  Plus,
  Save,
  X,
  MapPin,
  Calendar,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Users
} from 'lucide-react';

interface AdminAccessViewProps {
  mainTeachers?: { id: string; name: string; subject?: string }[];
  onTeachersUpdated?: (updated: { id: string; name: string; subject?: string }[]) => void;
}

export default function AdminAccessView({ mainTeachers = [], onTeachersUpdated }: AdminAccessViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'records' | 'teachers' | 'location'>('records');

  // Month & Date filters
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterDate, setFilterDate] = useState<string>('');
  const [searchTeacher, setSearchTeacher] = useState<string>('');

  // Data state
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [teachers, setTeachers] = useState<AttendanceTeacher[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings>({
    latitude: 31.5204,
    longitude: 74.3587,
    maxDistanceMeters: 50,
    defaultExpectedTime: '08:00',
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Edit Modal State for Records
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editCheckIn, setEditCheckIn] = useState<string>('');
  const [editCheckOut, setEditCheckOut] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'On Time' | 'Late' | 'Absent' | 'Working'>('On Time');
  const [editDate, setEditDate] = useState<string>('');

  // Add Record Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newRecTeacherId, setNewRecTeacherId] = useState<string>('');
  const [newRecDate, setNewRecDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [newRecCheckIn, setNewRecCheckIn] = useState<string>('08:00 AM');
  const [newRecCheckOut, setNewRecCheckOut] = useState<string>('04:00 PM');

  // Teacher Edit/Add State
  const [editingTeacher, setEditingTeacher] = useState<AttendanceTeacher | null>(null);
  const [tName, setTName] = useState<string>('');
  const [tSubject, setTSubject] = useState<string>('');
  const [tPin, setTPin] = useState<string>('');
  const [tExpectedTime, setTExpectedTime] = useState<string>('08:00');

  // Location config form
  const [locLat, setLocLat] = useState<number>(31.5204);
  const [locLng, setLocLng] = useState<number>(74.3587);
  const [locRadius, setLocRadius] = useState<number>(50);

  // Custom Month Purge
  const [customMonthToDelete, setCustomMonthToDelete] = useState<string>('');

  useEffect(() => {
    loadAllData();
  }, [selectedMonth]);

  const loadAllData = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const setts = await AttendanceService.getSettings();
      setSettings(setts);
      setLocLat(setts.latitude);
      setLocLng(setts.longitude);
      setLocRadius(setts.maxDistanceMeters || 50);

      let tList = await AttendanceService.getTeachers();
      if (mainTeachers && mainTeachers.length > 0) {
        tList = await AttendanceService.syncMainTeachers(mainTeachers);
      }
      setTeachers(tList);

      const recs = await AttendanceService.getRecordsForMonth(selectedMonth);
      setRecords(recs);
    } catch (e) {
      console.error('Error loading admin attendance data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Filtered Records
  const filteredRecords = records.filter((r) => {
    if (filterDate && r.date !== filterDate) return false;
    if (searchTeacher) {
      const name = r.teacherName || teachers.find((t) => t.id === r.teacherId)?.name || '';
      if (!name.toLowerCase().includes(searchTeacher.toLowerCase())) return false;
    }
    return true;
  });

  // Summary Metrics calculation for displayed records / date
  const todayStr = filterDate || new Date().toISOString().split('T')[0];
  const todayRecords = records.filter((r) => r.date === todayStr);

  const onTimeCount = filteredRecords.filter((r) => r.status === 'On Time').length;
  const lateCount = filteredRecords.filter((r) => r.status === 'Late').length;
  const presentCount = filteredRecords.filter((r) => r.checkIn && r.checkIn.trim() !== '').length;

  // Teachers missing checkIn on selected filterDate/todayStr
  const activeTeachers = teachers.filter((t) => t.active !== false);
  const presentTeacherIds = new Set(todayRecords.filter((r) => r.checkIn).map((r) => r.teacherId));
  const absentCount = activeTeachers.filter((t) => !presentTeacherIds.has(t.id)).length;

  // Edit Record Handler
  const openEditRecord = (r: AttendanceRecord) => {
    setEditingRecord(r);
    setEditCheckIn(r.checkIn || '');
    setEditCheckOut(r.checkOut || '');
    setEditStatus(r.status || 'On Time');
    setEditDate(r.date || '');
  };

  const saveEditRecord = async () => {
    if (!editingRecord) return;
    const updated: AttendanceRecord = {
      ...editingRecord,
      checkIn: editCheckIn,
      checkOut: editCheckOut,
      status: editStatus,
      date: editDate || editingRecord.date,
      updatedAt: new Date().toISOString(),
    };

    setLoading(true);
    try {
      await AttendanceService.saveRecord(updated);
      setRecords((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingRecord(null);
      setMsg({ type: 'success', text: 'Attendance record updated successfully.' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to update attendance record.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!window.confirm('Are you sure you want to delete this attendance record?')) return;
    setLoading(true);
    try {
      await AttendanceService.deleteRecord(recordId);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      setMsg({ type: 'success', text: 'Record deleted.' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to delete record.' });
    } finally {
      setLoading(false);
    }
  };

  // Add Record Handler
  const handleAddRecord = async () => {
    if (!newRecTeacherId) {
      alert('Please select a teacher.');
      return;
    }
    const t = teachers.find((item) => item.id === newRecTeacherId);
    const recId = `REC_${newRecDate}_${newRecTeacherId}`;

    const newRec: AttendanceRecord = {
      id: recId,
      teacherId: newRecTeacherId,
      teacherName: t?.name || 'Teacher',
      date: newRecDate,
      checkIn: newRecCheckIn,
      checkOut: newRecCheckOut,
      status: 'On Time',
      updatedAt: new Date().toISOString(),
    };

    setLoading(true);
    try {
      await AttendanceService.saveRecord(newRec);
      setRecords((prev) => [newRec, ...prev]);
      setIsAddModalOpen(false);
      setMsg({ type: 'success', text: 'Manual attendance record added successfully.' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to add attendance record.' });
    } finally {
      setLoading(false);
    }
  };

  // Delete Custom Month Handler
  const handleDeleteCustomMonth = async () => {
    if (!customMonthToDelete) {
      alert('Please select a month to delete.');
      return;
    }
    if (!window.confirm(`WARNING: This will permanently delete ALL attendance records for ${customMonthToDelete}. Proceed?`)) {
      return;
    }

    setLoading(true);
    try {
      const deleted = await AttendanceService.deleteCustomMonthRecords(customMonthToDelete);
      setMsg({ type: 'success', text: `Successfully deleted ${deleted} records for ${customMonthToDelete}.` });
      if (customMonthToDelete === selectedMonth) {
        setRecords([]);
      }
      setCustomMonthToDelete('');
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to delete month records.' });
    } finally {
      setLoading(false);
    }
  };

  // Purge older than 6 months
  const handlePurgeSixMonths = async () => {
    if (!window.confirm('Purge all attendance records older than 6 months?')) return;
    setLoading(true);
    try {
      const deleted = await AttendanceService.purgeOlderThanSixMonths();
      setMsg({ type: 'success', text: `6-Month Retention Cleanup complete! Removed ${deleted} old records.` });
      loadAllData();
    } catch (e) {
      setMsg({ type: 'error', text: 'Purge operation failed.' });
    } finally {
      setLoading(false);
    }
  };

  // Teacher Management Handlers
  const handleSaveTeacher = async () => {
    if (!tName.trim()) {
      alert('Teacher name is required.');
      return;
    }
    const id = editingTeacher ? editingTeacher.id : `T_${Date.now()}`;
    const updated: AttendanceTeacher = {
      id,
      name: tName.trim(),
      subject: tSubject.trim(),
      pin: tPin.trim() || '1234',
      expectedTime: tExpectedTime || '08:00',
      active: true,
    };

    setLoading(true);
    try {
      await AttendanceService.saveTeacher(updated);
      const newTList = await AttendanceService.getTeachers();
      setTeachers(newTList);
      setEditingTeacher(null);
      setTName('');
      setTSubject('');
      setTPin('');
      setTExpectedTime('08:00');
      setMsg({ type: 'success', text: `Teacher "${updated.name}" saved with PIN "${updated.pin}".` });
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to save teacher profile.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeacherProfile = async (id: string) => {
    if (!window.confirm('Delete teacher profile and PIN?')) return;
    setLoading(true);
    try {
      await AttendanceService.deleteTeacher(id);
      setTeachers((prev) => prev.filter((t) => t.id !== id));
      setMsg({ type: 'success', text: 'Teacher profile removed.' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to delete teacher.' });
    } finally {
      setLoading(false);
    }
  };

  // Location Config Handler
  const handleSaveLocation = async () => {
    setLoading(true);
    try {
      await AttendanceService.saveSettings({
        latitude: Number(locLat),
        longitude: Number(locLng),
        maxDistanceMeters: Number(locRadius),
      });
      setSettings((prev) => ({
        ...prev,
        latitude: Number(locLat),
        longitude: Number(locLng),
        maxDistanceMeters: Number(locRadius),
      }));
      setMsg({ type: 'success', text: 'Institute GPS coordinates and 50m radius updated successfully!' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to update location settings.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDetectCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocLat(pos.coords.latitude);
        setLocLng(pos.coords.longitude);
        alert(`Location detected: Lat ${pos.coords.latitude.toFixed(6)}, Lng ${pos.coords.longitude.toFixed(6)}`);
      },
      (err) => alert('Unable to detect location. Please check browser permissions.')
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-7 h-7 text-indigo-400" />
            <h1 className="text-xl font-black">Admin Attendance Portal</h1>
          </div>
          <p className="text-slate-300 text-xs mt-1">
            Edit attendance records, monitor late/on-time statistics, manage teacher PINs, and set GPS geofence rules.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-white/10 p-1.5 rounded-xl border border-white/10 space-x-1 shrink-0">
          <button
            onClick={() => setActiveSubTab('records')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'records' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
            }`}
          >
            Attendance Records
          </button>
          <button
            onClick={() => setActiveSubTab('teachers')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'teachers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
            }`}
          >
            Manage PINs & Teachers
          </button>
          <button
            onClick={() => setActiveSubTab('location')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'location' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
            }`}
          >
            GPS Location Rule
          </button>
        </div>
      </div>

      {/* Action Notification Box */}
      {msg && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-xs font-bold underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* On-Time Arrivals */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">On-Time Arrivals</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{onTimeCount}</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Late Arrivals */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Late Arrivals</span>
            <div className="text-2xl font-black text-amber-600 mt-1">{lateCount}</div>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Total Present */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Present</span>
            <div className="text-2xl font-black text-blue-600 mt-1">{presentCount}</div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Total Absent */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Absent Today</span>
            <div className="text-2xl font-black text-rose-600 mt-1">{absentCount}</div>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <UserX className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* TAB 1: ATTENDANCE RECORDS & EDITING */}
      {activeSubTab === 'records' && (
        <div className="space-y-6">
          {/* Controls & Filters Header */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* Month Picker */}
                <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-medium">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500 font-bold">Month:</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent font-bold text-slate-800 focus:outline-none"
                  />
                </div>

                {/* Specific Date Filter */}
                <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-medium">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-500 font-bold">Specific Date:</span>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="bg-transparent text-slate-800 focus:outline-none"
                  />
                  {filterDate && (
                    <button onClick={() => setFilterDate('')} className="text-xs text-rose-600 font-bold ml-1">
                      Clear
                    </button>
                  )}
                </div>

                {/* Search Teacher */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search teacher..."
                    value={searchTeacher}
                    onChange={(e) => setSearchTeacher(e.target.value)}
                    className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Attendance Row</span>
                </button>
                <button
                  onClick={loadAllData}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer"
                  title="Refresh Data"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Custom Month Deletion & 6-Month Purge Bar */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700">Delete Attendance for Custom Month:</span>
                <input
                  type="month"
                  value={customMonthToDelete}
                  onChange={(e) => setCustomMonthToDelete(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                />
                <button
                  onClick={handleDeleteCustomMonth}
                  disabled={!customMonthToDelete || loading}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-all disabled:opacity-50 cursor-pointer flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Month</span>
                </button>
              </div>

              <button
                onClick={handlePurgeSixMonths}
                disabled={loading}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Auto-Purge Records Older Than 6 Months</span>
              </button>
            </div>
          </div>

          {/* ATTENDANCE RECORDS TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-sm">
                Attendance Records Log ({filteredRecords.length} entries for {selectedMonth})
              </h2>
              <span className="text-xs text-slate-500 font-medium">Click "Edit" on any row to update time or status</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Teacher Name</th>
                    <th className="px-6 py-3.5">Check In</th>
                    <th className="px-6 py-3.5">Check Out</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                        No attendance records found for the selected month/filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((rec) => {
                      const tName = rec.teacherName || teachers.find((t) => t.id === rec.teacherId)?.name || rec.teacherId;
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/80 transition-all">
                          <td className="px-6 py-4 font-semibold text-slate-800">{rec.date}</td>
                          <td className="px-6 py-4 font-bold text-slate-900">{tName}</td>
                          <td className="px-6 py-4 font-mono font-medium text-slate-700">
                            {rec.checkIn || <span className="text-slate-300">--:--</span>}
                          </td>
                          <td className="px-6 py-4 font-mono font-medium text-slate-700">
                            {rec.checkOut || <span className="text-slate-300">--:--</span>}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                                rec.status === 'Late'
                                  ? 'bg-amber-100 text-amber-800'
                                  : rec.status === 'On Time'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {rec.status || 'Present'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => openEditRecord(rec)}
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg transition-all inline-flex items-center space-x-1 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Row</span>
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(rec.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer inline-block"
                              title="Delete row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEACHERS & PINS MANAGEMENT */}
      {activeSubTab === 'teachers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-indigo-600" />
                <span>Teacher Profiles & Security PIN Directory</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">Set custom 4-digit PINs and expected arrival times for each teacher.</p>
            </div>

            <button
              onClick={() => {
                setEditingTeacher(null);
                setTName('');
                setTSubject('');
                setTPin('1234');
                setTExpectedTime('08:00');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Teacher</span>
            </button>
          </div>

          {/* Add / Edit Form */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {editingTeacher ? `Edit Teacher Profile (${editingTeacher.name})` : 'Add New Teacher Profile'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Sarah Ahmed"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Subject / Department</label>
                <input
                  type="text"
                  placeholder="e.g. Mathematics"
                  value={tSubject}
                  onChange={(e) => setTSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">4-Digit Security PIN</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="1234"
                  value={tPin}
                  onChange={(e) => setTPin(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold tracking-widest text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Expected Check-In Time</label>
                <input
                  type="time"
                  value={tExpectedTime}
                  onChange={(e) => setTExpectedTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              {editingTeacher && (
                <button
                  onClick={() => setEditingTeacher(null)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSaveTeacher}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Teacher</span>
              </button>
            </div>
          </div>

          {/* Teacher List Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Teacher Name</th>
                  <th className="px-6 py-3.5">Subject</th>
                  <th className="px-6 py-3.5">Security PIN</th>
                  <th className="px-6 py-3.5">Target Time</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-4 font-bold text-slate-900">{t.name}</td>
                    <td className="px-6 py-4 font-medium text-slate-600">{t.subject || 'N/A'}</td>
                    <td className="px-6 py-4 font-mono font-bold text-indigo-700 bg-indigo-50/50 inline-block my-2 px-2.5 py-1 rounded-md">
                      {t.pin || '1234'}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{t.expectedTime || '08:00 AM'}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setEditingTeacher(t);
                          setTName(t.name);
                          setTSubject(t.subject || '');
                          setTPin(t.pin || '1234');
                          setTExpectedTime(t.expectedTime || '08:00');
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer inline-flex items-center space-x-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit PIN</span>
                      </button>
                      <button
                        onClick={() => handleDeleteTeacherProfile(t.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: GPS LOCATION CONFIG */}
      {activeSubTab === 'location' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6 max-w-3xl">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-rose-600" />
              <span>Institute Location & 50-Meter Geofence Configuration</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Attendance check-in/out is restricted to within 50 meters of these GPS coordinates.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.000001"
                  value={locLat}
                  onChange={(e) => setLocLat(parseFloat(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.000001"
                  value={locLng}
                  onChange={(e) => setLocLng(parseFloat(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Geofence Radius (Meters)
              </label>
              <input
                type="number"
                value={locRadius}
                onChange={(e) => setLocRadius(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Default rule is 50 meters.</p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={handleDetectCurrentLocation}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <MapPin className="w-4 h-4 text-rose-600" />
                <span>Set to My Current GPS Location</span>
              </button>

              <button
                onClick={handleSaveLocation}
                className="w-full sm:w-auto px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Save Geofence Location</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ROW MODAL */}
      {editingRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">Edit Attendance Row</h3>
              <button onClick={() => setEditingRecord(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Teacher</label>
                <input
                  type="text"
                  disabled
                  value={editingRecord.teacherName || editingRecord.teacherId}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Check In Time</label>
                  <input
                    type="text"
                    placeholder="08:00 AM"
                    value={editCheckIn}
                    onChange={(e) => setEditCheckIn(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Check Out Time</label>
                  <input
                    type="text"
                    placeholder="04:00 PM"
                    value={editCheckOut}
                    onChange={(e) => setEditCheckOut(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                >
                  <option value="On Time">On Time</option>
                  <option value="Late">Late</option>
                  <option value="Absent">Absent</option>
                  <option value="Working">Working</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                onClick={saveEditRecord}
                className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-xs cursor-pointer text-xs flex items-center space-x-1"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD RECORD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">Add Manual Attendance Row</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Teacher Name</label>
                <select
                  value={newRecTeacherId}
                  onChange={(e) => setNewRecTeacherId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                >
                  <option value="">-- Choose Teacher --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Date</label>
                <input
                  type="date"
                  value={newRecDate}
                  onChange={(e) => setNewRecDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Check In Time</label>
                  <input
                    type="text"
                    value={newRecCheckIn}
                    onChange={(e) => setNewRecCheckIn(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Check Out Time</label>
                  <input
                    type="text"
                    value={newRecCheckOut}
                    onChange={(e) => setNewRecCheckOut(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRecord}
                className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-xs cursor-pointer text-xs flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Record</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
