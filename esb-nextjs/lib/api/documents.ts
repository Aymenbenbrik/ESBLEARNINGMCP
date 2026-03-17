import { apiClient } from './client';
import { Document } from '../types/course';

const BASE_URL = '/api/v1/documents';

export const documentsApi = {
  /**
   * Get document details
   */
  get: async (id: number): Promise<Document> => {
    const response = await apiClient.get<Document>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Delete a document (teachers only)
   */
  delete: async (id: number): Promise<{ message: string; chapter_id: number | null }> => {
    const response = await apiClient.delete<{ message: string; chapter_id: number | null }>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Reprocess a document for RAG (teachers only, PDF only)
   */
  reprocess: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(`${BASE_URL}/${id}/reprocess`);
    return response.data;
  },

  /**
   * Get download URL for a document
   */
  getDownloadUrl: (id: number): string => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return `${API_URL}${BASE_URL}/${id}/download`;
  },

  /**
   * Get file URL for viewing a document (PDF, etc.)
   */
  getFileUrl: (id: number): string => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return `${API_URL}${BASE_URL}/${id}/file`;
  },
};
