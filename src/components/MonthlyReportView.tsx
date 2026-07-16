import React, { useState } from 'react';
import { Student, Teacher, ClassSlot, LessonEntry } from '../types';
import { FileText, Printer, Share2, Clipboard } from 'lucide-react';

interface MonthlyReportViewProps {
  students: Student[];
  teachers: Teacher[];
  slots: ClassSlot[];
  logsByMonth: Record<string, Record<string, LessonEntry>>;
  subsByMonth: Record<string, Record<string, string>>;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function MonthlyReportView({
  students,
  teachers,
  slots,
  logsByMonth,
  subsByMonth,
}: MonthlyReportViewProps) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const getDaysInMonth = (year: number, monthIndex: number) => {
    return new Date(year, monthIndex + 1, 0).getDate();
  };

  const parseDate = (s: string) => {
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };

  const formatDateNice = (d: Date) => {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getSubjectClass = (sub: string) => {
    switch (sub) {
      case 'Math':
        return 'bg-[var(--math-soft)] text-[var(--math)]';
      case 'Science':
        return 'bg-[var(--science-soft)] text-[var(--science)]';
      case 'English':
        return 'bg-[var(--english-soft)] text-[var(--english)]';
      case 'Quran / Islamic Studies':
        return 'bg-[var(--quran-soft)] text-[var(--quran)]';
      default:
        return 'bg-[var(--other-soft)] text-[var(--other)]';
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'present':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--quran-soft)] text-[var(--quran)]">Present</span>;
      case 'absent':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--warn-soft)] text-[var(--warn)]">Absent</span>;
      case 'leave':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--science-soft)] text-[var(--science)]">On Leave</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Not Logged</span>;
    }
  };

  // Compile report stats and logs
  const getReportData = () => {
    if (!selectedStudentId || !selectedMonth) return null;

    const parts = selectedMonth.split('-').map(Number);
    const year = parts[0];
    const monthIndex = parts[1] - 1; // 0-indexed

    const monthLog = logsByMonth[selectedMonth] || {};
    const studentSlots = slots.filter((s) => s.studentId === selectedStudentId);
    const totalDays = getDaysInMonth(year, monthIndex);

    const dayMap: Record<string, any[]> = {};
    const subjectStats: Record<string, { scheduled: number; present: number; absent: number; leave: number }> = {};
    const totals = { scheduled: 0, present: 0, absent: 0, leave: 0 };

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, monthIndex, d);
      const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      studentSlots.forEach((s) => {
        if (s.day !== date.getDay()) return;

        const entry = monthLog[s.id]?.[dateStr] || null;
        const status = entry ? entry.status : '';

        totals.scheduled++;
        if (!subjectStats[s.subject]) {
          subjectStats[s.subject] = { scheduled: 0, present: 0, absent: 0, leave: 0 };
        }
        subjectStats[s.subject].scheduled++;

        if (status === 'present') {
          totals.present++;
          subjectStats[s.subject].present++;
        } else if (status === 'absent') {
          totals.absent++;
          subjectStats[s.subject].absent++;
        } else if (status === 'leave') {
          totals.leave++;
          subjectStats[s.subject].leave++;
        }

        if (!dayMap[dateStr]) {
          dayMap[dateStr] = [];
        }

        // NOTE: We gather regular fields but strictly avoid exposure of teacher names or scheduled times
        dayMap[dateStr].push({
          subject: s.subject,
          scheduledDuration: s.duration,
          status,
          actualDuration: entry ? entry.actualDuration : null,
          lessonSource: entry ? entry.lessonSource : '',
          lessonDetail: entry ? entry.lessonDetail : '',
          content: entry ? entry.content : '',
          remarks: entry ? entry.remarks : '',
        });
      });
    }

    return {
      year,
      monthIndex,
      totalDays,
      dayMap,
      subjectStats,
      totals,
      hasClasses: studentSlots.length > 0,
    };
  };

  const reportData = getReportData();
  const student = students.find((s) => s.id === selectedStudentId);

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = async () => {
    if (!reportData || !student) return;

    const monthName = new Date(reportData.year, reportData.monthIndex, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    const pct = reportData.totals.scheduled
      ? Math.round((100 * reportData.totals.present) / reportData.totals.scheduled)
      : 0;

    const lines: string[] = [];
    lines.push(`${student.name} — ${monthName} Lesson Report`);
    lines.push(
      `Scheduled: ${reportData.totals.scheduled}  |  Present: ${reportData.totals.present}  |  Absent: ${reportData.totals.absent}  |  On Leave: ${reportData.totals.leave}  |  Completion: ${pct}%`
    );
    lines.push('');
    
    Object.keys(reportData.subjectStats)
      .sort()
      .forEach((subj) => {
        const st = reportData.subjectStats[subj];
        lines.push(`${subj}: ${st.present}/${st.scheduled} taken (${st.absent} absent, ${st.leave} leave)`);
      });

    lines.push('');
    lines.push('Day-by-day:');

    for (let d = 1; d <= reportData.totalDays; d++) {
      const dateStr = `${reportData.year}-${String(reportData.monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const classes = reportData.dayMap[dateStr];
      if (!classes || classes.length === 0) continue;

      const dateObj = new Date(reportData.year, reportData.monthIndex, d);
      classes.forEach((c) => {
        const statusLabel =
          c.status === 'present'
            ? 'Present'
            : c.status === 'absent'
            ? 'Absent'
            : c.status === 'leave'
            ? 'On Leave'
            : 'Not logged';

        const lessonBit = c.lessonSource
          ? ` [${c.lessonSource}${c.lessonDetail ? `: ${c.lessonDetail}` : ''}]`
          : '';

        // NOTE: No teacher name, no schedule times in copy summary text!
        lines.push(
          `- ${formatDateNice(dateObj)} [${c.subject}, ${statusLabel}]${lessonBit}${
            c.content ? `: ${c.content}` : ''
          }`
        );
      });
    }

    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('Report summary copied to clipboard! You can now paste it into WhatsApp, emails, or messages.');
    } catch {
      window.prompt('Copy this summary:', text);
    }
  };

  const monthName = reportData
    ? new Date(reportData.year, reportData.monthIndex, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : '';

  const pct = reportData?.totals.scheduled
    ? Math.round((100 * reportData.totals.present) / reportData.totals.scheduled)
    : 0;

  // Render Day-by-Day Rows
  const dayRows: React.ReactNode[] = [];
  if (reportData) {
    for (let d = 1; d <= reportData.totalDays; d++) {
      const dateStr = `${reportData.year}-${String(reportData.monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const classes = reportData.dayMap[dateStr];
      if (!classes || classes.length === 0) continue;

      const dateObj = new Date(reportData.year, reportData.monthIndex, d);
      classes.forEach((c, idx) => {
        const lessonBits: string[] = [];
        if (c.lessonSource) {
          lessonBits.push(`${c.lessonSource}${c.lessonDetail ? ` — ${c.lessonDetail}` : ''}`);
        } else if (c.lessonDetail) {
          lessonBits.push(c.lessonDetail);
        }
        if (c.content) {
          lessonBits.push(c.content);
        }
        const lessonText = lessonBits.length ? lessonBits.join('\n') : '—';
        const durationText =
          c.actualDuration !== null && c.actualDuration !== undefined
            ? `${c.actualDuration} min`
            : `${c.scheduledDuration} min (scheduled)`;

        dayRows.push(
          <tr key={`${dateStr}-${idx}`} className="hover:bg-slate-50/50">
            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{formatDateNice(dateObj)}</td>
            {/* NOTE: Strictly showing ONLY the subject. NO teacher name, NO scheduled time is printed or displayed! */}
            <td className="px-4 py-3 whitespace-nowrap">
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${getSubjectClass(c.subject)}`}>
                {c.subject}
              </span>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{getStatusTag(c.status)}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{durationText}</td>
            <td className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap max-w-xs">{lessonText}</td>
            <td className="px-4 py-3 text-sm text-slate-500 whitespace-pre-wrap max-w-xs">{c.remarks || '—'}</td>
          </tr>
        );
      });
    }
  }

  return (
    <div>
      {/* Selector Toolbar */}
      <div className="toolbar flex flex-wrap gap-4 mb-6 items-center no-print bg-slate-50 p-4 rounded-xl border border-[var(--line)]">
        <select
          className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)] text-sm"
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
        >
          <option value="">Choose a student…</option>
          {students
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>

        <input
          type="month"
          className="px-3 py-1.5 border border-[var(--line-strong)] bg-white rounded focus:outline-none focus:border-[var(--accent)] text-sm"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        />

        {reportData && reportData.hasClasses && (
          <>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-white border border-[var(--line-strong)] hover:border-[var(--ink-soft)] font-semibold rounded text-sm flex items-center gap-1.5 cursor-pointer text-slate-700 shadow-sm"
            >
              <Printer size={16} /> Print / Save PDF
            </button>
            <button
              onClick={handleCopySummary}
              className="px-4 py-1.5 bg-white border border-[var(--line-strong)] hover:border-[var(--ink-soft)] font-semibold rounded text-sm flex items-center gap-1.5 cursor-pointer text-slate-700 shadow-sm"
            >
              <Clipboard size={16} /> Copy shareable summary
            </button>
          </>
        )}
      </div>

      {/* Report Canvas */}
      {!selectedStudentId ? (
        <div className="text-center py-12 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400">
          Pick a student above to generate their monthly report.
        </div>
      ) : reportData && !reportData.hasClasses ? (
        <div className="text-center py-12 border-2 border-dashed border-[var(--line-strong)] rounded-xl text-slate-400">
          This student has no classes in the weekly timetable. Set up classes under the Timetable tab first.
        </div>
      ) : reportData ? (
        <div className="space-y-6 pt-4 bg-white rounded-xl border border-slate-200 p-6 md:p-8">
          {/* Main heading - clean, with no other layout elements or headers above it */}
          <div className="border-b pb-4 mb-2">
            <h2 className="serif-title font-bold text-2xl text-[var(--ink)]">{student?.name}</h2>
            <p className="text-sm font-semibold text-[var(--ink-soft)] mt-1">
              Monthly Lesson Report &middot; {monthName}
            </p>
          </div>

          {/* Core Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
              <div className="serif-title font-bold text-2xl text-[var(--ink)]">{reportData.totals.scheduled}</div>
              <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider mt-1">Scheduled</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
              <div className="serif-title font-bold text-2xl text-[var(--quran)]">{reportData.totals.present}</div>
              <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider mt-1">Present</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
              <div className="serif-title font-bold text-2xl text-[var(--warn)]">{reportData.totals.absent}</div>
              <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider mt-1">Absent</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
              <div className="serif-title font-bold text-2xl text-[var(--science)]">{reportData.totals.leave}</div>
              <div className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider mt-1">On Leave</div>
            </div>
            <div className="bg-[var(--accent-soft)] p-4 rounded-lg border border-[var(--accent)] col-span-2 md:col-span-1 text-center">
              <div className="serif-title font-bold text-2xl text-[var(--accent-dark)]">{pct}%</div>
              <div className="text-[10px] font-bold text-[var(--accent-dark)] uppercase tracking-wider mt-1">Completion</div>
            </div>
          </div>

          {/* Completion Bar */}
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${pct}%` }}></div>
          </div>

          {/* Subject Breakdown */}
          <div className="space-y-3">
            <h3 className="serif-title font-bold text-base text-[var(--ink)]">Subject Breakdown</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                    <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scheduled</th>
                    <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Present</th>
                    <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Absent</th>
                    <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">On Leave</th>
                    <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Completion</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {Object.keys(reportData.subjectStats)
                    .sort()
                    .map((subj) => {
                      const st = reportData.subjectStats[subj];
                      const sPct = st.scheduled ? Math.round((100 * st.present) / st.scheduled) : 0;
                      return (
                        <tr key={subj}>
                          <td className="px-4 py-2 font-semibold">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getSubjectClass(subj)}`}>
                              {subj}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-600">{st.scheduled}</td>
                          <td className="px-4 py-2 text-slate-600">{st.present}</td>
                          <td className="px-4 py-2 text-slate-600">{st.absent}</td>
                          <td className="px-4 py-2 text-slate-600">{st.leave}</td>
                          <td className="px-4 py-2 font-bold text-slate-800">{sPct}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Day by Day logs */}
          <div className="space-y-3">
            <h3 className="serif-title font-bold text-base text-[var(--ink)]">Daily Lesson History</h3>
            {dayRows.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-lg text-slate-400 text-sm">
                No lessons logged for this month yet. Use the Daily Log tab to record entries.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Attendance</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Duration</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lesson / Note</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Remarks / Homework</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">{dayRows}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
