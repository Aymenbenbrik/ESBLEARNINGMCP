import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluationApi } from '../api/evaluation';
import {
  StudentAAScoresResponse,
  StudentAAPScoresResponse,
  AAEvaluationResponse,
  AAPEvaluationResponse,
} from '../types/evaluation';
import { toast } from 'sonner';

export const evaluationKeys = {
  all: ['evaluation'] as const,
  aaScores: (studentId: number, courseId?: number) =>
    [...evaluationKeys.all, 'aa-scores', studentId, courseId] as const,
  aapScores: (studentId: number, programId?: number) =>
    [...evaluationKeys.all, 'aap-scores', studentId, programId] as const,
  aaEvaluation: (courseId: number) =>
    [...evaluationKeys.all, 'aa-evaluation', courseId] as const,
  aapEvaluation: (programId: number) =>
    [...evaluationKeys.all, 'aap-evaluation', programId] as const,
};

export function useStudentAAScores(studentId: number, courseId?: number) {
  return useQuery<StudentAAScoresResponse>({
    queryKey: evaluationKeys.aaScores(studentId, courseId),
    queryFn: () => evaluationApi.getStudentAAScores(studentId, courseId),
    enabled: !!studentId && !!courseId,
    staleTime: 1000 * 30,
  });
}

export function useStudentAAPScores(studentId: number, programId?: number) {
  return useQuery<StudentAAPScoresResponse>({
    queryKey: evaluationKeys.aapScores(studentId, programId),
    queryFn: () => evaluationApi.getStudentAAPScores(studentId, programId),
    enabled: !!studentId && !!programId,
    staleTime: 1000 * 30,
  });
}

// ── Teacher / Admin hooks ───────────────────────────────────────

/** Fetch AA evaluation heatmap data for a course (teacher) */
export function useAAEvaluation(courseId: number, enabled = true) {
  return useQuery<AAEvaluationResponse>({
    queryKey: evaluationKeys.aaEvaluation(courseId),
    queryFn: () => evaluationApi.getCourseAAEvaluation(courseId),
    enabled: !!courseId && enabled,
  });
}

/** Trigger AA score calculation for a course */
export function useCalculateAAScores(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => evaluationApi.calculateCourseAAScores(courseId),
    onSuccess: (data) => {
      toast.success(data.message || 'Scores AA recalculés avec succès');
      queryClient.invalidateQueries({ queryKey: evaluationKeys.aaEvaluation(courseId) });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Erreur lors du calcul des scores AA');
    },
  });
}

/** Fetch AAP evaluation heatmap data for a program (admin) */
export function useAAPEvaluation(programId: number, enabled = true) {
  return useQuery<AAPEvaluationResponse>({
    queryKey: evaluationKeys.aapEvaluation(programId),
    queryFn: () => evaluationApi.getProgramAAPEvaluation(programId),
    enabled: !!programId && enabled,
  });
}

/** Trigger AAP score calculation for a program */
export function useCalculateAAPScores(programId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => evaluationApi.calculateProgramAAPScores(programId),
    onSuccess: (data) => {
      toast.success(data.message || 'Scores AAP recalculés avec succès');
      queryClient.invalidateQueries({ queryKey: evaluationKeys.aapEvaluation(programId) });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Erreur lors du calcul des scores AAP');
    },
  });
}
