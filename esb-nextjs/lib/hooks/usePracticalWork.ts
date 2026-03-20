import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { practicalWorkApi } from '../api/practicalWork';
import {
  CreateTPData,
  UpdateTPData,
  SubmitCodeData,
  GradeSubmissionData,
} from '../types/practicalWork';
import { toast } from 'sonner';

export const tpKeys = {
  all: ['practical-work'] as const,
  section: (sectionId: number) => [...tpKeys.all, 'section', sectionId] as const,
  detail: (tpId: number) => [...tpKeys.all, 'detail', tpId] as const,
  submissions: (tpId: number) => [...tpKeys.all, 'submissions', tpId] as const,
  mySubmission: (tpId: number) => [...tpKeys.all, 'my-submission', tpId] as const,
};

export function useTPList(sectionId: number) {
  return useQuery({
    queryKey: tpKeys.section(sectionId),
    queryFn: () => practicalWorkApi.listForSection(sectionId),
    enabled: !!sectionId,
  });
}

export function useTP(tpId: number) {
  return useQuery({
    queryKey: tpKeys.detail(tpId),
    queryFn: () => practicalWorkApi.get(tpId),
    enabled: !!tpId,
  });
}

export function useCreateTP(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTPData) => practicalWorkApi.create(sectionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tpKeys.section(sectionId) });
      toast.success('TP créé avec succès');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erreur lors de la création'),
  });
}

export function useUpdateTP(tpId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTPData) => practicalWorkApi.update(tpId, data),
    onSuccess: (tp) => {
      qc.setQueryData(tpKeys.detail(tpId), tp);
      toast.success('TP mis à jour');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erreur de mise à jour'),
  });
}

export function usePublishTP(tpId: number, sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => practicalWorkApi.publish(tpId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tpKeys.detail(tpId) });
      qc.invalidateQueries({ queryKey: tpKeys.section(sectionId) });
      toast.success('TP publié ! Les étudiants peuvent y accéder.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erreur de publication'),
  });
}

export function useDeleteTP(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tpId: number) => practicalWorkApi.delete(tpId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tpKeys.section(sectionId) });
      toast.success('TP supprimé');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erreur de suppression'),
  });
}

export function useGenerateStatement(tpId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hint?: string) => practicalWorkApi.generateStatement(tpId, hint),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tpKeys.detail(tpId) });
      toast.success('Énoncé généré par IA');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || "Erreur de génération d'énoncé"),
  });
}

export function useSuggestAA(tpId: number) {
  return useMutation({
    mutationFn: () => practicalWorkApi.suggestAA(tpId),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erreur de suggestion AA'),
  });
}

export function useGenerateReference(tpId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => practicalWorkApi.generateReference(tpId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tpKeys.detail(tpId) });
      toast.success('Correction de référence générée');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erreur de génération de référence'),
  });
}

export function useSubmitCode(tpId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SubmitCodeData) => practicalWorkApi.submit(tpId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tpKeys.mySubmission(tpId) });
      toast.success('Code soumis ! Correction IA en cours…');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erreur de soumission'),
  });
}

export function useMySubmission(tpId: number) {
  return useQuery({
    queryKey: tpKeys.mySubmission(tpId),
    queryFn: () => practicalWorkApi.getMySubmission(tpId),
    enabled: !!tpId,
    refetchInterval: (data: any) => {
      // Poll every 5s while correction is in progress
      if (data?.correction_status === 'pending' || data?.correction_status === 'correcting') {
        return 5000;
      }
      return false;
    },
  });
}

export function useTPSubmissions(tpId: number) {
  return useQuery({
    queryKey: tpKeys.submissions(tpId),
    queryFn: () => practicalWorkApi.listSubmissions(tpId),
    enabled: !!tpId,
  });
}

export function useGradeSubmission(tpId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subId, data }: { subId: number; data: GradeSubmissionData }) =>
      practicalWorkApi.gradeSubmission(subId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tpKeys.submissions(tpId) });
      toast.success('Note validée et enregistrée');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erreur de notation'),
  });
}
