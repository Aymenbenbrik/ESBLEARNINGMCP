import apiClient from './client';
import {
  PracticalWork,
  PracticalWorkSubmission,
  CreateTPData,
  UpdateTPData,
  GenerateStatementResult,
  SuggestAAResult,
  GenerateReferenceResult,
  SubmitCodeData,
  GradeSubmissionData,
  TPQuestion,
} from '../types/practicalWork';

const BASE = '/api/v1';

export const practicalWorkApi = {
  // List TPs for a section
  listForSection: async (sectionId: number): Promise<PracticalWork[]> => {
    const { data } = await apiClient.get(`${BASE}/sections/${sectionId}/practical-work`);
    return data.practical_works;
  },

  // Create TP (teacher)
  create: async (sectionId: number, payload: CreateTPData): Promise<PracticalWork> => {
    const { data } = await apiClient.post(`${BASE}/sections/${sectionId}/practical-work`, payload);
    return data.practical_work;
  },

  // Get single TP
  get: async (tpId: number): Promise<PracticalWork> => {
    const { data } = await apiClient.get(`${BASE}/practical-work/${tpId}`);
    return data.practical_work;
  },

  // Update TP (teacher)
  update: async (tpId: number, payload: UpdateTPData): Promise<PracticalWork> => {
    const { data } = await apiClient.put(`${BASE}/practical-work/${tpId}`, payload);
    return data.practical_work;
  },

  // Publish TP
  publish: async (tpId: number): Promise<PracticalWork> => {
    const { data } = await apiClient.put(`${BASE}/practical-work/${tpId}/publish`);
    return data.practical_work;
  },

  // Delete TP
  delete: async (tpId: number): Promise<void> => {
    await apiClient.delete(`${BASE}/practical-work/${tpId}`);
  },

  // AI: Generate statement
  generateStatement: async (tpId: number, hint?: string): Promise<GenerateStatementResult> => {
    const { data } = await apiClient.post(`${BASE}/practical-work/${tpId}/generate-statement`, { hint: hint || '' });
    return data;
  },

  // AI: Suggest AA codes
  suggestAA: async (tpId: number): Promise<SuggestAAResult> => {
    const { data } = await apiClient.post(`${BASE}/practical-work/${tpId}/suggest-aa`);
    return data;
  },

  // AI: Generate reference solution
  generateReference: async (tpId: number): Promise<GenerateReferenceResult> => {
    const { data } = await apiClient.post(`${BASE}/practical-work/${tpId}/generate-reference`);
    return data;
  },

  // AI: Parse statement into questions
  parseQuestions: async (tpId: number): Promise<TPQuestion[]> => {
    const { data } = await apiClient.post(`${BASE}/practical-work/${tpId}/parse-questions`);
    return data.questions;
  },

  // AI: Generate starter code for a question
  getQuestionStarter: async (tpId: number, questionId: number, questionText?: string): Promise<{
    comment_header: string;
    starter_code: string;
  }> => {
    const { data } = await apiClient.post(`${BASE}/practical-work/${tpId}/question-starter`, {
      question_id: questionId,
      question_text: questionText,
    });
    return data;
  },

  // Student: Submit code (single or multi-zone)
  submit: async (tpId: number, payload: SubmitCodeData): Promise<{ submission: PracticalWorkSubmission; message: string }> => {
    const { data } = await apiClient.post(`${BASE}/practical-work/${tpId}/submit`, payload);
    return data;
  },

  // Student: Get my submission
  getMySubmission: async (tpId: number): Promise<PracticalWorkSubmission | null> => {
    const { data } = await apiClient.get(`${BASE}/practical-work/${tpId}/my-submission`);
    return data.submission;
  },

  // Teacher: List all submissions
  listSubmissions: async (tpId: number): Promise<PracticalWorkSubmission[]> => {
    const { data } = await apiClient.get(`${BASE}/practical-work/${tpId}/submissions`);
    return data.submissions;
  },

  // Teacher: Grade a submission
  gradeSubmission: async (subId: number, payload: GradeSubmissionData): Promise<PracticalWorkSubmission> => {
    const { data } = await apiClient.put(`${BASE}/practical-work/submissions/${subId}/grade`, payload);
    return data.submission;
  },

  // Formative chatbot
  chat: async (
    tpId: number,
    questionId: number,
    studentMessage: string,
    conversationHistory: { role: string; content: string }[],
    studentCode?: string,
  ): Promise<{ reply: string }> => {
    const { data } = await apiClient.post(`${BASE}/practical-work/${tpId}/chat`, {
      question_id: questionId,
      student_message: studentMessage,
      conversation_history: conversationHistory,
      student_code: studentCode || '',
    });
    return data;
  },
};
