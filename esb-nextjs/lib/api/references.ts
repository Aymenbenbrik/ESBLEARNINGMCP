import { apiClient } from './client';
import {
  CourseReference,
  ChapterReferenceLink,
  CreateReferenceData,
  UpdateReferenceData,
  UpdateChapterReferenceData,
  ImportBibResult,
  SectionContent,
  UpdateSectionContentData,
  SectionActivity,
  SectionQuiz,
  SectionQuizQuestion,
  SectionQuizSubmission,
  SectionQuizSubmissionDetailed,
  GradedAnswer,
  TakeQuizResponse,
  SubmitQuizResponse,
  QuizConfig,
  QuizBankStats,
  CreateQuizFromBankData,
  SectionAssignment,
  AssignmentSubmission,
} from '../types/references';

// ─── Course References ────────────────────────────────────────────────────────

export const referencesApi = {
  /**
   * List all references for a course.
   * Pass chapterId to also get linked_to_chapter + pages for each ref.
   */
  listForCourse: async (courseId: number, chapterId?: number): Promise<CourseReference[]> => {
    const params = chapterId ? `?chapter_id=${chapterId}` : '';
    const res = await apiClient.get<{ references: CourseReference[] }>(
      `/api/v1/courses/${courseId}/references${params}`
    );
    return res.data.references;
  },

  /** Create a manual reference for a course */
  create: async (courseId: number, data: CreateReferenceData): Promise<CourseReference> => {
    const res = await apiClient.post<CourseReference>(
      `/api/v1/courses/${courseId}/references`,
      data
    );
    return res.data;
  },

  /** Update reference metadata */
  update: async (refId: number, data: UpdateReferenceData): Promise<CourseReference> => {
    const res = await apiClient.put<CourseReference>(`/api/v1/references/${refId}`, data);
    return res.data;
  },

  /** Delete a reference */
  delete: async (refId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/references/${refId}`);
  },

  /** Import TN bibliography entries as references (idempotent) */
  importBibliography: async (courseId: number): Promise<ImportBibResult> => {
    const res = await apiClient.post<ImportBibResult>(
      `/api/v1/courses/${courseId}/references/import-bib`
    );
    return res.data;
  },

  // ── Chapter-level links ────────────────────────────────────────────────────

  /** List active references linked to a chapter */
  listForChapter: async (chapterId: number): Promise<ChapterReferenceLink[]> => {
    const res = await apiClient.get<{ references: ChapterReferenceLink[] }>(
      `/api/v1/chapters/${chapterId}/references`
    );
    return res.data.references;
  },

  /** Link a reference to a chapter (or reactivate) */
  linkToChapter: async (
    chapterId: number,
    referenceId: number,
    pages?: string
  ): Promise<ChapterReferenceLink> => {
    const res = await apiClient.post<ChapterReferenceLink>(
      `/api/v1/chapters/${chapterId}/references`,
      { reference_id: referenceId, pages }
    );
    return res.data;
  },

  /** Update pages or active status */
  updateChapterLink: async (
    chapterId: number,
    referenceId: number,
    data: UpdateChapterReferenceData
  ): Promise<ChapterReferenceLink> => {
    const res = await apiClient.put<ChapterReferenceLink>(
      `/api/v1/chapters/${chapterId}/references/${referenceId}`,
      data
    );
    return res.data;
  },

  /** Unlink (deactivate) a reference from a chapter */
  unlinkFromChapter: async (chapterId: number, referenceId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/chapters/${chapterId}/references/${referenceId}`);
  },
};

// ─── Section Content ──────────────────────────────────────────────────────────

export const sectionContentApi = {
  /** Generate AI content for a section */
  generate: async (sectionId: number): Promise<SectionContent> => {
    const res = await apiClient.post<SectionContent>(
      `/api/v1/sections/${sectionId}/content/generate`
    );
    return res.data;
  },

  /** Get current content for a section */
  get: async (sectionId: number): Promise<SectionContent | null> => {
    const res = await apiClient.get<{ content: SectionContent | null }>(
      `/api/v1/sections/${sectionId}/content`
    );
    return res.data.content;
  },

  /** Approve / reject / edit content */
  update: async (sectionId: number, data: UpdateSectionContentData): Promise<SectionContent> => {
    const res = await apiClient.put<SectionContent>(
      `/api/v1/sections/${sectionId}/content`,
      data
    );
    return res.data;
  },

  /** Extract content from chapter document using Gemini */
  extractFromDocument: async (sectionId: number, documentId?: number): Promise<{ content: SectionContent; source_document: { id: number; title: string } }> => {
    const res = await apiClient.post<{ content: SectionContent; source_document: { id: number; title: string } }>(
      `/api/v1/sections/${sectionId}/content/extract-from-document`,
      documentId ? { document_id: documentId } : {}
    );
    return res.data;
  },
};

// ─── Section Activities ───────────────────────────────────────────────────────

export const sectionActivitiesApi = {
  list: async (sectionId: number): Promise<SectionActivity[]> => {
    const res = await apiClient.get<{ activities: SectionActivity[] }>(
      `/api/v1/sections/${sectionId}/activities`
    );
    return res.data.activities;
  },

  addYoutube: async (sectionId: number, url: string, title?: string): Promise<SectionActivity> => {
    const res = await apiClient.post<SectionActivity>(
      `/api/v1/sections/${sectionId}/activities/youtube`,
      { url, title }
    );
    return res.data;
  },

  deleteActivity: async (sectionId: number, activityId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/sections/${sectionId}/activities/${activityId}`);
  },
};

// ─── Section Quiz ─────────────────────────────────────────────────────────────

export const sectionQuizApi = {
  get: async (sectionId: number): Promise<SectionQuiz | null> => {
    const res = await apiClient.get<{ quiz: SectionQuiz | null }>(
      `/api/v1/sections/${sectionId}/quiz`
    );
    return res.data.quiz;
  },

  generate: async (sectionId: number, numQuestions = 5): Promise<{ message: string; quiz: SectionQuiz }> => {
    const res = await apiClient.post<{ message: string; quiz: SectionQuiz }>(
      `/api/v1/sections/${sectionId}/quiz/generate`,
      { num_questions: numQuestions }
    );
    return res.data;
  },

  updateQuestion: async (
    sectionId: number,
    questionId: number,
    data: Partial<SectionQuizQuestion> & { status?: string }
  ): Promise<SectionQuizQuestion> => {
    const res = await apiClient.put<{ question: SectionQuizQuestion }>(
      `/api/v1/sections/${sectionId}/quiz/questions/${questionId}`,
      data
    );
    return res.data.question;
  },

  publish: async (sectionId: number): Promise<SectionQuiz> => {
    const res = await apiClient.put<{ quiz: SectionQuiz }>(
      `/api/v1/sections/${sectionId}/quiz/publish`
    );
    return res.data.quiz;
  },

  deleteQuiz: async (sectionId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/sections/${sectionId}/quiz`);
  },

  take: async (sectionId: number, password?: string): Promise<TakeQuizResponse> => {
    const params = password ? `?password=${encodeURIComponent(password)}` : '';
    const res = await apiClient.get<TakeQuizResponse>(
      `/api/v1/sections/${sectionId}/quiz/take${params}`
    );
    return res.data;
  },

  submit: async (
    sectionId: number,
    answers: Record<string, string>
  ): Promise<SubmitQuizResponse> => {
    const res = await apiClient.post<SubmitQuizResponse>(
      `/api/v1/sections/${sectionId}/quiz/submit`,
      { answers }
    );
    return res.data;
  },

  result: async (sectionId: number): Promise<{ submissions?: SectionQuizSubmissionDetailed[]; questions?: Record<string, SectionQuizQuestion>; submitted?: boolean; result?: SectionQuizSubmissionDetailed }> => {
    const res = await apiClient.get(`/api/v1/sections/${sectionId}/quiz/result`);
    return res.data;
  },

  gradeSubmission: async (
    sectionId: number,
    submissionId: number,
    grades: Array<{ question_id: string; final_score: number; comment: string }>
  ): Promise<SectionQuizSubmissionDetailed> => {
    const res = await apiClient.put<{ submission: SectionQuizSubmissionDetailed }>(
      `/api/v1/sections/${sectionId}/quiz/submissions/${submissionId}/grade`,
      { grades }
    );
    return res.data.submission;
  },

  updateConfig: async (sectionId: number, config: QuizConfig): Promise<{ quiz: SectionQuiz }> => {
    const res = await apiClient.put<{ quiz: SectionQuiz }>(
      `/api/v1/sections/${sectionId}/quiz/config`,
      config
    );
    return res.data;
  },

  bankStats: async (sectionId: number): Promise<QuizBankStats> => {
    const res = await apiClient.get<QuizBankStats>(
      `/api/v1/sections/${sectionId}/quiz/bank-stats`
    );
    return res.data;
  },

  createFromBank: async (sectionId: number, data: CreateQuizFromBankData): Promise<{ message: string; quiz: SectionQuiz }> => {
    const res = await apiClient.post<{ message: string; quiz: SectionQuiz }>(
      `/api/v1/sections/${sectionId}/quiz/from-bank`,
      data
    );
    return res.data;
  },
};

// ─── Section Assignment ───────────────────────────────────────────────────────

export const sectionAssignmentApi = {
  get: (sectionId: number) =>
    apiClient.get<{ assignment: SectionAssignment | null }>(`/api/v1/sections/${sectionId}/assignment`),
  create: (sectionId: number, data: Partial<SectionAssignment>) =>
    apiClient.post<{ assignment: SectionAssignment }>(`/api/v1/sections/${sectionId}/assignment`, data),
  update: (sectionId: number, data: Partial<SectionAssignment>) =>
    apiClient.put<{ assignment: SectionAssignment }>(`/api/v1/sections/${sectionId}/assignment`, data),
  remove: (sectionId: number) =>
    apiClient.delete(`/api/v1/sections/${sectionId}/assignment`),
  submit: (sectionId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return apiClient.post<{ submission: AssignmentSubmission }>(
      `/api/v1/sections/${sectionId}/assignment/submit`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },
  getSubmissions: (sectionId: number) =>
    apiClient.get<{ submissions: AssignmentSubmission[] }>(`/api/v1/sections/${sectionId}/assignment/submissions`),
  gradeSubmission: (sectionId: number, subId: number, grade: number, feedback: string) =>
    apiClient.put<{ submission: AssignmentSubmission }>(
      `/api/v1/sections/${sectionId}/assignment/submissions/${subId}/grade`,
      { grade, feedback }
    ),
};
