import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  syllabusApi,
  SyllabusData,
  CLOData,
  PLOData,
  WeeklyPlan,
  UploadSyllabusData,
  ExtractionResult,
  ClassificationResult
} from '../api/syllabus';
import { toast } from 'sonner';

// Query keys
export const syllabusKeys = {
  all: ['syllabus'] as const,
  details: () => [...syllabusKeys.all, 'detail'] as const,
  detail: (courseId: number) => [...syllabusKeys.details(), courseId] as const,
  clo: (courseId: number) => [...syllabusKeys.detail(courseId), 'clo'] as const,
  plo: (courseId: number) => [...syllabusKeys.detail(courseId), 'plo'] as const,
  weeklyPlan: (courseId: number) => [...syllabusKeys.detail(courseId), 'weekly-plan'] as const,
};

/**
 * Get syllabus data for a course
 */
export function useSyllabus(courseId: number) {
  return useQuery<SyllabusData>({
    queryKey: syllabusKeys.detail(courseId),
    queryFn: () => syllabusApi.get(courseId),
    enabled: !!courseId,
  });
}

/**
 * Upload syllabus file
 */
export function useUploadSyllabus() {
  const queryClient = useQueryClient();

  return useMutation<
    { message: string; syllabus_id: number },
    Error,
    { courseId: number; data: UploadSyllabusData }
  >({
    mutationFn: ({ courseId, data }) => syllabusApi.upload(courseId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: syllabusKeys.detail(variables.courseId) });
      // Don't show toast here - let the component handle it
    },
    onError: (error: any) => {
      // Don't show toast here - let the component handle it
    },
  });
}

/**
 * Get CLO data for a course
 */
export function useCLOData(courseId: number) {
  return useQuery<CLOData>({
    queryKey: syllabusKeys.clo(courseId),
    queryFn: () => syllabusApi.getCLOData(courseId),
    enabled: !!courseId,
  });
}

/**
 * Get PLO data for a course
 */
export function usePLOData(courseId: number) {
  return useQuery<PLOData>({
    queryKey: syllabusKeys.plo(courseId),
    queryFn: () => syllabusApi.getPLOData(courseId),
    enabled: !!courseId,
  });
}

/**
 * Get weekly plan from syllabus
 */
export function useWeeklyPlan(courseId: number) {
  return useQuery<WeeklyPlan>({
    queryKey: syllabusKeys.weeklyPlan(courseId),
    queryFn: () => syllabusApi.getWeeklyPlan(courseId),
    enabled: !!courseId,
  });
}

/**
 * Trigger content extraction from syllabus
 */
export function useTriggerExtraction() {
  const queryClient = useQueryClient();

  return useMutation<ExtractionResult, Error, number>({
    mutationFn: syllabusApi.extract,
    onSuccess: (data, courseId) => {
      queryClient.invalidateQueries({ queryKey: syllabusKeys.detail(courseId) });
      // Don't show toast here - let the component handle it
    },
    onError: (error: any) => {
      // Don't show toast here - let the component handle it
    },
  });
}

/**
 * Trigger chapter classification
 */
export function useTriggerClassification() {
  const queryClient = useQueryClient();

  return useMutation<ClassificationResult, Error, number>({
    mutationFn: syllabusApi.classify,
    onSuccess: (data, courseId) => {
      queryClient.invalidateQueries({ queryKey: syllabusKeys.detail(courseId) });
      // Don't show toast here - let the component handle it
    },
    onError: (error: any) => {
      // Don't show toast here - let the component handle it
    },
  });
}
