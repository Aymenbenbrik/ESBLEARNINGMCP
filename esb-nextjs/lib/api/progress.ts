import { apiClient } from './client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChapterProgressData {
  chapter_id: number;
  chapter_title: string;
  chapter_order: number;
  visited: boolean;
  visited_at: string | null;
  documents_opened: number;
  documents_total: number;
  quiz_completed: boolean;
  quiz_score: number | null;
  tp_submitted: boolean;
  progress_percent: number;
  last_accessed: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
}

export interface CourseProgressSnapshot {
  student_id: number;
  course_id: number;
  course_title?: string;
  chapters_total: number;
  chapters_visited: number;
  chapters_completed: number;
  quizzes_total: number;
  quizzes_completed: number;
  quizzes_avg_score: number;
  tps_total: number;
  tps_submitted: number;
  documents_total: number;
  documents_opened: number;
  overall_progress: number;
  last_activity: string | null;
  computed_at: string | null;
}

export interface CourseProgressDetailResponse {
  course: { id: number; title: string };
  snapshot: CourseProgressSnapshot | null;
  chapters: ChapterProgressData[];
}

export interface AllProgressResponse {
  progress: CourseProgressSnapshot[];
}

export interface StudentProgressItem extends CourseProgressSnapshot {
  student_name: string;
  student_email: string;
  enrolled_at: string | null;
}

export interface CourseStudentsProgressResponse {
  course: { id: number; title: string };
  students: StudentProgressItem[];
}

export type TrackAction = 'visit_chapter' | 'open_document' | 'complete_quiz' | 'submit_tp';

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = '/api/v1/progress';

export const progressApi = {
  /** Get progress overview for all enrolled courses (current student) */
  getMyProgress: async (): Promise<AllProgressResponse> => {
    const r = await apiClient.get<AllProgressResponse>(`${BASE}/my`);
    return r.data;
  },

  /** Get detailed progress for a specific course (current student) */
  getMyCourseProgress: async (courseId: number): Promise<CourseProgressDetailResponse> => {
    const r = await apiClient.get<CourseProgressDetailResponse>(`${BASE}/my/${courseId}`);
    return r.data;
  },

  /** Record a progress event */
  track: async (data: {
    action: TrackAction;
    chapter_id: number;
    course_id?: number;
    score?: number;
  }) => {
    const r = await apiClient.post<{ message: string; chapter_progress: ChapterProgressData }>(
      `${BASE}/track`,
      data,
    );
    return r.data;
  },

  /** Teacher: get all students' progress for a course */
  getCourseStudentsProgress: async (courseId: number): Promise<CourseStudentsProgressResponse> => {
    const r = await apiClient.get<CourseStudentsProgressResponse>(`${BASE}/course/${courseId}/students`);
    return r.data;
  },
};
