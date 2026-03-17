import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chaptersApi } from '../api/chapters';
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
};

/**
 * Get chapter details by ID
 */
export function useChapter(id: number) {
  return useQuery<ChapterDetails>({
    queryKey: chapterKeys.detail(id),
    queryFn: () => chaptersApi.get(id),
    enabled: !!id,
  });
}

/**
 * Create a new chapter (teachers only)
 */
export function useCreateChapter() {
  const queryClient = useQueryClient();

  return useMutation<Chapter, Error, { courseId: number; data: CreateChapterData }>({
    mutationFn: ({ courseId, data }) => chaptersApi.create(courseId, data),
    onSuccess: (data, variables) => {
      // Invalidate course detail to refetch chapters list
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(variables.courseId) });
      toast.success(`Chapter "${data.title}" created successfully`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create chapter');
    },
  });
}

/**
 * Update a chapter (teachers only)
 */
export function useUpdateChapter() {
  const queryClient = useQueryClient();

  return useMutation<Chapter, Error, { id: number; data: UpdateChapterData }>({
    mutationFn: ({ id, data }) => chaptersApi.update(id, data),
    onSuccess: (data) => {
      // Invalidate chapter detail and course detail
      queryClient.invalidateQueries({ queryKey: chapterKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(data.course_id) });
      toast.success(`Chapter "${data.title}" updated successfully`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update chapter');
    },
  });
}

/**
 * Delete a chapter (teachers only)
 */
export function useDeleteChapter() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string; course_id: number }, Error, number>({
    mutationFn: chaptersApi.delete,
    onSuccess: (data) => {
      // Invalidate course detail to refetch chapters list
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(data.course_id) });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete chapter');
    },
  });
}

/**
 * Upload a document to a chapter (teachers only)
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation<DocumentUploadResponse, Error, { chapterId: number; data: FormData }>({
    mutationFn: ({ chapterId, data }) => chaptersApi.uploadDocument(chapterId, data),
    onSuccess: (data, variables) => {
      // Invalidate chapter detail to show new document
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

/**
 * Generate chapter summary (teachers only)
 */
export function useGenerateSummary() {
  const queryClient = useQueryClient();

  return useMutation<SummaryResponse, Error, number>({
    mutationFn: chaptersApi.generateSummary,
    onSuccess: (data, chapterId) => {
      // Invalidate chapter detail and summary
      queryClient.invalidateQueries({ queryKey: chapterKeys.detail(chapterId) });
      queryClient.invalidateQueries({ queryKey: chapterKeys.summary(chapterId) });
      toast.success(data.message || 'Chapter summary generated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate summary');
    },
  });
}

/**
 * Get chapter summary
 */
export function useChapterSummary(id: number) {
  return useQuery<SummaryResponse>({
    queryKey: chapterKeys.summary(id),
    queryFn: () => chaptersApi.getSummary(id),
    enabled: !!id,
  });
}
