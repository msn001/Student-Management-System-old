import React, { useState } from 'react';
import { ClassSlot, Student, Teacher } from '../types';
import { StorageService } from '../lib/storage';
import { 
  RotateCcw, 
  History, 
  Download, 
  Upload, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Database,
  RefreshCw,
  FileCheck
} from 'lucide-react';

interface DataRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  slots: ClassSlot[];
  teachers: Teacher[];
  students: Student[];
  onUpdateSlots: (slots: ClassSlot[]) => void;
  onUpdateTeachers: (teachers: Teacher[]) => void;
  onUpdateStudents: (students: Student[]) => void;
}

export default function DataRestoreModal({
  isOpen,
  onClose,
  slots,
  teachers,
  students,
  onUpdateSlots,
  onUpdateTeachers,
  onUpdateStudents,
}: DataRestoreModalProps) {
  const [activeTab, setActiveTab] = useState<'repair' | 'snapshots' | 'export'>('repair');
  const [targetBackupKey, setTargetBackupKey] = useState<'slots' | 'teachers' | 'students'>('slots');
  const [bulkReassignTeacherId, setBulkReassignTeacherId] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  // Find invalid/orphaned slots (teacherId or studentId missing from lists)
  const invalidTeacherSlots = slots.filter((s) => !teachers.some((t) => t.id === s.teacherId));
  const invalidStudentSlots = slots.filter((s) => !students.some((st) => st.id === s.studentId));

  const totalIssues = invalidTeacherSlots.length + invalidStudentSlots.length;

  // Repair missing teacher IDs by reassigning them to selected valid teacher
  const handleBulkReassignMissingTeachers = async () => {
    if (!bulkReassignTeacherId) {
      setStatusMsg({ type: 'error', text: 'Please select a teacher to reassign missing classes to.' });
      return;
    }

    const updated = slots.map((s) => {
      if (!teachers.some((t) => t.id === s.teacherId)) {
        return { ...s, teacherId: bulkReassignTeacherId };
      }
      return s;
    });

    onUpdateSlots(updated);
    await StorageService.saveKey('slots', updated);
    setStatusMsg({ type: 'success', text: `Successfully reassigned ${invalidTeacherSlots.length} orphaned class(es) to selected teacher!` });
  };

  // Restore snapshot handler
  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!confirm(`Are you sure you want to restore this ${targetBackupKey} backup snapshot? Current ${targetBackupKey} data will be overwritten.`)) {
      return;
    }

    setIsProcessing(true);
    const success = await StorageService.restoreBackupSnapshot(targetBackupKey, snapshotId);
    setIsProcessing(false);

    if (success) {
      // Reload updated data into parent state
      const reloaded = await StorageService.loadKey<any>(targetBackupKey, []);
      if (targetBackupKey === 'slots') onUpdateSlots(reloaded);
      if (targetBackupKey === 'teachers') onUpdateTeachers(reloaded);
      if (targetBackupKey === 'students') onUpdateStudents(reloaded);

      setStatusMsg({ type: 'success', text: `Restored ${targetBackupKey} from snapshot successfully!` });
    } else {
      setStatusMsg({ type: 'error', text: 'Failed to restore selected snapshot.' });
    }
  };

  // Export JSON backup handler
  const handleDownloadBackup = async () => {
    try {
      const jsonStr = await StorageService.exportFullBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iec_lesson_register_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg({ type: 'success', text: 'Full system backup JSON downloaded successfully!' });
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: `Export failed: ${e.message}` });
    }
  };

  // Import JSON backup handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      if (!confirm('Importing this backup will overwrite current teachers, students, and timetable entries. Continue?')) {
        return;
      }

      setIsProcessing(true);
      const res = await StorageService.importFullBackup(content);
      setIsProcessing(false);

      if (res.success) {
        // Reload all data
        const [loadedTeachers, loadedStudents, loadedSlots] = await Promise.all([
          StorageService.loadKey<Teacher[]>('teachers', []),
          StorageService.loadKey<Student[]>('students', []),
          StorageService.loadKey<ClassSlot[]>('slots', []),
        ]);

        onUpdateTeachers(loadedTeachers);
        onUpdateStudents(loadedStudents);
        onUpdateSlots(loadedSlots);

        setStatusMsg({ type: 'success', text: 'Full database restored successfully from JSON backup file!' });
      } else {
        setStatusMsg({ type: 'error', text: res.message });
      }
    };
    reader.readAsText(file);
  };

  const snapshots = StorageService.getBackupSnapshots(targetBackupKey);

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-[110] p-4 no-print">
      <div className="bg-white rounded-2xl border-2 border-slate-300 w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/30 text-blue-400 rounded-lg border border-blue-500/30">
              <Database size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base serif-title tracking-tight">Data Health, Backup &amp; Restoration</h3>
              <p className="text-[11px] text-slate-400">Diagnose corrupted teacher assignments or restore previous versions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMsg && (
          <div className={`p-3 text-xs font-bold flex items-center justify-between shrink-0 ${
            statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-red-50 text-red-800 border-b border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {statusMsg.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-red-600" />}
              <span>{statusMsg.text}</span>
            </div>
            <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-3 gap-2 shrink-0">
          <button
            onClick={() => {
              setActiveTab('repair');
              setStatusMsg(null);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
              activeTab === 'repair'
                ? 'bg-white text-blue-700 border-slate-200 border-b-white -mb-px'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <Wrench size={14} />
            <span>Diagnostics &amp; Repair</span>
            {totalIssues > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
                {totalIssues}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('snapshots');
              setStatusMsg(null);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
              activeTab === 'snapshots'
                ? 'bg-white text-blue-700 border-slate-200 border-b-white -mb-px'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <History size={14} />
            <span>Restore History Snapshots</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('export');
              setStatusMsg(null);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
              activeTab === 'export'
                ? 'bg-white text-blue-700 border-slate-200 border-b-white -mb-px'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <Download size={14} />
            <span>JSON Backup &amp; Restore</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* TAB 1: DIAGNOSTICS & REPAIR */}
          {activeTab === 'repair' && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 text-xs text-slate-600 leading-relaxed">
                <p className="font-bold text-slate-800 mb-1">How Diagnostics Work:</p>
                This tool checks your weekly timetable slots for orphaned or mismatched Teacher and Student references (which occur if a teacher or student was removed or re-created).
              </div>

              {totalIssues === 0 ? (
                <div className="text-center py-10 bg-emerald-50/40 border-2 border-dashed border-emerald-200 rounded-xl space-y-2">
                  <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                  <h4 className="font-bold text-slate-800 text-sm">All Timetable References Are Healthy!</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Every assigned class in your weekly timetable correctly links to a valid teacher and student.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Orphaned Teachers Section */}
                  {invalidTeacherSlots.length > 0 && (
                    <div className="border border-amber-200 bg-amber-50/30 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={18} className="text-amber-600" />
                          <h4 className="font-bold text-amber-900 text-sm">
                            {invalidTeacherSlots.length} Class(es) Have Orphaned Teacher IDs
                          </h4>
                        </div>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          Action Needed
                        </span>
                      </div>

                      <p className="text-xs text-slate-600">
                        These classes point to teacher IDs that no longer match your current list of teachers. Select a active teacher below to bulk-reassign all of them in 1 click:
                      </p>

                      <div className="flex gap-2 items-center flex-wrap pt-1">
                        <select
                          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold focus:outline-none focus:border-blue-500"
                          value={bulkReassignTeacherId}
                          onChange={(e) => setBulkReassignTeacherId(e.target.value)}
                        >
                          <option value="">-- Choose active teacher to reassign --</option>
                          {teachers
                            .slice()
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={handleBulkReassignMissingTeachers}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
                        >
                          <Wrench size={14} /> Reassign All ({invalidTeacherSlots.length})
                        </button>
                      </div>

                      {/* List of Affected Slots */}
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pt-2 border-t border-amber-200/60">
                        {invalidTeacherSlots.map((s) => {
                          const student = students.find((st) => st.id === s.studentId);
                          return (
                            <div key={s.id} className="text-[11px] bg-white p-2 rounded border border-amber-200/80 flex justify-between items-center text-slate-700 font-medium">
                              <div>
                                <span className="font-bold text-slate-900">{student?.name || 'Student'}</span> &middot; {s.subject} &middot; {s.time}
                              </div>
                              <span className="font-mono text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Invalid ID: {s.teacherId.slice(0, 8)}…
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Orphaned Students Section */}
                  {invalidStudentSlots.length > 0 && (
                    <div className="border border-red-200 bg-red-50/30 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-600" />
                        <h4 className="font-bold text-red-900 text-sm">
                          {invalidStudentSlots.length} Class(es) Have Removed Students
                        </h4>
                      </div>
                      <p className="text-xs text-slate-600">
                        These classes belong to students who were deleted. You can remove these obsolete slots directly in the Timetable view or edit them.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: HISTORY SNAPSHOTS */}
          {activeTab === 'snapshots' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Select Dataset to Restore:</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTargetBackupKey('slots')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      targetBackupKey === 'slots' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Timetable Slots ({slots.length})
                  </button>
                  <button
                    onClick={() => setTargetBackupKey('teachers')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      targetBackupKey === 'teachers' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Teachers ({teachers.length})
                  </button>
                  <button
                    onClick={() => setTargetBackupKey('students')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      targetBackupKey === 'students' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Students ({students.length})
                  </button>
                </div>
              </div>

              {snapshots.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No automated history snapshots saved yet for <strong>{targetBackupKey}</strong>. Snapshots are created automatically as you make changes.
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Showing available automatic point-in-time snapshots for <strong className="text-slate-700 uppercase">{targetBackupKey}</strong>:
                  </p>
                  
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="p-4 bg-white border border-slate-200 hover:border-blue-300 rounded-xl flex justify-between items-center shadow-3xs transition-all"
                    >
                      <div>
                        <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
                          <History size={14} className="text-blue-500" />
                          <span>{snap.label}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Contains <strong className="text-slate-700">{snap.count}</strong> record(s)
                        </div>
                      </div>

                      <button
                        onClick={() => handleRestoreSnapshot(snap.id)}
                        disabled={isProcessing}
                        className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                      >
                        <RotateCcw size={13} /> Restore Version
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: JSON BACKUP & RESTORE */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              {/* Export Box */}
              <div className="p-5 bg-blue-50/40 border border-blue-100 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Download size={18} className="text-blue-600" />
                  <h4 className="font-bold text-slate-800 text-sm">Download Full System Backup</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Export all teachers, students, timetable schedules, student learning profiles, and settings into a single downloadable JSON backup file.
                </p>
                <button
                  onClick={handleDownloadBackup}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Download size={14} /> Download Backup (.json)
                </button>
              </div>

              {/* Import Box */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Upload size={18} className="text-slate-700" />
                  <h4 className="font-bold text-slate-800 text-sm">Restore From Backup File</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Upload a previously saved JSON backup file to restore your complete database.
                </p>

                <label className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 font-bold rounded-lg text-xs text-slate-700 cursor-pointer shadow-3xs transition-colors">
                  <FileCheck size={14} className="text-slate-500" />
                  <span>Choose JSON File to Restore</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
          >
            Close Window
          </button>
        </div>

      </div>
    </div>
  );
}
