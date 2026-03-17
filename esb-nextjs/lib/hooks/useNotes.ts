import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '../api/notes';
import { Note, CreateNoteData, UpdateNoteData } from '../types/notes';
import { toast } from 'sonner';

// Query keys
export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
  list: (documentId: number) => [...noteKeys.lists(), documentId] as const,
  details: () => [...noteKeys.all, 'detail'] as const,
  detail: (id: number) => [...noteKeys.details(), id] as const,
};

/**
 * Get all notes for a document
 */
export function useDocumentNotes(documentId: number) {
  return useQuery<{ notes: Note[] }>({
    queryKey: noteKeys.list(documentId),
    queryFn: () => notesApi.getDocumentNotes(documentId),
    enabled: !!documentId,
  });
}

/**
 * Create a new note
 */
export function useAddNote() {
  const queryClient = useQueryClient();

  return useMutation<Note, Error, CreateNoteData>({
    mutationFn: notesApi.create,
    onSuccess: (data, variables) => {
      // Invalidate notes list for the document
      queryClient.invalidateQueries({ queryKey: noteKeys.list(variables.document_id) });
      toast.success('Note created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create note');
    },
  });
}

/**
 * Update a note
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation<Note, Error, { noteId: number; data: UpdateNoteData }>({
    mutationFn: ({ noteId, data }) => notesApi.update(noteId, data),
    onSuccess: (data) => {
      // Invalidate notes list for the document
      queryClient.invalidateQueries({ queryKey: noteKeys.list(data.document_id) });
      queryClient.invalidateQueries({ queryKey: noteKeys.detail(data.id) });
      toast.success('Note updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update note');
    },
  });
}

/**
 * Delete a note
 */
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: notesApi.delete,
    onSuccess: (data) => {
      // Invalidate all notes lists (we don't know which document it belongs to)
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete note');
    },
  });
}
