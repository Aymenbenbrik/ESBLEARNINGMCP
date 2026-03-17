import { apiClient } from './client';
import {
  Chapter,
  ChapterDetails,
  CreateChapterData,
  UpdateChapterData,
  DocumentUploadResponse,
  SummaryResponse
} from '../types/course';

const BASE_URL = '/api/v1/chapters';

export const chaptersApi = {
  /**
   * Create a new chapter in a course (teachers only)
   */
  create: async (courseId: number, data: CreateChapterData): Promise<Chapter> => {
    const response = await apiClient.post<Chapter>(`${BASE_URL}/${courseId}`, data);
    return response.data;
  },

  /**
   * Get chapter details with documents and TN sections
   */
  get: async (id: number): Promise<ChapterDetails> => {
    const response = await apiClient.get<ChapterDetails>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Update a chapter (teachers only)
   */
  update: async (id: number, data: UpdateChapterData): Promise<Chapter> => {
    const response = await apiClient.put<Chapter>(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  /**
   * Delete a chapter (teachers only)
   */
  delete: async (id: number): Promise<{ message: string; course_id: number }> => {
    const response = await apiClient.delete<{ message: string; course_id: number }>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Upload a document to a chapter (teachers only)
   */
  uploadDocument: async (chapterId: number, data: FormData): Promise<DocumentUploadResponse> => {
    const response = await apiClient.post<DocumentUploadResponse>(
      `${BASE_URL}/${chapterId}/documents`,
      data,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Generate chapter summary (teachers only)
   */
  generateSummary: async (id: number): Promise<SummaryResponse> => {
    const response = await apiClient.post<SummaryResponse>(`${BASE_URL}/${id}/summary/generate`);
    return response.data;
  },

  /**
   * Get chapter summary
   */
  getSummary: async (id: number): Promise<SummaryResponse> => {
    const response = await apiClient.get<SummaryResponse>(`${BASE_URL}/${id}/summary`);
    return response.data;
  },
};
