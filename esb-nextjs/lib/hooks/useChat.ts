import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../api/chat';
import { ChatMessage, ChatResponse, SendMessageData, ChatHistory } from '../types/chat';
import { toast } from 'sonner';

// Query keys
export const chatKeys = {
  all: ['chat'] as const,
  document: (documentId: number) => [...chatKeys.all, 'document', documentId] as const,
  documentHistory: (documentId: number) => [...chatKeys.document(documentId), 'history'] as const,
  chapter: (chapterId: number) => [...chatKeys.all, 'chapter', chapterId] as const,
  chapterHistory: (chapterId: number) => [...chatKeys.chapter(chapterId), 'history'] as const,
};

/**
 * Get chat history for a document
 */
export function useChatHistory(documentId: number) {
  return useQuery<ChatHistory>({
    queryKey: chatKeys.documentHistory(documentId),
    queryFn: () => chatApi.getChatHistory(documentId),
    enabled: !!documentId,
  });
}

/**
 * Send a message to document chat
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation<
    ChatResponse,
    Error,
    { documentId: number; data: SendMessageData }
  >({
    mutationFn: ({ documentId, data }) => chatApi.sendMessage(documentId, data),
    onSuccess: (data, variables) => {
      // Invalidate chat history to show new message
      queryClient.invalidateQueries({ queryKey: chatKeys.documentHistory(variables.documentId) });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to send message');
    },
  });
}

/**
 * Clear chat history for a document
 */
export function useClearChat() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: chatApi.clearChat,
    onSuccess: (data, documentId) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.documentHistory(documentId) });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to clear chat');
    },
  });
}

/**
 * Get chat history for a chapter
 */
export function useChapterChatHistory(chapterId: number) {
  return useQuery<ChatHistory>({
    queryKey: chatKeys.chapterHistory(chapterId),
    queryFn: () => chatApi.getChapterChatHistory(chapterId),
    enabled: !!chapterId,
  });
}

/**
 * Send a message to chapter chat
 */
export function useSendChapterMessage() {
  const queryClient = useQueryClient();

  return useMutation<
    ChatResponse,
    Error,
    { chapterId: number; data: SendMessageData }
  >({
    mutationFn: ({ chapterId, data }) => chatApi.sendChapterMessage(chapterId, data),
    onSuccess: (data, variables) => {
      // Invalidate chat history to show new message
      queryClient.invalidateQueries({ queryKey: chatKeys.chapterHistory(variables.chapterId) });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to send message');
    },
  });
}

/**
 * Clear chapter chat history
 */
export function useClearChapterChat() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: chatApi.clearChapterChat,
    onSuccess: (data, chapterId) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.chapterHistory(chapterId) });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to clear chat');
    },
  });
}
