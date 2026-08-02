import { StorageService } from './storage';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzMBcrZEDAB9_u2pJmLEQlMgTz_566Udq688opiP8G8qPtpBc1rC-z9Ix1homUZJ8cm/exec';

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

// Resilient API Call with AbortController & Timeout
async function apiCall(params: Record<string, string>, timeoutMs = 6000) {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URL is not configured.');
  }

  const url = SCRIPT_URL + '?' + new URLSearchParams(params);
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  } catch (error: any) {
    clearTimeout(timer);
    const msg = error.name === 'AbortError' 
      ? 'Server response timed out (Google Sheets slow)' 
      : (error.message || 'Network error connecting to Google Sheets.');
    console.warn('Attendance API Notice:', msg);
    throw new Error(msg);
  }
}

export const AttendanceService = {
  // Fetch teachers from Google Apps Script or StorageService
  async getTeachers(): Promise<AttendanceTeacher[]> {
    try {
      const data = await apiCall({ action: 'getTeachers' }, 5000);
      if (data && Array.isArray(data.teachers) && data.teachers.length > 0) {
        // Normalize
        const teachers: AttendanceTeacher[] = data.teachers.map((t: any) => ({
          id: String(t.id || t.name),
          name: String(t.name || t.id),
          subject: t.subject || '',
          pin: t.pin || '',
        }));
        await StorageService.saveKey('teachers', teachers);
        return teachers;
      }
    } catch (e) {
      console.info('Fetching teachers from persistent app storage');
    }
    // Fallback to real persistent app teachers
    return await StorageService.loadKey<AttendanceTeacher[]>('teachers', []);
  },

  // Fetch monthly attendance records
  async getRecords(month: string): Promise<AttendanceRecord[]> {
    const mKey = month.slice(0, 7);
    const storageKey = `attendance_recs_${mKey}`;

    try {
      const data = await apiCall({ action: 'getRecords', month: mKey }, 6000);
      if (data && Array.isArray(data.records)) {
        const records: AttendanceRecord[] = data.records.map((r: any) => ({
          id: String(r.id || `REC_${r.teacherId}_${r.date}`),
          teacherId: String(r.teacherId || r.teacher || ''),
          date: String(r.date || ''),
          checkIn: String(r.checkIn || ''),
          checkOut: String(r.checkOut || ''),
        }));

        await StorageService.saveKey(storageKey, records);
        return records.filter((r) => r.date.startsWith(mKey));
      }
    } catch (e) {
      console.info(`Fetching ${mKey} records from persistent storage`);
    }

    // Load from real persistent storage
    const stored = await StorageService.loadKey<AttendanceRecord[]>(storageKey, []);
    return stored.filter((r) => r.date.startsWith(mKey));
  },

  // Teacher Scan (Check-in / Check-out)
  async scan(pin: string, date: string, time: string): Promise<{
    action: 'checkIn' | 'checkOut';
    recordId: string;
    teacher: string;
    date: string;
    time: string;
  }> {
    const mKey = date.slice(0, 7);
    const storageKey = `attendance_recs_${mKey}`;

    // Try remote scan first
    try {
      const remoteRes = await apiCall({ action: 'scan', pin, date, time }, 5000);
      if (remoteRes && remoteRes.recordId) {
        // Sync with StorageService
        const records = await StorageService.loadKey<AttendanceRecord[]>(storageKey, []);
        const recIdx = records.findIndex((r) => r.id === remoteRes.recordId);
        if (recIdx >= 0) {
          records[recIdx] = {
            ...records[recIdx],
            checkOut: remoteRes.action === 'checkOut' ? time : records[recIdx].checkOut,
          };
        } else {
          records.push({
            id: remoteRes.recordId,
            teacherId: remoteRes.teacher,
            date: remoteRes.date,
            checkIn: time,
            checkOut: '',
          });
        }
        await StorageService.saveKey(storageKey, records);
        return remoteRes;
      }
    } catch (err: any) {
      console.info('Remote scan offline fallback:', err.message);
    }

    // Local scan engine if remote unavailable
    const teachers = await StorageService.loadKey<AttendanceTeacher[]>('teachers', []);
    const matchedTeacher = teachers.find(
      (t) => t.pin === pin || t.id === pin || t.name.toLowerCase() === pin.toLowerCase()
    );

    if (!matchedTeacher) {
      throw new Error('Invalid PIN code. Please check and try again.');
    }

    const records = await StorageService.loadKey<AttendanceRecord[]>(storageKey, []);
    const openRecord = records.find(
      (r) => (r.teacherId === matchedTeacher.id || r.teacherId === matchedTeacher.name) &&
             r.date === date &&
             !r.checkOut
    );

    if (openRecord) {
      // Check-out
      openRecord.checkOut = time;
      await StorageService.saveKey(storageKey, records);
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
      records.push(newRec);
      await StorageService.saveKey(storageKey, records);
      return {
        action: 'checkIn',
        recordId,
        teacher: matchedTeacher.name,
        date,
        time,
      };
    }
  },

  // Add teacher
  async addTeacher(name: string, subject: string, pin: string): Promise<{ id: string }> {
    const id = `T_${Date.now()}`;
    const newTeacher: AttendanceTeacher = { id, name, subject, pin };

    const teachers = await StorageService.loadKey<AttendanceTeacher[]>('teachers', []);
    teachers.push(newTeacher);
    await StorageService.saveKey('teachers', teachers);

    apiCall({ action: 'addTeacher', name, subject, pin }, 6000).catch((e) => console.warn('Sync addTeacher notice:', e));
    return { id };
  },

  // Remove teacher
  async removeTeacher(id: string): Promise<void> {
    const teachers = await StorageService.loadKey<AttendanceTeacher[]>('teachers', []);
    const updated = teachers.filter((t) => t.id !== id && t.name !== id);
    await StorageService.saveKey('teachers', updated);

    apiCall({ action: 'removeTeacher', id }, 6000).catch((e) => console.warn('Sync removeTeacher notice:', e));
  },

  // Edit record
  async editRecord(recordId: string, checkIn: string, checkOut: string, teacherId?: string, date?: string): Promise<void> {
    if (date) {
      const mKey = date.slice(0, 7);
      const storageKey = `attendance_recs_${mKey}`;
      const records = await StorageService.loadKey<AttendanceRecord[]>(storageKey, []);
      const idx = records.findIndex((r) => r.id === recordId || (r.teacherId === teacherId && r.date === date));
      if (idx >= 0) {
        records[idx].checkIn = checkIn;
        records[idx].checkOut = checkOut;
      } else if (teacherId) {
        records.push({ id: recordId, teacherId, date, checkIn, checkOut });
      }
      await StorageService.saveKey(storageKey, records);
    }

    const params: Record<string, string> = { action: 'editRecord', recordId, checkIn, checkOut };
    if (teacherId) params.teacherId = teacherId;
    if (date) params.date = date;

    apiCall(params, 6000).catch((e) => console.warn('Sync editRecord notice:', e));
  },

  // Delete record
  async deleteRecord(recordId: string, date?: string): Promise<void> {
    if (date) {
      const mKey = date.slice(0, 7);
      const storageKey = `attendance_recs_${mKey}`;
      const records = await StorageService.loadKey<AttendanceRecord[]>(storageKey, []);
      const updated = records.filter((r) => r.id !== recordId);
      await StorageService.saveKey(storageKey, updated);
    }

    apiCall({ action: 'deleteRecord', recordId }, 6000).catch((e) => console.warn('Sync deleteRecord notice:', e));
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


