import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chaptersApi, AAMatchingData } from '../api/chapters';
import { sectionsApi, chapterSidebarApi, dndApi, sectionActivitiesApi } from '../api/references';
import {
  Chapter,
  ChapterDetails,
  CreateChapterData,
  UpdateChapterData,
  DocumentUploadResponse,
  SummaryResponse
} from '../types/course';
import { toast } from 'sonner';
import { courseKeys } from './useCourses';

// Query keys
export const chapterKeys = {
  all: ['chapters'] as const,
  details: () => [...chapterKeys.all, 'detail'] as const,
  detail: (id: number) => [...chapterKeys.details(), id] as const,
  summaries: () => [...chapterKeys.all, 'summary'] as const,
  summary: (id: number) => [...chapterKeys.summaries(), id] as const,
  aaMatchings: () => [...chapterKeys.all, 'aa-matching'] as const,
  aaMatching: (id: number) => [...chapterKeys.aaMatchings(), id] as const,
};

export function useChapter(id: number) {
  return useQuery<ChapterDetails>({
    queryKey: chapterKeys.detail(id),
    queryFn: () => chaptersApi.get(id),
    enabled: !!id,
  });
}

export function useCreateChapter() {
  const queryClient = useQueryClient();
  return useMutation<Chapter, Error, { courseId: number; data: CreateChapterData }>({
    mutationFn: ({ courseId, data }) => chaptersApi.create(courseId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(variables.courseId) });
      toast.success(`Chapter "${data.title}" created successfully`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create chapter');
    },
  });
}

export function useUpdateChapter() {
  const queryClient = useQueryClient();
  return useMutation<Chapter, Error, { id: number; data: UpdateChapterData }>({
    mutationFn: ({ id, data }) => chaptersApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: chapterKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(data.course_id) });
      toast.success(`Chapter "${data.title}" updated successfully`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update chapter');
    },
  });
}

export function useDeleteChapter() {
  const queryClient = useQueryClient();
  return useMutation<{ message: string; course_id: number }, Error, number>({
    mutationFn: chaptersApi.delete,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(data.course_id) });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete chapter');
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation<DocumentUploadResponse, Error, { chapterId: number; data: FormData }>({
    mutationFn: ({ chapterId, data }) => chaptersApi.uploadDocument(chapterId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: chapterKeys.detail(variables.chapterId) });
      let message = 'Document uploaded successfully';
      if (data.summary_status === 'generated' && data.processing_status === 'processed') {
        message = 'Document uploaded, summary generated, and indexed for AI chat';
      } else if (data.summary_status === 'failed' || data.processing_status === 'processing_failed') {
        message = 'Document uploaded but some processing steps failed';
      }
      toast.success(message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to upload document');
    },
  });
}

/** Generate (or force-regenerate) chapter summary */
export function useGenerateSummary() {
  const queryClient = useQueryClient();
  return useMutation<SummaryResponse, Error, { id: number; force?: boolean }>({
    mutationFn: ({ id, force }) => chaptersApi.generateSummary(id, force),
    onSuccess: (data, { id: chapterId }) => {
      queryClient.invalidateQueries({ queryKey: chapterKeys.detail(chapterId) });
      queryClient.invalidateQueries({ queryKey: chapterKeys.summary(chapterId) });
      toast.success(data.message || 'Résumé généré avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la génération du résumé');
    },
  });
}

export function useChapterSummary(id: number) {
  return useQuery<SummaryResponse>({
    queryKey: chapterKeys.summary(id),
    queryFn: () => chaptersApi.getSummary(id),
    enabled: !!id,
  });
}

// ── AA Matching ──────────────────────────────────────────────────────────────

export function useAAMatching(chapterId: number, enabled = true) {
  return useQuery<AAMatchingData>({
    queryKey: chapterKeys.aaMatching(chapterId),
    queryFn: () => chaptersApi.getAAMatching(chapterId),
    enabled: !!chapterId && enabled,
  });
}

export function useProposeAAMatching() {
  return useMutation<{ proposed_aa_ids: number[] }, Error, number>({
    mutationFn: chaptersApi.proposeAAMatching,
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la proposition automatique');
    },
  });
}

export function useSaveAAMatching() {
  const queryClient = useQueryClient();
  return useMutation<{ message: string; aa_ids: number[] }, Error, { chapterId: number; aaIds: number[] }>({
    mutationFn: ({ chapterId, aaIds }) => chaptersApi.saveAAMatching(chapterId, aaIds),
    onSuccess: (data, { chapterId }) => {
      queryClient.invalidateQueries({ queryKey: chapterKeys.aaMatching(chapterId) });
      queryClient.invalidateQueries({ queryKey: chapterKeys.detail(chapterId) });
      toast.success('Matching AA sauvegardé');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la sauvegarde du matching');
    },
  });
}

// ── Chapter Deadlines & Activity Progress ────────────────────────────────────

export function useChapterDeadlines(chapterId: number) {
  return useQuery({
    queryKey: ['chapter-deadlines', chapterId],
    queryFn: () => chapterSidebarApi.getDeadlines(chapterId),
    enabled: !!chapterId,
  });
}

export function useActivityProgress(chapterId: number) {
  return useQuery({
    queryKey: ['activity-progress', chapterId],
    queryFn: () => chapterSidebarApi.getActivityProgress(chapterId),
    enabled: !!chapterId,
  });
}

// ── Section CRUD ─────────────────────────────────────────────────────────────

export function useCreateSection(chapterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => sectionsApi.create(chapterId, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chapterKeys.detail(chapterId) });
      toast.success('Section ajoutée');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la création de la section');
    },
  });
}

export function useDeleteSection(chapterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: number) => sectionsApi.delete(sectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chapterKeys.detail(chapterId) });
      toast.success('Section supprimée');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la suppression de la section');
    },
  });
}

export function useUpdateSection(chapterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: number; data: { title?: string } }) =>
      sectionsApi.update(sectionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chapterKeys.detail(chapterId) });
      toast.success('Section mise à jour');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la mise à jour de la section');
    },
  });
}

// ── Section & Activity DnD ───────────────────────────────────────────────────

export function useReorderSections(chapterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionIds: number[]) => dndApi.reorderSections(chapterId, sectionIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: chapterKeys.detail(chapterId) }),
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec du réordonnancement des sections');
    },
  });
}

export function useReorderActivities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, activityIds }: { sectionId: number; activityIds: number[] }) =>
      dndApi.reorderActivities(sectionId, activityIds),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['section-activities', vars.sectionId] }),
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec du réordonnancement des activités');
    },
  });
}

export function useMoveActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, sectionId, position }: { activityId: number; sectionId: number; position: number }) =>
      dndApi.moveActivity(activityId, sectionId, position),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['section-activities'] }),
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec du déplacement de l\'activité');
    },
  });
}

// ── Section Detail ────────────────────────────────────────────────────────────

export function useSection(sectionId: number | null) {
  return useQuery({
    queryKey: ['section', sectionId],
    queryFn: () => sectionActivitiesApi.getSectionDetail(sectionId!),
    enabled: !!sectionId,
  });
}

export function useCreateSubSection(chapterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parentSectionId, title }: { parentSectionId: number; title: string }) =>
      sectionsApi.createSection(chapterId, { title, parent_section_id: parentSectionId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chapterKeys.detail(chapterId) });
      toast.success('Sous-section ajoutée');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la création de la sous-section');
    },
  });
}

export function useUpdateActivityTitle(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, title }: { activityId: number; title: string }) =>
      sectionActivitiesApi.updateActivityTitle(activityId, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['section-activities', sectionId] });
      qc.invalidateQueries({ queryKey: ['section', sectionId] });
      toast.success('Titre mis à jour');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la mise à jour du titre');
    },
  });
}

