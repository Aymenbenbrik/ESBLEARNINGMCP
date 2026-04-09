import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coursesApi, attendanceApi, gradesApi, examApi, tnExamsApi, courseStudentsApi } from '../api/courses';
import {
  CoursesListResponse,
  CourseDetails,
  CreateCourseData,
  UpdateCourseData,
  EnrollmentResponse,
  ModuleUploadResponse,
  Course,
  CourseDashboardResponse,
  GradeWeight,
  AttendanceRecord,
  CourseActivity,
  CourseExam,
  TnExamDocument,
  GeneratedQuestion,
  TnExamValidationResponse,
  TnExamCorrection,
  CourseClass,
  ClassStats,
} from '../types/course';
import { toast } from 'sonner';

// Query keys
export const courseKeys = {
  all: ['courses'] as const,
  lists: () => [...courseKeys.all, 'list'] as const,
  list: () => [...courseKeys.lists()] as const,
  details: () => [...courseKeys.all, 'detail'] as const,
  detail: (id: number) => [...courseKeys.details(), id] as const,
  dashboards: () => [...courseKeys.all, 'dashboard'] as const,
  dashboard: (id: number) => [...courseKeys.dashboards(), id] as const,
};

/**
 * Get list of courses for current user
 */
export function useCourses() {
  return useQuery<CoursesListResponse>({
    queryKey: courseKeys.list(),
    queryFn: coursesApi.list,
  });
}

/**
 * Get course details by ID
 */
export function useCourse(id: number) {
  return useQuery<CourseDetails>({
    queryKey: courseKeys.detail(id),
    queryFn: () => coursesApi.get(id),
    enabled: !!id,
  });
}

/**
 * Create a new course (teachers only)
 */
export function useCreateCourse() {
  const queryClient = useQueryClient();

  return useMutation<Course, Error, CreateCourseData>({
    mutationFn: coursesApi.create,
    onSuccess: (data) => {
      // Invalidate courses list to refetch
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
      toast.success(`Course "${data.title}" created successfully`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create course');
    },
  });
}

/**
 * Update a course (teachers only)
 */
export function useUpdateCourse() {
  const queryClient = useQueryClient();

  return useMutation<Course, Error, { id: number; data: UpdateCourseData }>({
    mutationFn: ({ id, data }) => coursesApi.update(id, data),
    onSuccess: (data) => {
      // Invalidate course detail and list
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
      toast.success(`Course "${data.title}" updated successfully`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update course');
    },
  });
}

/**
 * Delete a course (teachers only)
 */
export function useDeleteCourse() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: coursesApi.delete,
    onSuccess: (data) => {
      // Invalidate courses list
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete course');
    },
  });
}

/**
 * Enroll in a course (students only)
 */
export function useEnrollCourse() {
  const queryClient = useQueryClient();

  return useMutation<EnrollmentResponse, Error, number>({
    mutationFn: coursesApi.enroll,
    onSuccess: (data) => {
      // Invalidate courses list to show newly enrolled course
      queryClient.invalidateQueries({ queryKey: courseKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to enroll in course');
    },
  });
}

/**
 * Upload a module attachment (teachers only)
 */
export function useUploadModule() {
  const queryClient = useQueryClient();

  return useMutation<ModuleUploadResponse, Error, { courseId: number; data: FormData }>({
    mutationFn: ({ courseId, data }) => coursesApi.uploadModule(courseId, data),
    onSuccess: (data, variables) => {
      // Invalidate course detail to show new module
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(variables.courseId) });

      if (data.processing_status === 'processed') {
        toast.success('Module uploaded and processed successfully');
      } else if (data.processing_status === 'processing_failed') {
        toast.warning('Module uploaded but processing failed');
      } else {
        toast.success(data.message);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to upload module');
    },
  });
}

/**
 * Get course dashboard analytics (teachers only)
 */
export function useCourseDashboard(id: number) {
  return useQuery<CourseDashboardResponse>({
    queryKey: courseKeys.dashboard(id),
    queryFn: () => coursesApi.getDashboard(id),
    enabled: !!id,
  });
}

// ─── Attendance Hooks ────────────────────────────────────────────────────────

// ─── Course Students Hooks ───────────────────────────────────────────────────

export function useCourseStudents(courseId: number) {
  return useQuery({
    queryKey: ['course-students', courseId],
    queryFn: () => courseStudentsApi.list(courseId),
    enabled: !!courseId,
  });
}

export function useAvailableStudents(courseId: number, search: string) {
  return useQuery({
    queryKey: ['available-students', courseId, search],
    queryFn: () => courseStudentsApi.available(courseId, search || undefined),
    enabled: !!courseId,
  });
}

export function useEnrollStudents(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentIds: number[]) => courseStudentsApi.enroll(courseId, studentIds),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['course-students', courseId] });
      qc.invalidateQueries({ queryKey: ['available-students', courseId] });
      toast.success(`${data.enrolled} étudiant(s) ajouté(s)`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Erreur lors de l'ajout des étudiants");
    },
  });
}

export function useRemoveStudent(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: number) => courseStudentsApi.remove(courseId, studentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-students', courseId] });
      qc.invalidateQueries({ queryKey: ['available-students', courseId] });
      toast.success('Étudiant retiré du cours');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Erreur lors du retrait de l'étudiant");
    },
  });
}

// ─── Attendance Hooks ────────────────────────────────────────────────────────

export function useAttendanceSessions(courseId: number, classId?: number) {
  return useQuery({
    queryKey: ['attendance-sessions', courseId, classId ?? null],
    queryFn: async () => {
      const r = await attendanceApi.getSessions(courseId, classId);
      return r.data;
    },
    enabled: !!courseId,
  });
}

export function useSessionRecords(courseId: number, sessionId: number | null, classId?: number) {
  return useQuery({
    queryKey: ['attendance-records', courseId, sessionId, classId ?? null],
    queryFn: async () => {
      const r = await attendanceApi.getRecords(courseId, sessionId!, classId);
      return r.data;
    },
    enabled: !!courseId && !!sessionId,
  });
}

export function useCreateSession(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; date: string; activities_covered?: CourseActivity[]; class_id?: number }) =>
      attendanceApi.createSession(courseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] });
      toast.success('Séance créée avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la création de la séance');
    },
  });
}

export function useSaveRecords(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      records,
    }: {
      sessionId: number;
      records: { student_id: number; status: string }[];
    }) => attendanceApi.saveRecords(courseId, sessionId, records),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['attendance-records', courseId, vars.sessionId] });
      qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] });
      toast.success('Présences enregistrées');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Erreur lors de l'enregistrement");
    },
  });
}

export function useDeleteSession(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => attendanceApi.deleteSession(courseId, sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] });
      toast.success('Séance supprimée');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression');
    },
  });
}

export function useMyAttendance(courseId: number) {
  return useQuery({
    queryKey: ['my-attendance', courseId],
    queryFn: async () => {
      const r = await attendanceApi.myAttendance(courseId);
      return r.data;
    },
    enabled: !!courseId,
  });
}

export function useCourseActivities(courseId: number) {
  return useQuery({
    queryKey: ['course-activities', courseId],
    queryFn: () => attendanceApi.listActivities(courseId),
    staleTime: 60_000,
    enabled: !!courseId,
  });
}

export function useSaveSessionActivities(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, activities }: { sessionId: number; activities: CourseActivity[] }) =>
      attendanceApi.saveSessionActivities(courseId, sessionId, activities),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] });
      toast.success('Activités mises à jour');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la mise à jour des activités');
    },
  });
}

// ─── Grades Hooks ─────────────────────────────────────────────────────────────

export function useGradeWeights(courseId: number) {
  return useQuery({
    queryKey: ['grade-weights', courseId],
    queryFn: async () => {
      const r = await gradesApi.getWeights(courseId);
      return r.data.weights;
    },
    enabled: !!courseId,
  });
}

export function useUpdateGradeWeights(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<GradeWeight>) => gradesApi.updateWeights(courseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grade-weights', courseId] });
      qc.invalidateQueries({ queryKey: ['all-grades', courseId] });
      toast.success('Pondérations mises à jour');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la mise à jour');
    },
  });
}

export function useAllGrades(courseId: number, classId?: number, enabled = true) {
  return useQuery({
    queryKey: ['all-grades', courseId, classId ?? null],
    queryFn: async () => {
      const r = await gradesApi.getAllGrades(courseId, classId);
      return r.data;
    },
    enabled: enabled && !!courseId,
  });
}

export function useMyGrade(courseId: number, enabled = true) {
  return useQuery({
    queryKey: ['my-grade', courseId],
    queryFn: async () => {
      const r = await gradesApi.getMyGrade(courseId);
      return r.data;
    },
    enabled: enabled && !!courseId,
  });
}

// ─── Course Classes Hooks ────────────────────────────────────────────────────

export function useCourseClasses(courseId: number) {
  return useQuery<CourseClass[]>({
    queryKey: ['course-classes', courseId],
    queryFn: async () => {
      const r = await gradesApi.getCourseClasses(courseId);
      return r.data.classes;
    },
    enabled: !!courseId,
  });
}

export function useClassStats(courseId: number, classId: number | undefined) {
  return useQuery<ClassStats>({
    queryKey: ['class-stats', courseId, classId],
    queryFn: async () => {
      const r = await gradesApi.getClassStats(courseId, classId!);
      return r.data;
    },
    enabled: !!courseId && !!classId,
  });
}

// ─── Exam Hooks ───────────────────────────────────────────────────────────────

export function useCourseExam(courseId: number) {
  return useQuery({
    queryKey: ['course-exam', courseId],
    queryFn: async () => {
      const r = await examApi.get(courseId);
      return r.data.exam;
    },
    enabled: !!courseId,
  });
}

export function useCourseExams(courseId: number) {
  return useQuery<CourseExam[]>({
    queryKey: ['course-exams', courseId],
    queryFn: async () => {
      const r = await examApi.list(courseId);
      return r.data.exams;
    },
    enabled: !!courseId,
  });
}

export function useUploadExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, config }: { file: File; config?: import('../api/courses').ExamUploadConfig }) =>
      examApi.upload(courseId, file, config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-exams', courseId] });
      qc.invalidateQueries({ queryKey: ['course-exam', courseId] });
      toast.success('Évaluation uploadée avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Erreur lors de l'upload");
    },
  });
}

export function useAnalyzeExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (examId: number) => examApi.analyze(courseId, examId),
    onSettled: () => {
      // Always refetch regardless of success or error
      qc.invalidateQueries({ queryKey: ['course-exams', courseId] });
      qc.invalidateQueries({ queryKey: ['course-exam', courseId] });
    },
    onSuccess: (data) => {
      const exam = (data as any)?.data?.exam;
      if (exam?.status === 'done') toast.success('Analyse terminée avec succès');
      else if (exam?.status === 'error') toast.error('Analyse échouée - vérifiez les logs');
    },
    onError: (error: any) => {
      qc.invalidateQueries({ queryKey: ['course-exams', courseId] });
      toast.error(error.response?.data?.error || "Erreur lors de l'analyse");
    },
  });
}

export function useDeleteExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (examId: number) => examApi.remove(courseId, examId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-exams', courseId] });
      qc.invalidateQueries({ queryKey: ['course-exam', courseId] });
      toast.success('Évaluation supprimée');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression');
    },
  });
}

export function useGenerateExamQuestions(courseId: number) {
  return useMutation<
    GeneratedQuestion[],
    Error,
    { examId: number; count: number; focus: 'bloom' | 'aa' | 'difficulty' | 'practical' }
  >({
    mutationFn: async ({ examId, count, focus }) => {
      const r = await examApi.generate(courseId, examId, count, focus);
      return r.data.questions;
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la génération');
    },
  });
}

export function useTnExams(courseId: number) {
  return useQuery<TnExamDocument[]>({
    queryKey: ['tn-exams', courseId],
    queryFn: async () => {
      const r = await tnExamsApi.list(courseId);
      return r.data.exams;
    },
    enabled: !!courseId,
  });
}

export function useTnExam(courseId: number, examId: number) {
  return useQuery<TnExamDocument>({
    queryKey: ['tn-exam', courseId, examId],
    queryFn: async () => {
      const r = await tnExamsApi.get(courseId, examId);
      return r.data.exam;
    },
    enabled: !!courseId && !!examId,
  });
}

export function useUploadTnExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => tnExamsApi.upload(courseId, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tn-exams', courseId] });
      toast.success('Épreuve ajoutée avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Erreur lors de l'ajout");
    },
  });
}

export function useAnalyzeTnExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (examId: number) => tnExamsApi.analyze(courseId, examId),
    onSuccess: (_, examId) => {
      qc.invalidateQueries({ queryKey: ['tn-exams', courseId] });
      qc.invalidateQueries({ queryKey: ['tn-exam', courseId, examId] });
      toast.success('Analyse terminée avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Échec de l'analyse");
    },
  });
}

export function useSaveTnExamAnalysis(courseId: number, examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { exam_metadata?: Record<string, unknown>; questions?: unknown[] }) =>
      tnExamsApi.saveAnalysis(courseId, examId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tn-exam', courseId, examId] });
      qc.invalidateQueries({ queryKey: ['tn-exams', courseId] });
      toast.success('Modifications sauvegardées');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la sauvegarde');
    },
  });
}

export function useTnExamValidation(courseId: number, examId: number, enabled = true) {
  return useQuery<TnExamValidationResponse>({
    queryKey: ['tn-exam-validation', courseId, examId],
    queryFn: async () => {
      const r = await tnExamsApi.getValidation(courseId, examId);
      return r.data;
    },
    enabled: enabled && !!courseId && !!examId,
  });
}

export function useGenerateExamLatex(courseId: number) {
  return useMutation<string, Error, { examId: number; includeProposals: boolean }>({
    mutationFn: async ({ examId, includeProposals }) => {
      const r = await examApi.generateLatex(courseId, examId, includeProposals);
      return r.data.latex;
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur de génération LaTeX');
    },
  });
}

export function useCompileExamLatex(courseId: number) {
  return useMutation<Blob, Error, { examId: number; latex: string }>({
    mutationFn: async ({ examId, latex }) => {
      const r = await examApi.compileLatex(courseId, examId, latex);
      return r.data as unknown as Blob;
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur de compilation LaTeX');
    },
  });
}

export function useGenerateCurativeQuestions(courseId: number, examId: number) {
  return useMutation<
    { questions: Array<{ text: string; bloom_level: string; difficulty: string; question_type: string; aa: number | null; rationale: string }> },
    Error,
    { bloom_level?: string; difficulty?: string; target_aa?: number | null; question_type?: string; context?: string; count?: number; exercise_mode?: 'new' | 'modify'; exercise_minutes?: number; target_exercise?: number }
  >({
    mutationFn: async (params) => {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
      const res = await fetch(
        `${API_URL}/api/v1/courses/${courseId}/tn-exams/${examId}/generate-questions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(params),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur de génération');
      }
      return res.json();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la génération des questions');
    },
  });
}

export function useGenerateCorrection(courseId: number, examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => tnExamsApi.generateCorrection(courseId, examId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tn-exam', courseId, examId] });
      qc.invalidateQueries({ queryKey: ['tn-exam-corrections', courseId, examId] });
    },
  });
}

export function useTnExamCorrections(courseId: number, examId: number) {
  return useQuery({
    queryKey: ['tn-exam-corrections', courseId, examId],
    queryFn: () => tnExamsApi.getCorrections(courseId, examId).then(r => r.data.corrections),
    enabled: !!courseId && !!examId,
  });
}

export function useUpdateCorrection(courseId: number, examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ index, data }: { index: number; data: Partial<TnExamCorrection> }) =>
      tnExamsApi.updateCorrection(courseId, examId, index, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tn-exam-corrections', courseId, examId] });
      qc.invalidateQueries({ queryKey: ['tn-exam', courseId, examId] });
    },
  });
}

