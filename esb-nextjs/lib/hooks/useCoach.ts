import { useQuery } from '@tanstack/react-query';
import { coachApi, CoachAnalysisResponse, SkillMapResponse } from '../api/coach';

export const coachKeys = {
  all: ['coach'] as const,
  analysis: () => [...coachKeys.all, 'analysis'] as const,
  studentAnalysis: (id: number) => [...coachKeys.all, 'student', id] as const,
  skillMap: (studentId: number, courseId: number) =>
    [...coachKeys.all, 'skill-map', studentId, courseId] as const,
  recommendations: () => [...coachKeys.all, 'recommendations'] as const,
};

/** Run full AI analysis on current student */
export function useCoachAnalysis() {
  return useQuery<CoachAnalysisResponse>({
    queryKey: coachKeys.analysis(),
    queryFn: coachApi.analyzeMe,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (expensive LLM call)
  });
}

/** Teacher: analyze a specific student */
export function useStudentAnalysis(studentId: number, courseId?: number) {
  return useQuery<CoachAnalysisResponse>({
    queryKey: coachKeys.studentAnalysis(studentId),
    queryFn: () => coachApi.analyzeStudent(studentId, courseId),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Get skill map (radar chart data) */
export function useSkillMap(studentId: number, courseId: number) {
  return useQuery<SkillMapResponse>({
    queryKey: coachKeys.skillMap(studentId, courseId),
    queryFn: () => coachApi.getSkillMap(studentId, courseId),
    enabled: !!studentId && !!courseId,
  });
}

/** Get recommendations only (lighter) */
export function useRecommendations() {
  return useQuery({
    queryKey: coachKeys.recommendations(),
    queryFn: coachApi.getRecommendations,
    staleTime: 5 * 60 * 1000,
  });
}
