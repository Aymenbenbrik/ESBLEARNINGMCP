import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  progressApi,
  AllProgressResponse,
  CourseProgressDetailResponse,
  CourseStudentsProgressResponse,
  TrackAction,
} from '../api/progress';

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const progressKeys = {
  all: ['progress'] as const,
  myAll: () => [...progressKeys.all, 'my'] as const,
  myCourse: (courseId: number) => [...progressKeys.all, 'my', courseId] as const,
  courseStudents: (courseId: number) => [...progressKeys.all, 'students', courseId] as const,
};

// ─── Student Hooks ───────────────────────────────────────────────────────────

/** Get progress overview for all enrolled courses (current student) */
export function useMyProgress() {
  return useQuery<AllProgressResponse>({
    queryKey: progressKeys.myAll(),
    queryFn: progressApi.getMyProgress,
  });
}

/** Get detailed progress for a specific course (current student) */
export function useMyCourseProgress(courseId: number) {
  return useQuery<CourseProgressDetailResponse>({
    queryKey: progressKeys.myCourse(courseId),
    queryFn: () => progressApi.getMyCourseProgress(courseId),
    enabled: !!courseId,
  });
}

/** Record a progress event (chapter visit, document open, etc.) */
export function useTrackProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      action: TrackAction;
      chapter_id: number;
      course_id?: number;
      score?: number;
    }) => progressApi.track(data),
    onSuccess: (_, variables) => {
      // Invalidate related progress queries
      queryClient.invalidateQueries({ queryKey: progressKeys.myAll() });
      if (variables.course_id) {
        queryClient.invalidateQueries({ queryKey: progressKeys.myCourse(variables.course_id) });
      }
    },
  });
}

// ─── Teacher Hooks ───────────────────────────────────────────────────────────

/** Teacher: get all students' progress for a course */
export function useCourseStudentsProgress(courseId: number) {
  return useQuery<CourseStudentsProgressResponse>({
    queryKey: progressKeys.courseStudents(courseId),
    queryFn: () => progressApi.getCourseStudentsProgress(courseId),
    enabled: !!courseId,
  });
}
