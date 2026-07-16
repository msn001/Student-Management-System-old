export interface Teacher {
  id: string;
  name: string;
}

export interface Student {
  id: string;
  name: string;
  teamsId?: string;
  zoom?: string;
  googleMeet?: string;
}

export interface ClassSlot {
  id: string;
  studentId: string;
  teacherId: string;
  subject: string;
  day: number; // 0 = Sunday, 1 = Monday, etc.
  time: string; // "HH:MM"
  duration: number; // in minutes
}

export interface LessonEntry {
  status: 'present' | 'absent' | 'leave' | '';
  actualDuration: number;
  lessonSource?: string; // "Qaida" | "Quran" | ""
  lessonDetail?: string; // details of verse/page
  content: string; // notes of what was taught
  remarks: string; // teacher's remarks
  loggedBy: string; // name of teacher who logged it
  loggedAt: string; // ISO timestamp
}

export interface StudentProfile {
  book: string;
  qaida: string;
  notes: string;
  subInstructions: string;
  updatedBy: string; // teacherId
  updatedAt: string; // "YYYY-MM-DD"
}
