import { apiClient } from './client';
import type {
  ValidatedExam,
  ExamBankQuestion,
  ExamSession,
  ExamSessionAnswer,
  CreateExamData,
  GenerateFromTnData,
  ExamResultsSummary,
  FaceVerificationResult,
} from '@/lib/types/exam-bank';

// ── Exam CRUD ──────────────────────────────────────────────────────────────

export const examBankApi = {
  listExams: (courseId: number) =>
    apiClient.get<ValidatedExam[]>('/api/v1/exam-bank/', { params: { course_id: courseId } }),

  getExam: (examId: number) =>
    apiClient.get<ValidatedExam>(`/api/v1/exam-bank/${examId}`),

  createExam: (data: CreateExamData) =>
    apiClient.post<ValidatedExam>('/api/v1/exam-bank/', data),

  updateExam: (examId: number, data: Partial<ValidatedExam> & { exam_password?: string }) =>
    apiClient.put<ValidatedExam>(`/api/v1/exam-bank/${examId}`, data),

  deleteExam: (examId: number) =>
    apiClient.delete(`/api/v1/exam-bank/${examId}/delete`),

  generateFromTn: (data: GenerateFromTnData) =>
    apiClient.post<ValidatedExam>('/api/v1/exam-bank/generate-from-tn', data),

  publishExam: (examId: number) =>
    apiClient.post<ValidatedExam>(`/api/v1/exam-bank/${examId}/publish`),

  unpublishExam: (examId: number) =>
    apiClient.post<ValidatedExam>(`/api/v1/exam-bank/${examId}/unpublish`),

  autoCorrect: (examId: number) =>
    apiClient.post<{ graded_count: number; message: string }>(`/api/v1/exam-bank/${examId}/auto-correct`),

  validateScore: (sessionId: number, data: { question_id: number; score: number; feedback?: string }) =>
    apiClient.put<{ ok: boolean; session_score: number }>(`/api/v1/exam-bank/sessions/${sessionId}/validate-score`, data),

  uploadExamFile: (examId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`/api/v1/exam-bank/${examId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // ── Questions ────────────────────────────────────────────────────────────

  addQuestion: (examId: number, data: Partial<ExamBankQuestion>) =>
    apiClient.post<ExamBankQuestion>(`/api/v1/exam-bank/${examId}/questions`, data),

  updateQuestion: (examId: number, questionId: number, data: Partial<ExamBankQuestion>) =>
    apiClient.put<ExamBankQuestion>(`/api/v1/exam-bank/${examId}/questions/${questionId}`, data),

  deleteQuestion: (examId: number, questionId: number) =>
    apiClient.delete(`/api/v1/exam-bank/${examId}/questions/${questionId}`),

  generateAnswers: (examId: number) =>
    apiClient.post<{ message: string; generated_count: number; total_questions: number }>(
      `/api/v1/exam-bank/${examId}/generate-answers`
    ),

  // ── Sessions ─────────────────────────────────────────────────────────────

  startSession: (examId: number, isPreview?: boolean) =>
    apiClient.post<ExamSession>(`/api/v1/exam-bank/${examId}/sessions`, isPreview ? { is_preview: true } : {}),

  getSession: (sessionId: number) =>
    apiClient.get<ExamSession>(`/api/v1/exam-bank/sessions/${sessionId}`),

  saveAnswer: (
    sessionId: number,
    data: { question_id: number; student_answer?: string; student_choice?: string }
  ) => apiClient.post<ExamSessionAnswer>(`/api/v1/exam-bank/sessions/${sessionId}/answer`, data),

  submitSession: (sessionId: number, timeSpentSeconds: number) =>
    apiClient.post<ExamSession>(`/api/v1/exam-bank/sessions/${sessionId}/submit`, {
      time_spent_seconds: timeSpentSeconds,
    }),

  recordViolation: (sessionId: number, violationType: string, details?: string) =>
    apiClient.post(`/api/v1/exam-bank/sessions/${sessionId}/violation`, {
      violation_type: violationType,
      details,
    }),

  markFaceVerified: (sessionId: number, score: number) =>
    apiClient.post(`/api/v1/exam-bank/sessions/${sessionId}/face-verified`, { score }),

  getSessionResults: (sessionId: number) =>
    apiClient.get<ExamSession>(`/api/v1/exam-bank/sessions/${sessionId}/results`),

  // ── Results ──────────────────────────────────────────────────────────────

  getExamResults: (examId: number) =>
    apiClient.get<ExamResultsSummary>(`/api/v1/exam-bank/${examId}/results`),

  // ── Face/Photo ───────────────────────────────────────────────────────────

  uploadStudentPhoto: (studentId: number, photo: File) => {
    const formData = new FormData();
    formData.append('photo', photo);
    return apiClient.post(`/api/v1/exam-bank/student-photos/${studentId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  checkStudentPhoto: (studentId: number) =>
    apiClient.get<{ has_photo: boolean; student_id: number; uploaded_at?: string }>(
      `/api/v1/exam-bank/student-photos/${studentId}`
    ),

  verifyFace: (imageBase64: string, studentId?: number) =>
    apiClient.post<FaceVerificationResult>('/api/v1/exam-bank/verify-face', {
      image: imageBase64,
      student_id: studentId,
    }),

  publishFeedbacks: (examId: number, data: { session_ids: number[]; message?: string }) =>
    apiClient.post<{ published_count: number; message: string }>(
      `/api/v1/exam-bank/${examId}/publish-feedbacks`,
      data
    ),

  updateSessionFeedback: (sessionId: number, data: { feedback?: string; score?: number }) =>
    apiClient.put(`/api/v1/exam-bank/sessions/${sessionId}/feedback`, data),

  getCourseReview: (courseId: number) =>
    apiClient.get(`/api/v1/exam-bank/course-review/${courseId}`),
};
