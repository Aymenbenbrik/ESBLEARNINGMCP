import { apiClient } from './client';
import {
  CoursesListResponse,
  CourseDetails,
  CreateCourseData,
  UpdateCourseData,
  EnrollmentResponse,
  ModuleUploadResponse,
  Course,
  CourseDashboardResponse,
  AttendanceSession,
  AttendanceRecord,
  CourseActivity,
  GradeWeight,
  StudentGrade,
  CourseExam,
  TnExamDocument,
  ExamType,
  GeneratedQuestion,
  TnExamAnalysisResults,
  TnExamValidationResponse,
  TnExamListResponse,
  TnExamDetailResponse,
  ExamHeaderData,
  ExtractedQuestion,
  QuestionSourceMatch,
  ProposedQuestion,
  ExerciseGenConfig,
  TnExamCorrection,
  CourseClass,
  ClassStats,
} from '../types/course';

const BASE_URL = '/api/v1/courses';

export const coursesApi = {
  /**
   * Get list of courses for current user
   * Teachers: see courses they created
   * Students: see enrolled courses + available courses
   */
  list: async (): Promise<CoursesListResponse> => {
    const response = await apiClient.get<CoursesListResponse>(BASE_URL);
    return response.data;
  },

  /**
   * Create a new course (teachers only)
   */
  create: async (data: CreateCourseData): Promise<Course> => {
    const response = await apiClient.post<Course>(BASE_URL, data);
    return response.data;
  },

  /**
   * Get course details
   * Returns different data for teachers vs students
   */
  get: async (id: number): Promise<CourseDetails> => {
    const response = await apiClient.get<CourseDetails>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Update a course (teachers only)
   */
  update: async (id: number, data: UpdateCourseData): Promise<Course> => {
    const response = await apiClient.put<Course>(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  /**
   * Delete a course (teachers only)
   */
  delete: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Enroll in a course (students only)
   */
  enroll: async (id: number): Promise<EnrollmentResponse> => {
    const response = await apiClient.post<EnrollmentResponse>(`${BASE_URL}/${id}/enroll`);
    return response.data;
  },

  /**
   * Upload a module-level attachment (teachers only)
   */
  uploadModule: async (id: number, data: FormData): Promise<ModuleUploadResponse> => {
    const response = await apiClient.post<ModuleUploadResponse>(
      `${BASE_URL}/${id}/upload-module`,
      data,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Get course dashboard analytics (teachers only)
   * Returns stats, bloom/difficulty/AAA distributions, and recent quizzes
   */
  getDashboard: async (id: number): Promise<CourseDashboardResponse> => {
    const response = await apiClient.get<CourseDashboardResponse>(`${BASE_URL}/${id}/dashboard`);
    return response.data;
  },
};

export interface CourseStudent {
  id: number;
  username: string;
  email: string;
  class_name: string | null;
  enrolled_at?: string | null;
}

export const courseStudentsApi = {
  list: async (courseId: number): Promise<{ students: CourseStudent[]; total: number }> => {
    const response = await apiClient.get(`${BASE_URL}/${courseId}/students`);
    return response.data;
  },
  enroll: async (courseId: number, studentIds: number[]): Promise<{ enrolled: number; skipped: number }> => {
    const response = await apiClient.post(`${BASE_URL}/${courseId}/students`, { student_ids: studentIds });
    return response.data;
  },
  remove: async (courseId: number, studentId: number): Promise<{ message: string }> => {
    const response = await apiClient.delete(`${BASE_URL}/${courseId}/students/${studentId}`);
    return response.data;
  },
  available: async (courseId: number, search?: string): Promise<{ students: CourseStudent[]; total: number }> => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const response = await apiClient.get(`${BASE_URL}/${courseId}/available-students${params}`);
    return response.data;
  },
};

export const attendanceApi = {
  getSessions: (courseId: number, classId?: number) =>
    apiClient.get<{ sessions: AttendanceSession[]; total_students: number }>(`/api/v1/courses/${courseId}/attendance/sessions`, {
      params: classId ? { class_id: classId } : undefined,
    }),
  createSession: (courseId: number, data: { title: string; date: string; activities_covered?: CourseActivity[]; class_id?: number }) =>
    apiClient.post<{ session: AttendanceSession }>(`/api/v1/courses/${courseId}/attendance/sessions`, data),
  updateSession: (courseId: number, sessionId: number, data: { title?: string; date?: string }) =>
    apiClient.put<{ session: AttendanceSession }>(`/api/v1/courses/${courseId}/attendance/sessions/${sessionId}`, data),
  deleteSession: (courseId: number, sessionId: number) =>
    apiClient.delete(`/api/v1/courses/${courseId}/attendance/sessions/${sessionId}`),
  getRecords: (courseId: number, sessionId: number, classId?: number) =>
    apiClient.get<{ records: AttendanceRecord[]; session: AttendanceSession }>(`/api/v1/courses/${courseId}/attendance/sessions/${sessionId}/records`, {
      params: classId ? { class_id: classId } : undefined,
    }),
  saveRecords: (courseId: number, sessionId: number, records: { student_id: number; status: string }[]) =>
    apiClient.put<{ session: AttendanceSession }>(`/api/v1/courses/${courseId}/attendance/sessions/${sessionId}/records`, { records }),
  myAttendance: (courseId: number) =>
    apiClient.get<{ attendance: { session_title?: string; status: 'present' | 'late' | 'absent'; activities_covered?: CourseActivity[] }[]; summary: { total: number; present: number; late: number; absent: number } }>(`/api/v1/courses/${courseId}/attendance/my`),
  listActivities: (courseId: number) =>
    apiClient.get<{ activities: CourseActivity[] }>(`/api/v1/courses/${courseId}/attendance/activities`).then(r => r.data),
  saveSessionActivities: (courseId: number, sessionId: number, activities: CourseActivity[]) =>
    apiClient.put<{ session: AttendanceSession }>(`/api/v1/courses/${courseId}/attendance/sessions/${sessionId}`, { activities_covered: activities }).then(r => r.data),
};

export const gradesApi = {
  getWeights: (courseId: number) =>
    apiClient.get<{ weights: GradeWeight }>(`/api/v1/courses/${courseId}/grade-weights`),
  updateWeights: (courseId: number, data: Partial<GradeWeight>) =>
    apiClient.put<{ weights: GradeWeight }>(`/api/v1/courses/${courseId}/grade-weights`, data),
  getAllGrades: (courseId: number, classId?: number) =>
    apiClient.get<{ grades: StudentGrade[]; weights: GradeWeight }>(`/api/v1/courses/${courseId}/grades`, {
      params: classId ? { class_id: classId } : undefined,
    }),
  getMyGrade: (courseId: number) =>
    apiClient.get<StudentGrade & { weights: GradeWeight }>(`/api/v1/courses/${courseId}/grades/me`),
  getCourseClasses: (courseId: number) =>
    apiClient.get<{ classes: CourseClass[] }>(`/api/v1/courses/${courseId}/classes`),
  getClassStats: (courseId: number, classId: number) =>
    apiClient.get<ClassStats>(`/api/v1/courses/${courseId}/classes/${classId}/stats`),
};

export interface ExamUploadConfig {
  examType: ExamType;
  weight: number;
  targetAaIds: number[];
  hasPracticalTarget: boolean;
}

export const examApi = {
  get: (courseId: number) =>
    apiClient.get<{ exam: CourseExam | null }>(`/api/v1/courses/${courseId}/exam`),
  list: (courseId: number) =>
    apiClient.get<{ exams: CourseExam[] }>(`/api/v1/courses/${courseId}/exams`),
  upload: (courseId: number, file: File, config?: ExamUploadConfig) => {
    const fd = new FormData();
    fd.append('file', file);
    if (config) {
      fd.append('exam_type', config.examType);
      fd.append('weight', String(config.weight));
      fd.append('has_practical_target', String(config.hasPracticalTarget));
      fd.append('target_aa_ids', JSON.stringify(config.targetAaIds));
    }
    return apiClient.post<{ exam: CourseExam }>(`/api/v1/courses/${courseId}/exam/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  analyze: (courseId: number, examId: number) =>
    apiClient.post<{ exam: CourseExam }>(`/api/v1/courses/${courseId}/exam/analyze`, { exam_id: examId }),
  updateConfig: (courseId: number, examId: number, config: Partial<{
    exam_type: ExamType; weight: number; target_aa_ids: number[]; has_practical_target: boolean;
  }>) =>
    apiClient.patch<{ exam: CourseExam }>(`/api/v1/courses/${courseId}/exam/${examId}/config`, config),
  remove: (courseId: number, examId: number) =>
    apiClient.delete(`/api/v1/courses/${courseId}/exam/${examId}`),
  generate: (courseId: number, examId: number, count: number, focus: 'bloom' | 'aa' | 'difficulty' | 'practical') =>
    apiClient.post<{ questions: GeneratedQuestion[] }>(`/api/v1/courses/${courseId}/exam/${examId}/generate`, { count, focus }),
  generateLatex: (courseId: number, examId: number, includeProposals?: boolean) =>
    apiClient.post<{ latex: string }>(`/api/v1/courses/${courseId}/exam/${examId}/generate-latex`, { include_proposals: includeProposals ?? true }),
  compileLatex: (courseId: number, examId: number, latex: string) =>
    apiClient.post(
      `/api/v1/courses/${courseId}/exam/${examId}/compile-latex`,
      { latex },
      { responseType: 'blob' }
    ),
};

export const tnExamsApi = {
  list: (courseId: number) =>
    apiClient.get<TnExamListResponse>(`/api/v1/courses/${courseId}/tn-exams`),

  get: (courseId: number, examId: number) =>
    apiClient.get<TnExamDetailResponse>(`/api/v1/courses/${courseId}/tn-exams/${examId}`),

  upload: (courseId: number, formData: FormData) =>
    apiClient.post<{ message: string; exam: TnExamDocument }>(
      `/api/v1/courses/${courseId}/tn-exams`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ),

  analyze: (courseId: number, examId: number) =>
    apiClient.post<{ message: string; exam: TnExamDocument }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/analyze`
    ),

  saveAnalysis: (
    courseId: number,
    examId: number,
    data: { exam_metadata?: Partial<TnExamAnalysisResults['exam_metadata']>; questions?: unknown[] }
  ) =>
    apiClient.post<{ ok: boolean; message: string; exam: TnExamDocument }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/save-analysis`,
      data
    ),

  extractHeader: (courseId: number, examId: number) =>
    apiClient.post<{ success: boolean; header: ExamHeaderData; message: string }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/extract-header`
    ),

  extractQuestions: (courseId: number, examId: number) =>
    apiClient.post<{ success: boolean; questions: ExtractedQuestion[]; count: number; message: string }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/extract-questions`
    ),

  getValidation: (courseId: number, examId: number) =>
    apiClient.get<TnExamValidationResponse>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/validation`
    ),

  getLatexReportUrl: (courseId: number, examId: number) =>
    `/api/v1/courses/${courseId}/tn-exams/${examId}/latex-report`,

  downloadReport: (courseId: number, examId: number) =>
    apiClient.get(`/api/v1/courses/${courseId}/tn-exams/${examId}/report`, {
      responseType: 'blob',
    }),

  matchSources: (courseId: number, examId: number, questionIds?: number[]) =>
    apiClient.post<{ matches: QuestionSourceMatch[] }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/match-sources`,
      questionIds ? { question_ids: questionIds } : {}
    ),

  /** Generate questions for an exercise using Gemini */
  generateExerciseQuestions: (courseId: number, examId: number, config: ExerciseGenConfig) =>
    apiClient.post<{ questions: Array<{ text: string; bloom_level: string; difficulty: string; question_type: string; points: number; estimated_time_min?: number; aa_numbers?: number[]; rationale?: string }> }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/generate-exercise-questions`,
      config
    ),

  /** Save a new exam proposal (confirmed questions) to the database */
  saveProposal: (courseId: number, examId: number, data: { questions: ProposedQuestion[]; title?: string }) =>
    apiClient.post<{ ok: boolean; message: string; exam: TnExamDocument }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/save-proposal`,
      data
    ),

  /** Get structured report data as JSON (no LaTeX required) for preview */
  getReportData: (courseId: number, examId: number) =>
    apiClient.get<{
      general_info: {
        course_title: string;
        exam_name: string;
        class_name: string;
        language: string;
        duration_min: number | null;
        exam_date: string;
        instructors: string[];
      };
      validation: Array<{ criterion: string; label: string; status: 'PASS' | 'WARNING' | 'FAIL'; detail: string; ok: boolean }>;
      scores: { content: number; quality: number; total: number };
      bloom_percentages: Record<string, number>;
      difficulty_percentages: Record<string, number>;
      aa_percentages: Record<string, number>;
      type_distribution: Record<string, number>;
      aa_mapping: Array<{ question_number: number; aa_numbers: number[]; bloom: string; points: number; exercise_number: number }>;
      question_classification: Array<{ question_number: number; type: string; bloom: string; difficulty: string; points: number; exercise_number: number; exercise_title: string }>;
      time_analysis: Record<string, any>;
      source_coverage_rate: number;
      total_questions: number;
      has_full_analysis: boolean;
    }>(`/api/v1/courses/${courseId}/tn-exams/${examId}/report-data`),

  /** Match a single question text to course documents using RAG */
  matchQuestion: (courseId: number, examId: number, questionText: string) =>
    apiClient.post<{ sources: QuestionSourceMatch['sources']; total_docs_searched: number }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/match-question`,
      { question_text: questionText }
    ),

  /** Generate AI correction for each extracted question */
  generateCorrection: (courseId: number, examId: number) =>
    apiClient.post<{ corrections: TnExamCorrection[]; count: number }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/generate-correction`
    ),

  /** Retrieve generated corrections */
  getCorrections: (courseId: number, examId: number) =>
    apiClient.get<{ corrections: TnExamCorrection[]; count: number }>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/corrections`
    ),

  /** Update / validate a single correction by index */
  updateCorrection: (courseId: number, examId: number, index: number, data: Partial<TnExamCorrection>) =>
    apiClient.put<TnExamCorrection>(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/corrections/${index}`,
      data
    ),

  /** Fetch unified exam tag constants from backend */
  getExamTags: async (): Promise<{
    bloom_levels: string[];
    bloom_distribution_ideal: Record<string, number>;
    bloom_colors: Record<string, string>;
    difficulty_levels: string[];
    difficulty_colors: Record<string, string>;
    question_types: string[];
  }> => {
    const { data } = await apiClient.get('/api/v1/exam-bank/tags');
    return data;
  },

  /** Sync question tags after manual edit */
  syncQuestionTags: async (courseId: number, examId: number, questionIndex: number) => {
    const { data } = await apiClient.post(
      `/api/v1/courses/${courseId}/tn-exams/${examId}/questions/${questionIndex}/sync-tags`
    );
    return data;
  },
};
