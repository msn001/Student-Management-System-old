import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';

export interface AttendanceTeacher {
  id: string;
  name: string;
  subject?: string;
  pin: string; // 4-digit PIN
  expectedTime?: string; // HH:mm format, e.g., "08:00"
  active?: boolean;
}

export interface AttendanceRecord {
  id: string;
  teacherId: string;
  teacherName?: string;
  date: string; // YYYY-MM-DD
  checkIn: string; // HH:mm or HH:mm:ss
  checkOut: string; // HH:mm or HH:mm:ss
  status?: 'On Time' | 'Late' | 'Absent' | 'Working';
  lateMinutes?: number;
  updatedAt?: string;
}

export interface AttendanceSettings {
  latitude: number;
  longitude: number;
  maxDistanceMeters: number; // default 50m
  defaultExpectedTime: string; // default "08:00"
  adminPasscode?: string;
}

const DEFAULT_SETTINGS: AttendanceSettings = {
  latitude: 31.5204, // Default school location
  longitude: 74.3587,
  maxDistanceMeters: 50,
  defaultExpectedTime: '08:00',
  adminPasscode: '1234',
};

const DEFAULT_FALLBACK_TEACHERS: AttendanceTeacher[] = [
  { id: 'T1', name: 'Dr. Sarah Ahmed', subject: 'Mathematics', pin: '1001', expectedTime: '08:00', active: true },
  { id: 'T2', name: 'Prof. Ali Raza', subject: 'Physics', pin: '1002', expectedTime: '08:00', active: true },
  { id: 'T3', name: 'Ms. Fatima Khan', subject: 'English Literature', pin: '1003', expectedTime: '08:00', active: true },
  { id: 'T4', name: 'Mr. Usman Hassan', subject: 'Chemistry', pin: '1004', expectedTime: '08:00', active: true },
  { id: 'T5', name: 'Mrs. Ayesha Tariq', subject: 'Biology', pin: '1005', expectedTime: '08:00', active: true },
];

const LOCAL_STORAGE_KEYS = {
  TEACHERS: 'attendance_teachers_fb_v1',
  RECORDS: 'attendance_records_fb_v1',
  SETTINGS: 'attendance_settings_fb_v1',
};

// Haversine formula for calculating distance in meters
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  // Format can be "08:15", "08:15:30", "8:15 AM", etc.
  const clean = timeStr.trim().toUpperCase();
  let hours = 0;
  let minutes = 0;

  if (clean.includes('AM') || clean.includes('PM')) {
    const isPM = clean.includes('PM');
    const timePart = clean.replace(/AM|PM/, '').trim();
    const parts = timePart.split(':');
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  } else {
    const parts = clean.split(':');
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
  }

  return hours * 60 + minutes;
}

export const AttendanceService = {
  // --- SETTINGS ---
  async getSettings(): Promise<AttendanceSettings> {
    if (db) {
      try {
        const docRef = doc(db, 'attendance_settings', 'config');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as AttendanceSettings;
          localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(data));
          return { ...DEFAULT_SETTINGS, ...data };
        }
      } catch (e) {
        console.warn('Failed to fetch settings from Firestore:', e);
      }
    }
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.SETTINGS);
      if (cached) return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
    } catch (e) {}
    return DEFAULT_SETTINGS;
  },

  async saveSettings(settings: Partial<AttendanceSettings>): Promise<void> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(updated));

    if (db) {
      try {
        const docRef = doc(db, 'attendance_settings', 'config');
        await setDoc(docRef, updated, { merge: true });
      } catch (e) {
        console.error('Error saving attendance settings to Firestore:', e);
      }
    }
  },

  // --- TEACHERS ---
  async getTeachers(): Promise<AttendanceTeacher[]> {
    if (db) {
      try {
        const colRef = collection(db, 'attendance_teachers');
        const snap = await getDocs(colRef);
        if (!snap.empty) {
          const list: AttendanceTeacher[] = [];
          snap.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() } as AttendanceTeacher);
          });
          localStorage.setItem(LOCAL_STORAGE_KEYS.TEACHERS, JSON.stringify(list));
          return list;
        }
      } catch (e) {
        console.warn('Failed to fetch teachers from Firestore:', e);
      }
    }

    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.TEACHERS);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}

    return DEFAULT_FALLBACK_TEACHERS;
  },

  async saveTeacher(teacher: AttendanceTeacher): Promise<void> {
    const list = await this.getTeachers();
    const idx = list.findIndex((t) => t.id === teacher.id || t.name === teacher.name);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...teacher };
    } else {
      list.push(teacher);
    }
    localStorage.setItem(LOCAL_STORAGE_KEYS.TEACHERS, JSON.stringify(list));

    if (db) {
      try {
        const docRef = doc(db, 'attendance_teachers', teacher.id);
        await setDoc(docRef, teacher, { merge: true });
      } catch (e) {
        console.error('Error saving teacher to Firestore:', e);
      }
    }
  },

  async deleteTeacher(teacherId: string): Promise<void> {
    const list = (await this.getTeachers()).filter((t) => t.id !== teacherId);
    localStorage.setItem(LOCAL_STORAGE_KEYS.TEACHERS, JSON.stringify(list));

    if (db) {
      try {
        const docRef = doc(db, 'attendance_teachers', teacherId);
        await deleteDoc(docRef);
      } catch (e) {
        console.error('Error deleting teacher from Firestore:', e);
      }
    }
  },

  // Sync main app teachers into attendance_teachers if needed
  async syncMainTeachers(mainTeachers: { id: string; name: string; subject?: string }[]): Promise<AttendanceTeacher[]> {
    const currentAttendanceTeachers = await this.getTeachers();
    const updatedList: AttendanceTeacher[] = [...currentAttendanceTeachers];
    let changed = false;

    for (const mt of mainTeachers) {
      const exists = updatedList.find((t) => t.id === mt.id || t.name.toLowerCase() === mt.name.toLowerCase());
      if (!exists) {
        const newTeacher: AttendanceTeacher = {
          id: mt.id || `T_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          name: mt.name,
          subject: mt.subject || '',
          pin: '1234', // Default PIN
          expectedTime: '08:00',
          active: true,
        };
        updatedList.push(newTeacher);
        changed = true;
        if (db) {
          setDoc(doc(db, 'attendance_teachers', newTeacher.id), newTeacher, { merge: true }).catch(() => {});
        }
      }
    }

    if (changed) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.TEACHERS, JSON.stringify(updatedList));
    }
    return updatedList;
  },

  // --- ATTENDANCE RECORDS ---
  async getRecordsForMonth(monthStr: string): Promise<AttendanceRecord[]> {
    let records: AttendanceRecord[] = [];

    if (db) {
      try {
        const colRef = collection(db, 'attendance_records');
        // Query records where date >= monthStr-01 and date <= monthStr-31
        const start = `${monthStr}-01`;
        const end = `${monthStr}-31`;
        const q = query(colRef, where('date', '>=', start), where('date', '<=', end));
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          records.push({ id: docSnap.id, ...docSnap.data() } as AttendanceRecord);
        });
      } catch (e) {
        console.warn('Error querying Firestore for month records:', e);
      }
    }

    // Combine/overlay with local cache
    try {
      const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEYS.RECORDS);
      if (cachedRaw) {
        const cachedList: AttendanceRecord[] = JSON.parse(cachedRaw);
        const map = new Map<string, AttendanceRecord>();
        records.forEach((r) => map.set(r.id, r));
        cachedList.forEach((cr) => {
          if (cr.date.startsWith(monthStr)) {
            map.set(cr.id, { ...(map.get(cr.id) || {}), ...cr });
          }
        });
        records = Array.from(map.values());
      }
    } catch (e) {}

    return records;
  },

  async getRecordsForDate(dateStr: string): Promise<AttendanceRecord[]> {
    let records: AttendanceRecord[] = [];

    if (db) {
      try {
        const colRef = collection(db, 'attendance_records');
        const q = query(colRef, where('date', '==', dateStr));
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          records.push({ id: docSnap.id, ...docSnap.data() } as AttendanceRecord);
        });
      } catch (e) {
        console.warn('Error querying Firestore for date records:', e);
      }
    }

    // Merge with local storage
    try {
      const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEYS.RECORDS);
      if (cachedRaw) {
        const cachedList: AttendanceRecord[] = JSON.parse(cachedRaw);
        const map = new Map<string, AttendanceRecord>();
        records.forEach((r) => map.set(r.id, r));
        cachedList.forEach((cr) => {
          if (cr.date === dateStr) {
            map.set(cr.id, { ...(map.get(cr.id) || {}), ...cr });
          }
        });
        records = Array.from(map.values());
      }
    } catch (e) {}

    return records;
  },

  async getAllRecords(): Promise<AttendanceRecord[]> {
    let records: AttendanceRecord[] = [];

    if (db) {
      try {
        const colRef = collection(db, 'attendance_records');
        const snap = await getDocs(colRef);
        snap.forEach((docSnap) => {
          records.push({ id: docSnap.id, ...docSnap.data() } as AttendanceRecord);
        });
      } catch (e) {
        console.warn('Error fetching all records from Firestore:', e);
      }
    }

    try {
      const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEYS.RECORDS);
      if (cachedRaw) {
        const cachedList: AttendanceRecord[] = JSON.parse(cachedRaw);
        const map = new Map<string, AttendanceRecord>();
        records.forEach((r) => map.set(r.id, r));
        cachedList.forEach((cr) => map.set(cr.id, { ...(map.get(cr.id) || {}), ...cr }));
        records = Array.from(map.values());
      }
    } catch (e) {}

    return records;
  },

  async saveRecord(record: AttendanceRecord): Promise<void> {
    // 1. Update local cache
    try {
      const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEYS.RECORDS);
      let list: AttendanceRecord[] = cachedRaw ? JSON.parse(cachedRaw) : [];
      const idx = list.findIndex((r) => r.id === record.id || (r.teacherId === record.teacherId && r.date === record.date));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...record };
      } else {
        list.push(record);
      }
      localStorage.setItem(LOCAL_STORAGE_KEYS.RECORDS, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed saving record to local cache:', e);
    }

    // 2. Save to Firestore
    if (db) {
      try {
        const docRef = doc(db, 'attendance_records', record.id);
        await setDoc(docRef, { ...record, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        console.error('Error saving attendance record to Firestore:', e);
      }
    }
  },

  async deleteRecord(recordId: string): Promise<void> {
    try {
      const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEYS.RECORDS);
      if (cachedRaw) {
        const list: AttendanceRecord[] = JSON.parse(cachedRaw);
        const updated = list.filter((r) => r.id !== recordId);
        localStorage.setItem(LOCAL_STORAGE_KEYS.RECORDS, JSON.stringify(updated));
      }
    } catch (e) {}

    if (db) {
      try {
        const docRef = doc(db, 'attendance_records', recordId);
        await deleteDoc(docRef);
      } catch (e) {
        console.error('Error deleting record from Firestore:', e);
      }
    }
  },

  // Delete all attendance records for a custom month e.g., "2026-03"
  async deleteCustomMonthRecords(monthStr: string): Promise<number> {
    let count = 0;

    // 1. Clear local cache for month
    try {
      const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEYS.RECORDS);
      if (cachedRaw) {
        const list: AttendanceRecord[] = JSON.parse(cachedRaw);
        const filtered = list.filter((r) => !r.date.startsWith(monthStr));
        count += list.length - filtered.length;
        localStorage.setItem(LOCAL_STORAGE_KEYS.RECORDS, JSON.stringify(filtered));
      }
    } catch (e) {}

    // 2. Clear Firestore
    if (db) {
      try {
        const colRef = collection(db, 'attendance_records');
        const start = `${monthStr}-01`;
        const end = `${monthStr}-31`;
        const q = query(colRef, where('date', '>=', start), where('date', '<=', end));
        const snap = await getDocs(q);
        const deletePromises: Promise<void>[] = [];
        snap.forEach((docSnap) => {
          deletePromises.push(deleteDoc(doc(db, 'attendance_records', docSnap.id)));
        });
        await Promise.all(deletePromises);
        if (snap.size > count) count = snap.size;
      } catch (e) {
        console.error('Error deleting custom month records from Firestore:', e);
      }
    }

    return count;
  },

  // Keep attendance of only last 6 months (auto-purge records older than 6 months)
  async purgeOlderThanSixMonths(): Promise<number> {
    const today = new Date();
    // 6 months ago cutoff
    const cutoff = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    const cutoffStr = cutoff.toISOString().split('T')[0]; // YYYY-MM-01

    let deletedCount = 0;

    // 1. Local storage cleanup
    try {
      const cachedRaw = localStorage.getItem(LOCAL_STORAGE_KEYS.RECORDS);
      if (cachedRaw) {
        const list: AttendanceRecord[] = JSON.parse(cachedRaw);
        const remaining = list.filter((r) => r.date >= cutoffStr);
        deletedCount += list.length - remaining.length;
        localStorage.setItem(LOCAL_STORAGE_KEYS.RECORDS, JSON.stringify(remaining));
      }
    } catch (e) {}

    // 2. Firestore cleanup
    if (db) {
      try {
        const colRef = collection(db, 'attendance_records');
        const q = query(colRef, where('date', '<', cutoffStr));
        const snap = await getDocs(q);
        const deletePromises: Promise<void>[] = [];
        snap.forEach((docSnap) => {
          deletePromises.push(deleteDoc(doc(db, 'attendance_records', docSnap.id)));
        });
        await Promise.all(deletePromises);
        if (snap.size > deletedCount) deletedCount = snap.size;
      } catch (e) {
        console.error('Error purging old records from Firestore:', e);
      }
    }

    return deletedCount;
  }
};
