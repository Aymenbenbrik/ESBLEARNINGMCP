import { apiClient } from './client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillGap {
  area: string;
  course_title: string;
  course_id: number;
  severity: 'high' | 'medium' | 'low';
  score: number;
  description: string;
}

export interface Recommendation {
  title: string;
  type: 'quiz' | 'revision' | 'exercise' | 'practice';
  priority: 'urgent' | 'important' | 'optional';
  course_title: string;
  course_id: number;
  target_bloom: string;
  description: string;
  estimated_duration_min: number;
}

export interface StudyPlanActivity {
  day_offset: number;
  title: string;
  type: 'revision' | 'exercise' | 'quiz';
  course_title: string;
  duration_min: number;
  description: string;
}

export interface StudyPlan {
  summary: string;
  activities: StudyPlanActivity[];
}

export interface PerformanceCourse {
  course_id: number;
  course_title: string;
  quizzes_completed: number;
  avg_score: number;
  bloom_rates: Record<string, number>;
  chapters_count: number;
}

export interface PerformanceData {
  courses: PerformanceCourse[];
  overall_avg: number;
  total_quizzes: number;
  bloom_scores: Record<string, number>;
  weak_areas: Array<{ type: string; name: string; score: number }>;
}

export interface CoachAnalysisResponse {
  performance: PerformanceData;
  skill_gaps: SkillGap[];
  recommendations: Recommendation[];
  study_plan: StudyPlan;
  llm_error?: string;
}

export interface SkillMapItem {
  skill: string;
  score: number;
  target: number;
}

export interface SkillMapResponse {
  course_id: number;
  student_id: number;
  skills: SkillMapItem[];
  overall_avg: number;
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = '/api/v1/coach';

export const coachApi = {
  /** Run AI analysis on current student */
  analyzeMe: async (): Promise<CoachAnalysisResponse> => {
    const r = await apiClient.get<CoachAnalysisResponse>(`${BASE}/analyze`);
    return r.data;
  },

  /** Teacher: analyze a specific student */
  analyzeStudent: async (studentId: number, courseId?: number): Promise<CoachAnalysisResponse> => {
    const params = courseId ? { course_id: courseId } : {};
    const r = await apiClient.get<CoachAnalysisResponse>(`${BASE}/analyze/${studentId}`, { params });
    return r.data;
  },

  /** Get skill map for radar chart */
  getSkillMap: async (studentId: number, courseId: number): Promise<SkillMapResponse> => {
    const r = await apiClient.get<SkillMapResponse>(`${BASE}/skill-map/${studentId}/${courseId}`);
    return r.data;
  },

  /** Get recommendations only */
  getRecommendations: async () => {
    const r = await apiClient.get<{
      recommendations: Recommendation[];
      skill_gaps: SkillGap[];
      study_plan: StudyPlan;
    }>(`${BASE}/recommendations`);
    return r.data;
  },
};
