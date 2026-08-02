import React, { useState, useEffect } from 'react';
import { AdminReminder } from '../types';
import { getAdminReminders, saveAdminReminders } from './AdminRemindersModal';
import { formatTimeToAMPM } from '../lib/utils';
import { Bell, AlertTriangle, Clock, Calendar, Shield, X, CheckCircle2, ChevronRight } from 'lucide-react';

interface AdminRemindersDashboardBannerProps {
  isUnlocked: boolean;
  onOpenAdminReminders?: () => void;
}

export default function AdminRemindersDashboardBanner({
  isUnlocked,
  onOpenAdminReminders,
}: AdminRemindersDashboardBannerProps) {
  const [reminders, setReminders] = useState<AdminReminder[]>([]);
  const [now, setNow] = useState(new Date());

  const loadReminders = () => {
    if (!isUnlocked) return;
    const data = getAdminReminders();
    setReminders(data.filter((r) => !r.isCompleted));
  };

  useEffect(() => {
    loadReminders();
    const handleUpdate = () => loadReminders();
    window.addEventListener('admin_reminders_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000); // refresh time check every 15s

    return () => {
      window.removeEventListener('admin_reminders_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      clearInterval(timer);
    };
  }, [isUnlocked]);

  if (!isUnlocked) return null; // Admin only!

  // Compute active reminders for today, tomorrow, or within 1h
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const tomorrowObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr = `${tomorrowObj.getFullYear()}-${String(tomorrowObj.getMonth() + 1).padStart(2, '0')}-${String(tomorrowObj.getDate()).padStart(2, '0')}`;

  const relevantReminders = reminders.filter((rem) => {
    if (rem.date === todayStr) return true; // Stays for the whole day!
    if (rem.date === tomorrowStr) return true; // 1 day before

    // Also check if within 24 hours
    const remDateTime = new Date(`${rem.date}T${rem.time}:00`);
    const diffMs = remDateTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= 24;
  });

  if (relevantReminders.length === 0) return null;

  const handleDismiss = (id: string) => {
    const all = getAdminReminders();
    const updated = all.map((r) => (r.id === id ? { ...r, isCompleted: true } : r));
    saveAdminReminders(updated);
    setReminders(updated.filter((r) => !r.isCompleted));
  };

  return (
    <div className="space-y-3 mb-4">
      {relevantReminders.map((rem) => {
        const isToday = rem.date === todayStr;
        const isTomorrow = rem.date === tomorrowStr;

        // Calculate time diff in minutes
        const remDateTime = new Date(`${rem.date}T${rem.time}:00`);
        const diffMins = Math.round((remDateTime.getTime() - now.getTime()) / (1000 * 60));
        const isWithin1Hour = diffMins > 0 && diffMins <= 60;
        const isUrgent = isWithin1Hour || rem.priority === 'urgent';

        let badgeText = 'Today (Whole Day)';
        let badgeBg = 'bg-amber-100 text-amber-900 border-amber-300';

        if (isWithin1Hour) {
          badgeText = `Starts in ${diffMins} min${diffMins === 1 ? '' : 's'}`;
          badgeBg = 'bg-red-500 text-white animate-pulse';
        } else if (isTomorrow) {
          badgeText = 'Tomorrow (1 Day Alert)';
          badgeBg = 'bg-blue-100 text-blue-900 border-blue-300';
        } else if (isToday) {
          badgeText = 'Today (Whole Day Sticky)';
          badgeBg = 'bg-amber-100 text-amber-900 border-amber-300';
        }

        return (
          <div
            key={rem.id}
            className={`p-4 rounded-xl border-2 flex items-center justify-between flex-wrap gap-3 shadow-sm transition-all ${
              isWithin1Hour
                ? 'bg-red-50/90 border-red-400 text-red-950'
                : isToday
                ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                : 'bg-blue-50/90 border-blue-300 text-blue-950'
            }`}
          >
            <div className="flex items-start gap-3 flex-1 min-w-[280px]">
              <div
                className={`p-2.5 rounded-xl border shrink-0 ${
                  isWithin1Hour
                    ? 'bg-red-500 text-white border-red-600 animate-bounce'
                    : isToday
                    ? 'bg-amber-500 text-slate-900 border-amber-600'
                    : 'bg-blue-600 text-white border-blue-700'
                }`}
              >
                <Bell size={20} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm tracking-tight">{rem.title}</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border ${badgeBg}`}>
                    {badgeText}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-amber-300 px-2 py-0.5 rounded-full font-extrabold flex items-center gap-1">
                    <Shield size={10} /> Admin Only
                  </span>
                </div>

                <div className="text-xs font-semibold flex items-center gap-3 opacity-90">
                  <span className="flex items-center gap-1">
                    <Calendar size={13} /> {rem.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={13} /> {formatTimeToAMPM(rem.time)}
                  </span>
                  {rem.description && <span className="italic font-normal">— {rem.description}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDismiss(rem.id)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                title="Mark Done & Dismiss"
              >
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Dismiss</span>
              </button>

              {onOpenAdminReminders && (
                <button
                  onClick={onOpenAdminReminders}
                  className="p-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  title="Manage Reminders"
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
