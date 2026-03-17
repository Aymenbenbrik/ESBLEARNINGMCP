/**
 * Practice Quiz API Client
 * Handles API calls for student practice quizzes from question bank
 */

import { apiClient } from './client';

export interface PracticeQuizAvailability {
  available: boolean;
  count: number;
  chapter_title: string | null;
}

export interface PracticeQuizAttempts {
  attempts_used: number;
  attempts_remaining: number;
  max_attempts: number;
  can_take_quiz: boolean;
}

export interface PracticeQuiz {
  id: number;
  course_id: number;
  chapter_id: number;
  chapter_title: string | null;
  attempt_number: number;
  max_attempts: number;
  num_questions: number;
  score: number | null;
  is_completed: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface PracticeQuizQuestion {
  id: number;
  index: number;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  question_type: string;
  student_choice: string | null;
  is_correct: boolean | null;
  correct_choice?: string;
  explanation?: string;
  bloom_level?: string;
  clo?: string;
  difficulty?: string;
}

export interface PracticeQuizResults {
  quiz_id: number;
  course_id: number;
  chapter_id: number;
  chapter_title: string | null;
  attempt_number: number;
  score: number;
  num_questions: number;
  correct_count: number;
  completed_at: string | null;
  questions: PracticeQuizQuestion[];
}

export const practiceQuizApi = {
  /**
   * Check if approved questions are available for a chapter
   */
  checkAvailability: async (chapterId: number): Promise<PracticeQuizAvailability> => {
    const response = await apiClient.get<PracticeQuizAvailability>(`/api/v1/practice-quiz/chapters/${chapterId}/availability`);
    return response.data;
  },

  /**
   * Get attempt count for current student in a chapter
   */
  getAttempts: async (chapterId: number): Promise<PracticeQuizAttempts> => {
    const response = await apiClient.get<PracticeQuizAttempts>(`/api/v1/practice-quiz/attempts/${chapterId}`);
    return response.data;
  },

  /**
   * Create and start a new practice quiz
   */
  start: async (chapterId: number, numQuestions: number = 8): Promise<{ quiz_id: number; num_questions: number; attempt_number: number; message: string }> => {
    const response = await apiClient.post<{ quiz_id: number; num_questions: number; attempt_number: number; message: string }>(
      `/api/v1/practice-quiz/chapters/${chapterId}/start`,
      { num_questions: numQuestions }
    );
    return response.data;
  },

  /**
   * Get practice quiz metadata
   */
  get: async (quizId: number): Promise<PracticeQuiz> => {
    const response = await apiClient.get<PracticeQuiz>(`/api/v1/practice-quiz/${quizId}`);
    return response.data;
  },

  /**
   * Get questions for a practice quiz (answers hidden until completed)
   */
  getQuestions: async (quizId: number): Promise<{ questions: PracticeQuizQuestion[] }> => {
    const response = await apiClient.get<{ questions: PracticeQuizQuestion[] }>(`/api/v1/practice-quiz/${quizId}/questions`);
    return response.data;
  },

  /**
   * Submit an answer for a specific question
   */
  submitAnswer: async (quizId: number, questionIndex: number, answer: string): Promise<{ success: boolean; is_correct: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; is_correct: boolean; message: string }>(
      `/api/v1/practice-quiz/${quizId}/answer/${questionIndex}`,
      { answer }
    );
    return response.data;
  },

  /**
   * Complete and grade a practice quiz
   */
  complete: async (quizId: number): Promise<{ score: number; correct_count: number; total_count: number; percentage: number }> => {
    const response = await apiClient.post<{ score: number; correct_count: number; total_count: number; percentage: number }>(
      `/api/v1/practice-quiz/${quizId}/complete`
    );
    return response.data;
  },

  /**
   * Get results for a completed practice quiz
   */
  getResults: async (quizId: number): Promise<PracticeQuizResults> => {
    const response = await apiClient.get<PracticeQuizResults>(`/api/v1/practice-quiz/${quizId}/results`);
    return response.data;
  },
};
