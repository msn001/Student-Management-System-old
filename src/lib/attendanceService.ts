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
