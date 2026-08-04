// Service to interact with the Google Apps Script Teacher Attendance backend with offline caching & retry resilience

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzMBcrZEDAB9_u2pJmLEQlMgTz_566Udq688opiP8G8qPtpBc1rC-z9Ix1homUZJ8cm/exec';

import { StorageService } from './storage';

export interface AttendanceTeacher {
  id: string;
  name: string;
  subject?: string;
  pin?: string;
}

export interface AttendanceRecord {
  id: string;
  teacherId: string;
  date: string;
  checkIn: string;
  checkOut: string;
}

const DEFAULT_FALLBACK_TEACHERS: AttendanceTeacher[] = [
  { id: 'T1', name: 'Dr. Sarah Ahmed', subject: 'Mathematics', pin: '1001' },
  { id: 'T2', name: 'Prof. Ali Raza', subject: 'Physics', pin: '1002' },
  { id: 'T3', name: 'Ms. Fatima Khan', subject: 'English Literature', pin: '1003' },
  { id: 'T4', name: 'Mr. Usman Hassan', subject: 'Chemistry', pin: '1004' },
  { id: 'T5', name: 'Mrs. Ayesha Tariq', subject: 'Biology', pin: '1005' },
];

// Local Cache Helper
const CACHE_KEYS = {
  TEACHERS: 'attendance_cached_teachers_v2',
  RECORDS: 'attendance_cached_records_v2',
};

function getLocalCachedTeachers(): AttendanceTeacher[] {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.TEACHERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed reading teacher cache:', e);
  }
  return DEFAULT_FALLBACK_TEACHERS;
}

function saveLocalCachedTeachers(teachers: AttendanceTeacher[]) {
  try {
    if (teachers && teachers.length > 0) {
      localStorage.setItem(CACHE_KEYS.TEACHERS, JSON.stringify(teachers));
      StorageService.saveKey(CACHE_KEYS.TEACHERS, teachers).catch(() => {});
    }
  } catch (e) {
    console.warn('Failed writing teacher cache:', e);
  }
}

function getLocalCachedRecords(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.RECORDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed reading records cache:', e);
  }
  return [];
}

function saveLocalCachedRecords(records: AttendanceRecord[]) {
  try {
    localStorage.setItem(CACHE_KEYS.RECORDS, JSON.stringify(records));
  } catch (e) {
    console.warn('Failed writing records cache:', e);
  }
  try {
    StorageService.saveKey(CACHE_KEYS.RECORDS, records).catch(() => {});
  } catch (e) {
    // Ignore async storage save errors
  }
}

function mergeRecords(existing: AttendanceRecord[], incoming: AttendanceRecord[]): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  // 1. Load incoming from remote server
  incoming.forEach((r) => map.set(r.id, r));
  // 2. Overlay existing local records so local edits/additions take priority over stale server data
  existing.forEach((r) => {
    const serverRec = map.get(r.id);
    if (!serverRec) {
      map.set(r.id, r);
    } else {
      map.set(r.id, {
        ...serverRec,
        ...r,
        checkIn: r.checkIn || serverRec.checkIn,
        checkOut: r.checkOut || serverRec.checkOut,
      });
    }
  });
  return Array.from(map.values());
}

// Resilient API Call with Timeout & Retry
async function apiCall(params: Record<string, string>, timeoutMs = 5000, maxRetries = 1) {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URL is not configured.');
  }

  const url = SCRIPT_URL + '?' + new URLSearchParams(params);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      return data;
    } catch (error: any) {
      clearTimeout(timer);
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) {
        const msg = error.name === 'AbortError' ? 'Server timeout (Google Sheets slow response)' : (error.message || 'Network error connecting to Google Sheets.');
        console.warn(`Attendance API Error (attempt ${attempt + 1}/${maxRetries + 1}):`, msg);
        throw new Error(msg);
      }
      // Wait before retry
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

export const AttendanceService = {
  async getTeachers(): Promise<AttendanceTeacher[]> {
    try {
      const data = await apiCall({ action: 'getTeachers' }, 4000, 1);
      if (data && Array.isArray(data.teachers) && data.teachers.length > 0) {
        saveLocalCachedTeachers(data.teachers);
        return data.teachers;
      }
    } catch (e) {
      console.info('Using local cached teachers due to network/server delay');
    }
    return getLocalCachedTeachers();
  },

  async getRecords(month: string): Promise<AttendanceRecord[]> {
    let cached = getLocalCachedRecords();
    if (cached.length === 0) {
      try {
        const cloudRecords = await StorageService.loadKey<AttendanceRecord[]>(CACHE_KEYS.RECORDS, []);
        if (Array.isArray(cloudRecords) && cloudRecords.length > 0) {
          cached = cloudRecords;
          localStorage.setItem(CACHE_KEYS.RECORDS, JSON.stringify(cached));
        }
      } catch (e) {
        // ignore
      }
    }

    try {
      const data = await apiCall({ action: 'getRecords', month }, 5000, 1);
      if (data && Array.isArray(data.records)) {
        const merged = mergeRecords(cached, data.records);
        saveLocalCachedRecords(merged);
        return merged.filter((r) => r.date.startsWith(month));
      }
    } catch (e) {
      console.info(`Using local cached records for ${month} due to network/server delay`);
    }

    return cached.filter((r) => r.date.startsWith(month));
  },

  async scan(pin: string, date: string, time: string): Promise<{
    action: 'checkIn' | 'checkOut';
    recordId: string;
    teacher: string;
    date: string;
    time: string;
  }> {
    // Attempt remote scan first with quick timeout
    try {
      const remoteRes = await apiCall({ action: 'scan', pin, date, time }, 4500, 1);
      if (remoteRes && remoteRes.recordId) {
        // Save to local cache
        const cached = getLocalCachedRecords();
        const recIdx = cached.findIndex((r) => r.id === remoteRes.recordId);
        if (recIdx >= 0) {
          cached[recIdx] = {
            ...cached[recIdx],
            checkOut: remoteRes.action === 'checkOut' ? time : cached[recIdx].checkOut,
          };
        } else {
          cached.push({
            id: remoteRes.recordId,
            teacherId: remoteRes.teacher,
            date: remoteRes.date,
            checkIn: time,
            checkOut: '',
          });
        }
        saveLocalCachedRecords(cached);
        return remoteRes;
      }
    } catch (err: any) {
      console.info('Remote scan failed/timed out, falling back to instant local scan processing:', err.message);
    }

    // Local Scan Fallback Engine
    const teachers = getLocalCachedTeachers();
    // Find matching teacher by PIN or fallback match
    const matchedTeacher = teachers.find(
      (t) => t.pin === pin || t.id === pin || t.name.toLowerCase() === pin.toLowerCase()
    ) || teachers.find((t, idx) => pin === `100${idx + 1}` || pin === `000${idx + 1}`);

    if (!matchedTeacher) {
      throw new Error('Invalid PIN code. Please check and try again.');
    }

    const cachedRecords = getLocalCachedRecords();

    // Check if there's an open check-in record for this teacher today
    const openRecord = cachedRecords.find(
      (r) => (r.teacherId === matchedTeacher.id || r.teacherId === matchedTeacher.name) &&
             r.date === date &&
             !r.checkOut
    );

    if (openRecord) {
      // Check-out
      openRecord.checkOut = time;
      saveLocalCachedRecords(cachedRecords);
      return {
        action: 'checkOut',
        recordId: openRecord.id,
        teacher: matchedTeacher.name,
        date,
        time,
      };
    } else {
      // Check-in
      const recordId = `REC_${matchedTeacher.id}_${date.replace(/-/g, '')}_${Date.now()}`;
      const newRec: AttendanceRecord = {
        id: recordId,
        teacherId: matchedTeacher.id,
        date,
        checkIn: time,
        checkOut: '',
      };
      cachedRecords.push(newRec);
      saveLocalCachedRecords(cachedRecords);
      return {
        action: 'checkIn',
        recordId,
        teacher: matchedTeacher.name,
        date,
        time,
      };
    }
  },

  async addTeacher(name: string, subject: string, pin: string): Promise<{ id: string }> {
    const id = `T_${Date.now()}`;
    const newTeacher: AttendanceTeacher = { id, name, subject, pin };
    const cached = getLocalCachedTeachers();
    cached.push(newTeacher);
    saveLocalCachedTeachers(cached);

    // Sync in background
    apiCall({ action: 'addTeacher', name, subject, pin }, 6000, 0).catch((e) => console.warn('Background addTeacher sync notice:', e));
    return { id };
  },

  async removeTeacher(id: string): Promise<void> {
    const cached = getLocalCachedTeachers().filter((t) => t.id !== id && t.name !== id);
    saveLocalCachedTeachers(cached);

    // Sync in background
    apiCall({ action: 'removeTeacher', id }, 6000, 0).catch((e) => console.warn('Background removeTeacher sync notice:', e));
  },

  async editRecord(
    recordId: string,
    checkIn: string,
    checkOut: string,
    teacherId?: string,
    date?: string
  ): Promise<void> {
    const cached = getLocalCachedRecords();
    const idx = cached.findIndex(
      (r) => r.id === recordId || (teacherId && date && r.teacherId === teacherId && r.date === date)
    );

    if (idx >= 0) {
      cached[idx] = {
        ...cached[idx],
        id: recordId,
        checkIn,
        checkOut,
        ...(teacherId ? { teacherId } : {}),
        ...(date ? { date } : {}),
      };
    } else {
      cached.push({
        id: recordId,
        teacherId: teacherId || 'unknown',
        date: date || new Date().toISOString().split('T')[0],
        checkIn,
        checkOut,
      });
    }

    saveLocalCachedRecords(cached);

    // Sync in background
    apiCall({ action: 'editRecord', recordId, checkIn, checkOut, teacherId: teacherId || '', date: date || '' }, 6000, 0).catch((e) => console.warn('Background editRecord sync notice:', e));
  },

  async deleteRecord(recordId: string, teacherId?: string, date?: string): Promise<void> {
    const cached = getLocalCachedRecords().filter(
      (r) => r.id !== recordId && !(teacherId && date && r.teacherId === teacherId && r.date === date)
    );
    saveLocalCachedRecords(cached);

    // Sync in background
    apiCall({ action: 'deleteRecord', recordId, teacherId: teacherId || '', date: date || '' }, 6000, 0).catch((e) => console.warn('Background deleteRecord sync notice:', e));
  }
};

export interface AttendanceSettings {
  geofencingEnabled: boolean;
  schoolLatitude: number;
  schoolLongitude: number;
  allowedRadius: number; // in meters
  lockMobileCheckIn: boolean; // if true, must use authorized kiosk device
  dailyPasscodeEnabled: boolean; // if true, must enter the rotating daily code
  dailyPasscodeSeed: string; // custom seed or string
  defaultArrivalTime?: string; // e.g. "09:00"
  teacherArrivalTimes?: Record<string, string>; // teacherId or name -> "HH:MM" 24-hr format
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  geofencingEnabled: false,
  schoolLatitude: 31.5204, // Default center
  schoolLongitude: 74.3587,
  allowedRadius: 100, // 100 meters
  lockMobileCheckIn: false,
  dailyPasscodeEnabled: false,
  dailyPasscodeSeed: '1234',
  defaultArrivalTime: '09:00',
  teacherArrivalTimes: {},
};

// Generates a 4-digit daily passcode deterministically based on date string and seed
export function getDailyPasscode(dateStr: string, seed: string = '1234'): string {
  let hash = 0;
  const combined = dateStr + seed;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const code = Math.abs(hash) % 10000;
  return String(code).padStart(4, '0');
}

// Calculates distance in meters between two coordinates using Haversine formula
export function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
