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

  // Save standard keys with automatic history snapshot backing
  static async saveKey<T>(key: string, value: T): Promise<boolean> {
    localStore.set(key, value);

    // Auto-create history snapshot for core keys
    if (['teachers', 'students', 'slots', 'studentProfiles', 'dailyAdjustments'].includes(key)) {
      this.createBackupSnapshot(key, value);
    }

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

  // Create timestamped snapshot in localStorage (max 10 retained per key)
  static createBackupSnapshot(key: string, data: any): void {
    try {
      if (!data) return;
      const historyKey = `backup_snapshots_${key}`;
      const existingRaw = localStorage.getItem(historyKey);
      let history: { id: string; timestamp: string; label: string; count: number; data: any }[] = existingRaw ? JSON.parse(existingRaw) : [];

      const count = Array.isArray(data) ? data.length : Object.keys(data).length;
      const now = new Date();
      const timestampStr = now.toISOString();
      const labelStr = `${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

      // Don't duplicate if identical data saved within 5 seconds
      if (history.length > 0) {
        const last = history[0];
        if (JSON.stringify(last.data) === JSON.stringify(data)) {
          return;
        }
      }

      history.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        timestamp: timestampStr,
        label: labelStr,
        count,
        data: JSON.parse(JSON.stringify(data)),
      });

      // Retain max 10 snapshots
      if (history.length > 10) {
        history = history.slice(0, 10);
      }

      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch (e) {
      console.error(`Error saving backup snapshot for ${key}:`, e);
    }
  }

  // Get list of available backup snapshots for a key
  static getBackupSnapshots(key: string): { id: string; timestamp: string; label: string; count: number; data: any }[] {
    try {
      const historyKey = `backup_snapshots_${key}`;
      const existingRaw = localStorage.getItem(historyKey);
      return existingRaw ? JSON.parse(existingRaw) : [];
    } catch {
      return [];
    }
  }

  // Restore a specific backup snapshot
  static async restoreBackupSnapshot(key: string, snapshotId: string): Promise<boolean> {
    const snapshots = this.getBackupSnapshots(key);
    const target = snapshots.find((s) => s.id === snapshotId);
    if (!target) return false;

    return await this.saveKey(key, target.data);
  }

  // Export full system JSON backup
  static async exportFullBackup(): Promise<string> {
    const teachers = await this.loadKey<Teacher[]>('teachers', []);
    const students = await this.loadKey<Student[]>('students', []);
    const slots = await this.loadKey<ClassSlot[]>('slots', []);
    const studentProfiles = await this.loadKey<Record<string, StudentProfile>>('studentProfiles', {});
    const dailyAdjustments = await this.loadKey<Record<string, any>>('dailyAdjustments', {});
    const schoolLogo = localStorage.getItem('lesson_register_logo') || '';

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      teachers,
      students,
      slots,
      studentProfiles,
      dailyAdjustments,
      schoolLogo,
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Import full system JSON backup
  static async importFullBackup(jsonStr: string): Promise<{ success: boolean; message: string }> {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') {
        return { success: false, message: 'Invalid JSON file format.' };
      }

      if (Array.isArray(data.teachers)) {
        await this.saveKey('teachers', data.teachers);
      }
      if (Array.isArray(data.students)) {
        await this.saveKey('students', data.students);
      }
      if (Array.isArray(data.slots)) {
        await this.saveKey('slots', data.slots);
      }
      if (data.studentProfiles && typeof data.studentProfiles === 'object') {
        await this.saveKey('studentProfiles', data.studentProfiles);
      }
      if (data.dailyAdjustments && typeof data.dailyAdjustments === 'object') {
        await this.saveKey('dailyAdjustments', data.dailyAdjustments);
      }
      if (data.schoolLogo) {
        localStorage.setItem('lesson_register_logo', data.schoolLogo);
        await this.saveKey('schoolLogo', data.schoolLogo);
      }

      return { success: true, message: 'Backup restored successfully!' };
    } catch (e: any) {
      return { success: false, message: `Failed to import backup: ${e.message}` };
    }
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
