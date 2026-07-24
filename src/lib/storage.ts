import { Teacher, Student, ClassSlot, LessonEntry, StudentProfile } from '../types';
import { db } from './firebase';
import { doc, getDocFromServer, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';

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

  // Delete a key
  static async deleteKey(key: string): Promise<boolean> {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('LocalStorage removeItem failed:', e);
    }
    if (db) {
      try {
        const docRef = doc(db, 'lesson_register_store', key);
        await deleteDoc(docRef);
      } catch (e) {
        console.error(`Firebase delete failed for ${key}`, e);
      }
    }
    if (isAIStudioActive() && window.storage) {
      try {
        await window.storage.set(key, '', true);
      } catch (e) {
        console.error(`AI Studio storage delete failed for ${key}`, e);
      }
    }
    return true;
  }

  // Scan records older than cutoffMonthKey (e.g. "2024-07") without deleting
  static async scanOldRecords(cutoffMonthKey: string): Promise<{
    logMonths: string[];
    subMonths: string[];
    adjustmentCount: number;
    totalLogEntriesCount: number;
  }> {
    const logMonthsSet = new Set<string>();
    const subMonthsSet = new Set<string>();
    let adjustmentCount = 0;
    let totalLogEntriesCount = 0;

    // 1. Scan Firestore
    if (db) {
      try {
        const querySnapshot = await getDocs(collection(db, 'lesson_register_store'));
        querySnapshot.forEach((docSnap) => {
          const id = docSnap.id;
          if (id.startsWith('logs-')) {
            const mKey = id.replace('logs-', '');
            if (mKey < cutoffMonthKey) {
              logMonthsSet.add(mKey);
              try {
                const parsed = JSON.parse(docSnap.data().value || '{}');
                // Count entries in parsed object
                Object.values(parsed).forEach((slotObj: any) => {
                  totalLogEntriesCount += Object.keys(slotObj || {}).length;
                });
              } catch {}
            }
          } else if (id.startsWith('subs-')) {
            const mKey = id.replace('subs-', '');
            if (mKey < cutoffMonthKey) {
              subMonthsSet.add(mKey);
            }
          }
        });
      } catch (e) {
        console.error('Error scanning Firestore for old records:', e);
      }
    }

    // 2. Scan LocalStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          if (key.startsWith('logs-')) {
            const mKey = key.replace('logs-', '');
            if (mKey < cutoffMonthKey) {
              logMonthsSet.add(mKey);
            }
          } else if (key.startsWith('subs-')) {
            const mKey = key.replace('subs-', '');
            if (mKey < cutoffMonthKey) {
              subMonthsSet.add(mKey);
            }
          }
        }
      }
    } catch (e) {
      console.error('Error scanning localStorage for old records:', e);
    }

    // 3. Scan dailyAdjustments
    try {
      const currentAdjustments = await StorageService.loadKey<Record<string, any>>('dailyAdjustments', {});
      const cutoffDateStr = `${cutoffMonthKey}-01`;
      for (const dateStr of Object.keys(currentAdjustments)) {
        if (dateStr < cutoffDateStr) {
          adjustmentCount++;
        }
      }
    } catch (e) {
      console.error('Error scanning dailyAdjustments:', e);
    }

    return {
      logMonths: Array.from(logMonthsSet).sort(),
      subMonths: Array.from(subMonthsSet).sort(),
      adjustmentCount,
      totalLogEntriesCount
    };
  }

  // Delete records older than cutoffMonthKey
  static async pruneOldRecords(cutoffMonthKey: string): Promise<{
    deletedLogKeys: string[];
    deletedSubKeys: string[];
    prunedAdjustmentsCount: number;
  }> {
    const scan = await this.scanOldRecords(cutoffMonthKey);
    const deletedLogKeys: string[] = [];
    const deletedSubKeys: string[] = [];

    // Delete logs
    for (const mKey of scan.logMonths) {
      const logKey = `logs-${mKey}`;
      await StorageService.deleteKey(logKey);
      deletedLogKeys.push(logKey);
    }

    // Delete subs
    for (const mKey of scan.subMonths) {
      const subKey = `subs-${mKey}`;
      await StorageService.deleteKey(subKey);
      deletedSubKeys.push(subKey);
    }

    // Delete dailyAdjustments entries before cutoff
    let prunedAdjustmentsCount = 0;
    try {
      const currentAdjustments = await StorageService.loadKey<Record<string, any>>('dailyAdjustments', {});
      const updatedAdjustments: Record<string, any> = {};
      const cutoffDateStr = `${cutoffMonthKey}-01`;
      let changed = false;

      for (const [dateStr, val] of Object.entries(currentAdjustments)) {
        if (dateStr < cutoffDateStr) {
          prunedAdjustmentsCount++;
          changed = true;
        } else {
          updatedAdjustments[dateStr] = val;
        }
      }

      if (changed) {
        await StorageService.saveKey('dailyAdjustments', updatedAdjustments);
      }
    } catch (e) {
      console.error('Error pruning dailyAdjustments:', e);
    }

    return {
      deletedLogKeys,
      deletedSubKeys,
      prunedAdjustmentsCount
    };
  }
}
