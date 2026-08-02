import React, { useState, useEffect } from 'react';
import { AdminReminder } from '../types';
import { StorageService } from '../lib/storage';
import { formatTimeToAMPM } from '../lib/utils';
import { Bell, Plus, Trash2, Calendar, Clock, CheckCircle2, AlertTriangle, X, Shield, Sparkles } from 'lucide-react';

interface AdminRemindersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRemindersChanged?: () => void;
}

export const ADMIN_REMINDERS_KEY = 'admin_reminders';

export function getAdminReminders(): AdminReminder[] {
  try {
    const raw = localStorage.getItem(ADMIN_REMINDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAdminReminders(reminders: AdminReminder[]): void {
  try {
    localStorage.setItem(ADMIN_REMINDERS_KEY, JSON.stringify(reminders));
    window.dispatchEvent(new Event('admin_reminders_updated'));
  } catch (e) {
    console.error('Failed to save admin reminders:', e);
  }
}

export default function AdminRemindersModal({ isOpen, onClose, onRemindersChanged }: AdminRemindersModalProps) {
  const [reminders, setReminders] = useState<AdminReminder[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('12:00');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('high');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = () => {
    const data = getAdminReminders();
    // Sort by date and time
    data.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    setReminders(data);
  };

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title.trim()) {
      setError('Reminder title is required.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }
    if (!time) {
      setError('Time is required.');
      return;
    }

    const newRem: AdminReminder = {
      id: 'rem_' + Date.now(),
      title: title.trim(),
      date,
      time,
      description: description.trim(),
      priority,
      createdAt: new Date().toISOString(),
      isCompleted: false,
    };

    const updated = [newRem, ...reminders];
    saveAdminReminders(updated);
    setReminders(updated);

    // Reset form
    setTitle('');
    setDescription('');
    setSuccess('Admin reminder created successfully!');

    if (onRemindersChanged) onRemindersChanged();

    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = (id: string) => {
    const updated = reminders.filter((r) => r.id !== id);
    saveAdminReminders(updated);
    setReminders(updated);
    if (onRemindersChanged) onRemindersChanged();
  };

  const handleToggleComplete = (id: string) => {
    const updated = reminders.map((r) => (r.id === id ? { ...r, isCompleted: !r.isCompleted } : r));
    saveAdminReminders(updated);
    setReminders(updated);
    if (onRemindersChanged) onRemindersChanged();
  };

  // Quick Presets
  const setQuickPreset = (type: 'tomorrow' | '1hour' | 'today_evening') => {
    const now = new Date();
    if (type === 'tomorrow') {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      setDate(tom.toISOString().slice(0, 10));
      setTime('09:00');
    } else if (type === '1hour') {
      const in1h = new Date(now.getTime() + 60 * 60 * 1000);
      setDate(in1h.toISOString().slice(0, 10));
      const h = String(in1h.getHours()).padStart(2, '0');
      const m = String(in1h.getMinutes()).padStart(2, '0');
      setTime(`${h}:${m}`);
    } else if (type === 'today_evening') {
      setDate(now.toISOString().slice(0, 10));
      setTime('17:00');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/30">
              <Bell size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight flex items-center gap-2">
                <span>Admin Reminders & Alerts</span>
                <span className="text-[10px] bg-amber-400 text-slate-900 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Admin Only
                </span>
              </h3>
              <p className="text-xs text-blue-200/90 mt-0.5">
                Set reminders visible on the dashboard 1 day before, 1 hour before, and all day on reminder date.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Create Reminder Form */}
          <form onSubmit={handleAddReminder} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3.5">
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
              <Plus size={15} className="text-blue-600" />
              <span>Create New Admin Reminder</span>
            </h4>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700 flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                <span>{success}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                Reminder Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Monthly Fee Collection / Staff Meeting / Class Audit"
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white font-semibold"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1 flex items-center gap-1">
                  <Calendar size={13} className="text-slate-500" /> Date *
                </label>
                <input
                  type="date"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white font-semibold"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1 flex items-center gap-1">
                  <Clock size={13} className="text-slate-500" /> Time *
                </label>
                <input
                  type="time"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white font-semibold"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-1">Quick Set:</span>
              <button
                type="button"
                onClick={() => setQuickPreset('tomorrow')}
                className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-bold rounded-md hover:bg-blue-50 transition-colors cursor-pointer"
              >
                Tomorrow 9 AM
              </button>
              <button
                type="button"
                onClick={() => setQuickPreset('1hour')}
                className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-bold rounded-md hover:bg-blue-50 transition-colors cursor-pointer"
              >
                In 1 Hour
              </button>
              <button
                type="button"
                onClick={() => setQuickPreset('today_evening')}
                className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-bold rounded-md hover:bg-blue-50 transition-colors cursor-pointer"
              >
                Today 5 PM
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Priority Banner
                </label>
                <select
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white font-semibold"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                >
                  <option value="normal">Normal Priority</option>
                  <option value="high">High Priority (Urgent Badge)</option>
                  <option value="urgent">Critical (Red Banner)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                  Notes / Details (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Additional context or links"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white font-semibold"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <Bell size={14} />
              <span>Save Admin Reminder</span>
            </button>
          </form>

          {/* Active Reminders List */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="flex items-center gap-1.5">
                <Bell size={15} className="text-slate-600" />
                <span>Scheduled Admin Reminders</span>
              </span>
              <span className="text-[11px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                {reminders.length} Total
              </span>
            </h4>

            {reminders.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-semibold">
                No active admin reminders set. Use the form above to set one.
              </div>
            ) : (
              <div className="space-y-2">
                {reminders.map((rem) => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const isToday = rem.date === todayStr;
                  const isPast = rem.date < todayStr;

                  return (
                    <div
                      key={rem.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        rem.isCompleted
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : isToday
                          ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => handleToggleComplete(rem.id)}
                          className={`mt-0.5 p-1 rounded-full transition-colors cursor-pointer ${
                            rem.isCompleted ? 'text-emerald-600 bg-emerald-100' : 'text-slate-300 hover:text-emerald-500'
                          }`}
                          title={rem.isCompleted ? 'Mark Active' : 'Mark Completed'}
                        >
                          <CheckCircle2 size={18} />
                        </button>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-bold text-xs ${rem.isCompleted ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {rem.title}
                            </span>
                            {isToday && (
                              <span className="text-[10px] font-extrabold bg-amber-500 text-slate-900 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Today (Whole Day)
                              </span>
                            )}
                            {rem.priority === 'urgent' && (
                              <span className="text-[10px] font-extrabold bg-red-100 text-red-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Urgent
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} className="text-slate-400" />
                              {rem.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} className="text-slate-400" />
                              {formatTimeToAMPM(rem.time)}
                            </span>
                          </div>

                          {rem.description && (
                            <p className="text-[11px] text-slate-600 font-normal italic pt-0.5">
                              {rem.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(rem.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Delete Reminder"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
