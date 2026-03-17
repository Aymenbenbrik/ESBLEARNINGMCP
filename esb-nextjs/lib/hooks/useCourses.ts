import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coursesApi } from '../api/courses';
import {
  CoursesListResponse,
  CourseDetails,
  CreateCourseData,
  UpdateCourseData,
  EnrollmentResponse,
  ModuleUploadResponse,
  Course,
  CourseDashboardResponse,
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
