import { apiClient } from './client';
import { ChatMessage, ChatResponse, SendMessageData, ChatHistory } from '../types/chat';

// Updated to match backend API structure: /api/v1/ai/chat/* and /api/v1/ai/chapter-chat/*
const BASE_URL = '/api/v1/ai';

export const chatApi = {
  /**
   * Send a message to document chat
   * Backend endpoint: POST /api/v1/ai/chat/{document_id}
   */
  sendMessage: async (documentId: number, data: SendMessageData): Promise<ChatResponse> => {
    const response = await apiClient.post(`${BASE_URL}/chat/${documentId}`, data);
    return response.data;
  },

  /**
   * Get chat history for a document
   * Backend endpoint: GET /api/v1/ai/chat/{document_id}/history
   */
  getChatHistory: async (documentId: number): Promise<ChatHistory> => {
    const response = await apiClient.get(`${BASE_URL}/chat/${documentId}/history`);
    return response.data;
  },

  /**
   * Clear chat history for a document
   * Backend endpoint: POST /api/v1/ai/chat/{document_id}/clear (uses POST, not DELETE)
   */
  clearChat: async (documentId: number): Promise<{ message: string }> => {
    const response = await apiClient.post(`${BASE_URL}/chat/${documentId}/clear`, {});
    return response.data;
  },

  /**
   * Send a message to chapter-level chat
   * Backend endpoint: POST /api/v1/ai/chapter-chat/{chapter_id}
   */
  sendChapterMessage: async (chapterId: number, data: SendMessageData): Promise<ChatResponse> => {
    const response = await apiClient.post(`${BASE_URL}/chapter-chat/${chapterId}`, data);
    return response.data;
  },

  /**
   * Get chat history for a chapter
   * Backend endpoint: GET /api/v1/ai/chapter-chat/{chapter_id}/history
   */
  getChapterChatHistory: async (chapterId: number): Promise<ChatHistory> => {
    const response = await apiClient.get(`${BASE_URL}/chapter-chat/${chapterId}/history`);
    return response.data;
  },

  /**
   * Clear chat history for a chapter
   * Backend endpoint: POST /api/v1/ai/chapter-chat/{chapter_id}/clear (uses POST, not DELETE)
   */
  clearChapterChat: async (chapterId: number): Promise<{ message: string }> => {
    const response = await apiClient.post(`${BASE_URL}/chapter-chat/${chapterId}/clear`, {});
    return response.data;
  }
};
