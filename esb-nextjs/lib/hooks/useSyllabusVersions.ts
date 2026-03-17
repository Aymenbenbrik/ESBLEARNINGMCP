import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { syllabusVersionsApi } from '../api/syllabusVersions';
import type {
  CreateVersionRequest,
  UpdateVersionRequest,
  RejectVersionRequest,
} from '../types/syllabusVersions';
import { toast } from 'sonner';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const syllabusVersionKeys = {
  all: ['syllabus-versions'] as const,
  list: (courseId: number) => [...syllabusVersionKeys.all, courseId] as const,
  detail: (courseId: number, versionId: number) =>
    [...syllabusVersionKeys.all, courseId, versionId] as const,
  diff: (courseId: number, fromId?: number, toId?: number) =>
    [...syllabusVersionKeys.all, courseId, 'diff', fromId, toId] as const,
  report: (courseId: number) => [...syllabusVersionKeys.all, courseId, 'report'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSyllabusVersions(courseId: number) {
  return useQuery({
    queryKey: syllabusVersionKeys.list(courseId),
    queryFn:  () => syllabusVersionsApi.list(courseId),
    enabled:  !!courseId,
  });
}

export function useSyllabusVersion(courseId: number, versionId: number | null) {
  return useQuery({
    queryKey: syllabusVersionKeys.detail(courseId, versionId!),
    queryFn:  () => syllabusVersionsApi.get(courseId, versionId!),
    enabled:  !!courseId && !!versionId,
  });
}

export function useSyllabusDiff(courseId: number, fromId?: number, toId?: number) {
  return useQuery({
    queryKey: syllabusVersionKeys.diff(courseId, fromId, toId),
    queryFn:  () => syllabusVersionsApi.diff(courseId, fromId, toId),
    enabled:  !!courseId,
  });
}

export function useSyllabusChangeReport(courseId: number, enabled = false) {
  return useQuery({
    queryKey: syllabusVersionKeys.report(courseId),
    queryFn:  () => syllabusVersionsApi.report(courseId),
    enabled:  !!courseId && enabled,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateSyllabusVersion(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVersionRequest) =>
      syllabusVersionsApi.create(courseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: syllabusVersionKeys.list(courseId) });
      toast.success('Nouvelle version créée');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Erreur lors de la création de la version');
    },
  });
}

export function useUpdateSyllabusVersion(courseId: number, versionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateVersionRequest) =>
      syllabusVersionsApi.update(courseId, versionId, data),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: syllabusVersionKeys.list(courseId) });
      qc.setQueryData(syllabusVersionKeys.detail(courseId, versionId), v);
      toast.success('Version mise à jour');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Erreur lors de la mise à jour');
    },
  });
}

export function useSubmitSyllabusVersion(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) => syllabusVersionsApi.submit(courseId, versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: syllabusVersionKeys.list(courseId) });
      toast.success('Version soumise pour validation');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Erreur lors de la soumission');
    },
  });
}

export function useValidateSyllabusVersion(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) => syllabusVersionsApi.validate(courseId, versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: syllabusVersionKeys.list(courseId) });
      toast.success('Version validée ✓');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Erreur lors de la validation');
    },
  });
}

export function useRejectSyllabusVersion(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, data }: { versionId: number; data: RejectVersionRequest }) =>
      syllabusVersionsApi.reject(courseId, versionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: syllabusVersionKeys.list(courseId) });
      toast.success('Version rejetée');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Erreur lors du rejet');
    },
  });
}

export function useApplySyllabusVersion(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) => syllabusVersionsApi.apply(courseId, versionId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: syllabusVersionKeys.list(courseId) });
      // Invalidate the live syllabus so the viewer refreshes
      qc.invalidateQueries({ queryKey: ['syllabus', 'detail', courseId] });
      toast.success(res.message || 'Version appliquée au syllabus');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Erreur lors de l'application de la version");
    },
  });
}
