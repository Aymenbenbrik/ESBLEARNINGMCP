import { apiClient } from './client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EvaluationFeedback {
  id: number;
  exam_session_id: number;
  student_id: number;
  feedback_text: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  generated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = '/api/v1/feedback';

export const feedbackApi = {
  /** Generate AI feedback for a completed exam session */
  generate: async (examSessionId: number): Promise<EvaluationFeedback> => {
    const r = await apiClient.post<EvaluationFeedback>(`${BASE}/generate/${examSessionId}`);
    return r.data;
  },

  /** Get existing feedback for an exam session */
  get: async (examSessionId: number): Promise<EvaluationFeedback> => {
    const r = await apiClient.get<EvaluationFeedback>(`${BASE}/${examSessionId}`);
    return r.data;
  },
};
