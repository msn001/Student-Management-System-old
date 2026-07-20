import { Teacher, Student, ClassSlot, LessonEntry, StudentProfile } from '../types';
import { db } from './firebase';
import { doc, getDocFromServer, setDoc } from 'firebase/firestore';

// Storage Key Constants
const KEYS = {
  TEACHERS: 'teachers',
  STUDENTS: 'students',
  SLOTS: 'slots',
  STUDENT_PROFILES: 'studentProfiles',
  LOGS_PREFIX: 'logs-',
  SUBS_PREFIX: 'subs-',
};

// Global interface for AI Studio's platform storage
interface AIStudioStorage {
  get: (key: string, isJson?: boolean) => Promise<{ value?: string } | null>;
  set: (key: string, value: string, isJson?: boolean) => Promise<boolean>;
}

declare global {
  interface Window {
    storage?: AIStudioStorage;
  }
}

// Check if AI Studio storage is active
function isAIStudioActive(): boolean {
  return typeof window !== 'undefined' && typeof window.storage !== 'undefined';
}

// Fallback to local storage
const localStore = {
  get: (key: string): any => {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  },
  set: (key: string, val: any): void => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error('LocalStorage write failed:', e);
    }
  },
};

export class StorageService {
  // Load standard keys (with appropriate fallback)
  static async loadKey<T>(key: string, fallback: T): Promise<T> {
    if (db) {
      try {
        const docRef = doc(db, 'lesson_register_store', key);
        const docSnap = await getDocFromServer(docRef);
        if (docSnap.exists() && typeof docSnap.data().value !== 'undefined') {
          const val = JSON.parse(docSnap.data().value);
          localStore.set(key, val);
          return val as T;
        }
      } catch (e) {
        console.error(`Firebase load failed for ${key}, falling back to local`, e);
      }
    }
    if (isAIStudioActive() && window.storage) {
      try {
        const res = await window.storage.get(key, true);
        if (res && typeof res.value !== 'undefined') {
          return JSON.parse(res.value) as T;
        }
      } catch (e) {
        console.error(`AI Studio storage failed for ${key}, falling back`, e);
      }
    }
    const val = localStore.get(key);
    return val !== null ? (val as T) : fallback;
  }

  // Save standard keys
  static async saveKey<T>(key: string, value: T): Promise<boolean> {
    localStore.set(key, value);
    if (db) {
      try {
        const docRef = doc(db, 'lesson_register_store', key);
        await setDoc(docRef, { value: JSON.stringify(value) });
      } catch (e) {
        console.error(`Firebase save failed for ${key}`, e);
      }
    }
    if (isAIStudioActive() && window.storage) {
      try {
        const res = await window.storage.set(key, JSON.stringify(value), true);
        return !!res;
      } catch (e) {
        console.error(`AI Studio storage save failed for ${key}`, e);
        return false;
      }
    }
    return true;
  }

  // Get month log entries
  static async getMonthLogs(mKey: string): Promise<Record<string, Record<string, LessonEntry>>> {
    return this.loadKey<Record<string, Record<string, LessonEntry>>>(`${KEYS.LOGS_PREFIX}${mKey}`, {});
  }

  // Save month log entries
  static async saveMonthLogs(mKey: string, logs: Record<string, Record<string, LessonEntry>>): Promise<boolean> {
    return this.saveKey(`${KEYS.LOGS_PREFIX}${mKey}`, logs);
  }

  // Get substitute teacher overrides
  static async getMonthSubs(mKey: string): Promise<Record<string, Record<string, string>>> {
    return this.loadKey<Record<string, Record<string, string>>>(`${KEYS.SUBS_PREFIX}${mKey}`, {});
  }

  // Save substitute teacher overrides
  static async saveMonthSubs(mKey: string, subs: Record<string, Record<string, string>>): Promise<boolean> {
    return this.saveKey(`${KEYS.SUBS_PREFIX}${mKey}`, subs);
  }
}
