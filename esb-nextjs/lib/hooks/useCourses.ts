import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coursesApi, attendanceApi, gradesApi, examApi } from '../api/courses';
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

export function useAttendanceSessions(courseId: number) {
  return useQuery({
    queryKey: ['attendance-sessions', courseId],
    queryFn: async () => {
      const r = await attendanceApi.getSessions(courseId);
      return r.data;
    },
    enabled: !!courseId,
  });
}

export function useSessionRecords(courseId: number, sessionId: number | null) {
  return useQuery({
    queryKey: ['attendance-records', courseId, sessionId],
    queryFn: async () => {
      const r = await attendanceApi.getRecords(courseId, sessionId!);
      return r.data;
    },
    enabled: !!courseId && !!sessionId,
  });
}

export function useCreateSession(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; date: string; activities_covered?: CourseActivity[] }) =>
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

export function useAllGrades(courseId: number, enabled = true) {
  return useQuery({
    queryKey: ['all-grades', courseId],
    queryFn: async () => {
      const r = await gradesApi.getAllGrades(courseId);
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

export function useUploadExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => examApi.upload(courseId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-exam', courseId] });
      toast.success('Examen uploadé avec succès');
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-exam', courseId] });
      toast.success('Analyse lancée');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Erreur lors de l'analyse");
    },
  });
}

export function useDeleteExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (examId: number) => examApi.remove(courseId, examId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-exam', courseId] });
      toast.success('Examen supprimé');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression');
    },
  });
}
