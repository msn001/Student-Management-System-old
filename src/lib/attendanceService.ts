// Service to interact with the Google Apps Script Teacher Attendance backend

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzMBcrZEDAB9_u2pJmLEQlMgTz_566Udq688opiP8G8qPtpBc1rC-z9Ix1homUZJ8cm/exec';

export interface AttendanceTeacher {
  id: string;
  name: string;
  subject?: string;
  pin?: string; // PIN is only present in current session after adding a teacher
}

export interface AttendanceRecord {
  id: string;
  teacherId: string;
  date: string;
  checkIn: string;
  checkOut: string;
}

async function apiCall(params: Record<string, string>) {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URL is not configured.');
  }

  const url = SCRIPT_URL + '?' + new URLSearchParams(params);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  } catch (error: any) {
    console.error('Attendance API Error:', error);
    throw new Error(error.message || 'Network error connecting to Google Sheets.');
  }
}

export const AttendanceService = {
  async getTeachers(): Promise<AttendanceTeacher[]> {
    const data = await apiCall({ action: 'getTeachers' });
    return data.teachers || [];
  },

  async getRecords(month: string): Promise<AttendanceRecord[]> {
    const data = await apiCall({ action: 'getRecords', month });
    return data.records || [];
  },

  async scan(pin: string, date: string, time: string): Promise<{
    action: 'checkIn' | 'checkOut';
    recordId: string;
    teacher: string;
    date: string;
    time: string;
  }> {
    return await apiCall({ action: 'scan', pin, date, time });
  },

  async addTeacher(name: string, subject: string, pin: string): Promise<{ id: string }> {
    return await apiCall({ action: 'addTeacher', name, subject, pin });
  },

  async removeTeacher(id: string): Promise<void> {
    await apiCall({ action: 'removeTeacher', id });
  },

  async editRecord(recordId: string, checkIn: string, checkOut: string): Promise<void> {
    await apiCall({ action: 'editRecord', recordId, checkIn, checkOut });
  },

  async deleteRecord(recordId: string): Promise<void> {
    await apiCall({ action: 'deleteRecord', recordId });
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

