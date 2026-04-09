import { apiClient } from './client';
import {
  StudentAAScoresResponse,
  StudentAAPScoresResponse,
  AAEvaluationResponse,
  AAPEvaluationResponse,
  CalculateScoresResponse,
} from '../types/evaluation';

const BASE = '/api/v1/evaluation';

export const evaluationApi = {
  getStudentAAScores: async (
    studentId: number,
    courseId?: number
  ): Promise<StudentAAScoresResponse> => {
    const params = courseId ? { course_id: courseId } : {};
    const { data } = await apiClient.get<StudentAAScoresResponse>(
      `${BASE}/students/${studentId}/aa-scores`,
      { params }
    );
    return data;
  },

  getStudentAAPScores: async (
    studentId: number,
    programId?: number
  ): Promise<StudentAAPScoresResponse> => {
    const params = programId ? { program_id: programId } : {};
    const { data } = await apiClient.get<StudentAAPScoresResponse>(
      `${BASE}/students/${studentId}/aap-scores`,
      { params }
    );
    return data;
  },

  // ── Teacher / Admin endpoints ─────────────────────────────────

  /** Get AA evaluation heatmap data for a course (teacher) */
  getCourseAAEvaluation: async (courseId: number): Promise<AAEvaluationResponse> => {
    const { data } = await apiClient.get<AAEvaluationResponse>(
      `${BASE}/courses/${courseId}/aa-evaluation`
    );
    return data;
  },

  /** Trigger AA score calculation for a course (teacher) */
  calculateCourseAAScores: async (courseId: number): Promise<CalculateScoresResponse> => {
    const { data } = await apiClient.post<CalculateScoresResponse>(
      `${BASE}/courses/${courseId}/calculate-aa-scores`
    );
    return data;
  },

  /** Get AAP evaluation heatmap data for a program (admin) */
  getProgramAAPEvaluation: async (programId: number): Promise<AAPEvaluationResponse> => {
    const { data } = await apiClient.get<AAPEvaluationResponse>(
      `${BASE}/programs/${programId}/aap-evaluation`
    );
    return data;
  },

  /** Trigger AAP score calculation for a program (admin) */
  calculateProgramAAPScores: async (programId: number): Promise<CalculateScoresResponse> => {
    const { data } = await apiClient.post<CalculateScoresResponse>(
      `${BASE}/programs/${programId}/calculate-aap-scores`
    );
    return data;
  },
};
