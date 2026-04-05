import apiClient from './client';

const BASE = (chapterId: number) => `/api/v1/chapters/${chapterId}/pipeline`;

export interface AgentState {
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  started_at?: string;
  done_at?: string;
  result_count?: number;
  error?: string;
}

export interface PipelineStatus {
  id?: number;
  chapter_id: number;
  status: 'idle' | 'running' | 'paused' | 'done' | 'failed';
  current_agent?: string;
  agents_state: Record<string, AgentState>;
  error_message?: string;
  exercise_count: number;
  tp_count: number;
}

export interface ExerciseQuestion {
  id: number;
  exercise_id: number;
  order: number;
  question_text: string;
  question_type: 'open_ended' | 'mcq' | 'code' | 'calculation' | 'true_false';
  choice_a?: string;
  choice_b?: string;
  choice_c?: string;
  choice_d?: string;
  correct_choice?: string;
  points: number;
  scoring_detail?: string;
  bloom_level?: string;
  difficulty?: string;
  aa_codes?: string[];
  estimated_duration_min?: number;
  model_answer?: string;
  answer_validated: boolean;
  correction_criteria?: string[];
  programming_language?: string;
}

export interface ChapterExercise {
  id: number;
  chapter_id: number;
  section_id?: number;
  source_document_id?: number;
  title: string;
  description?: string;
  exercise_type: 'consolidation' | 'tp';
  status: 'draft' | 'validated' | 'published';
  order: number;
  total_points?: number;
  estimated_duration_min?: number;
  aa_codes?: string[];
  bloom_levels?: string[];
  programming_language?: string;
  tp_nature?: string;
  questions?: ExerciseQuestion[];
}

export interface QBankExercise {
  id: number;
  course_id: number;
  chapter_id?: number;
  title: string;
  description?: string;
  exercise_type: string;
  status: string;
  total_points?: number;
  estimated_duration_min?: number;
  aa_codes?: string[];
  bloom_levels?: string[];
  progression_notes?: string;
  questions?: ExerciseQuestion[];
}

export const chapterPipelineApi = {
  getStatus: (chapterId: number): Promise<PipelineStatus> =>
    apiClient.get(`${BASE(chapterId)}/status`).then(r => r.data),

  run: (chapterId: number): Promise<{ ok: boolean; status: string; message: string }> =>
    apiClient.post(`${BASE(chapterId)}/run`).then(r => r.data),

  stop: (chapterId: number): Promise<{ ok: boolean; status: string }> =>
    apiClient.post(`${BASE(chapterId)}/stop`).then(r => r.data),

  reset: (chapterId: number): Promise<{ ok: boolean }> =>
    apiClient.post(`${BASE(chapterId)}/reset`).then(r => r.data),

  runAgent: (chapterId: number, agentName: string): Promise<{ ok: boolean; agent: string; result_count: number }> =>
    apiClient.post(`${BASE(chapterId)}/run-agent/${agentName}`).then(r => r.data),

  listExercises: (chapterId: number, type?: 'consolidation' | 'tp'): Promise<ChapterExercise[]> =>
    apiClient.get(`${BASE(chapterId)}/exercises${type ? `?type=${type}` : ''}`).then(r => r.data),

  createExercise: (chapterId: number, data: Partial<ChapterExercise>): Promise<ChapterExercise> =>
    apiClient.post(`${BASE(chapterId)}/exercises`, data).then(r => r.data),

  updateExercise: (chapterId: number, exId: number, data: Partial<ChapterExercise>): Promise<ChapterExercise> =>
    apiClient.put(`${BASE(chapterId)}/exercises/${exId}`, data).then(r => r.data),

  deleteExercise: (chapterId: number, exId: number): Promise<{ ok: boolean }> =>
    apiClient.delete(`${BASE(chapterId)}/exercises/${exId}`).then(r => r.data),

  publishExercise: (chapterId: number, exId: number): Promise<ChapterExercise> =>
    apiClient.post(`${BASE(chapterId)}/exercises/${exId}/publish`).then(r => r.data),

  updateQuestion: (chapterId: number, exId: number, qId: number, data: Partial<ExerciseQuestion>): Promise<ExerciseQuestion> =>
    apiClient.put(`${BASE(chapterId)}/exercises/${exId}/questions/${qId}`, data).then(r => r.data),

  addQuestion: (chapterId: number, exId: number, data: Partial<ExerciseQuestion>): Promise<ExerciseQuestion> =>
    apiClient.post(`${BASE(chapterId)}/exercises/${exId}/questions`, data).then(r => r.data),

  listQBankExercises: (chapterId: number): Promise<QBankExercise[]> =>
    apiClient.get(`${BASE(chapterId)}/qbank-exercises`).then(r => r.data),

  generateQBankExercise: (chapterId: number, data: {
    title: string;
    aa_codes?: string[];
    bloom_target?: string;
    question_count?: number;
    exercise_type?: string;
    language?: string;
  }): Promise<QBankExercise> =>
    apiClient.post(`${BASE(chapterId)}/qbank-exercises/generate`, data).then(r => r.data),
};
