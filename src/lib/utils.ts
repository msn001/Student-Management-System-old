import { Student, ClassSlot } from '../types';

/**
 * Resolves the complete schedule for a given date, combining regular weekly slots,
 * one-off makeup classes, and applying any daily modifications or cancellations.
 */
export function getSlotsForDate(
  dateStr: string,
  slots: ClassSlot[],
  dailyAdjustments: Record<string, Record<string, { time?: string; duration?: number; teacherId?: string; isCancelled?: boolean }>>
): ClassSlot[] {
  if (!dateStr) return [];
  const parts = dateStr.split('-').map(Number);
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayOfWeek = dateObj.getDay();
  const dayAdjustments = dailyAdjustments[dateStr] || {};

  // 1. Get weekly slots for this weekday, unless they are cancelled for this date
  const weeklySlots = slots
    .filter((s) => {
      // Ignore one-off makeup/adjusted classes (they have date property and will be combined in step 2)
      if (s.date) return false;
      
      // Match day of week
      if (s.day !== dayOfWeek) return false;
      
      // Check if cancelled for this specific date
      if (dayAdjustments[s.id]?.isCancelled) return false;
      
      return true;
    })
    .map((s) => {
      // Apply temporary overrides for time, duration, or teacher
      const adj = dayAdjustments[s.id];
      if (adj) {
        return {
          ...s,
          time: adj.time || s.time,
          duration: adj.duration || s.duration,
          teacherId: adj.teacherId || s.teacherId,
        };
      }
      return s;
    });

  // 2. Get one-off slots specifically scheduled for this date
  const oneOffSlots = slots.filter((s) => s.date === dateStr);

  // Combine both and sort by time
  return [...weeklySlots, ...oneOffSlots].sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Formats a 24-hour time string (e.g. "14:30") to standard 12-hour AM/PM format (e.g. "2:30 PM").
 */
export function formatTimeToAMPM(time24: string): string {
  if (!time24) return '';
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  let hour = parseInt(parts[0], 10);
  const min = parts[1];
  if (isNaN(hour)) return time24;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12; // conversion of hour '0' to '12'
  return `${hour}:${min} ${ampm}`;
}

/**
 * Extract only the first space-separated word from a full name.
 */
export function getFirstName(fullName: string): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

/**
 * Generates an annotated name string to easily distinguish students with identical names in select pickers.
 */
export function getStudentDisplayName(s: Student): string {
  const details: string[] = [];
  if (s.zoom) details.push(`Zoom: ${s.zoom}`);
  else if (s.teamsId) details.push(`Teams: ${s.teamsId}`);
  else if (s.googleMeet) details.push(`Meet: ${s.googleMeet}`);
  
  if (details.length > 0) {
    return `${s.name} (${details.join(', ')})`;
  }
  return s.name;
}
