import { Student } from '../types';

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
