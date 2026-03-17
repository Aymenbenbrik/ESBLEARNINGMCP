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

export interface AAItem { id: number; number: number; description: string; }
export interface AAMatchingData {
  tn_chapter_id: number;
  all_aas: AAItem[];
  current_aa_ids: number[];
  can_edit: boolean;
}

export const chaptersApi = {
  create: async (courseId: number, data: CreateChapterData): Promise<Chapter> => {
    const response = await apiClient.post<Chapter>(`${BASE_URL}/${courseId}`, data);
    return response.data;
  },

  get: async (id: number): Promise<ChapterDetails> => {
    const response = await apiClient.get<ChapterDetails>(`${BASE_URL}/${id}`);
    return response.data;
  },

  update: async (id: number, data: UpdateChapterData): Promise<Chapter> => {
    const response = await apiClient.put<Chapter>(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<{ message: string; course_id: number }> => {
    const response = await apiClient.delete<{ message: string; course_id: number }>(`${BASE_URL}/${id}`);
    return response.data;
  },

  uploadDocument: async (chapterId: number, data: FormData): Promise<DocumentUploadResponse> => {
    const response = await apiClient.post<DocumentUploadResponse>(
      `${BASE_URL}/${chapterId}/documents`,
      data,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  /** Generate (or force-regenerate) chapter summary */
  generateSummary: async (id: number, force = false): Promise<SummaryResponse> => {
    const response = await apiClient.post<SummaryResponse>(
      `${BASE_URL}/${id}/summary/generate`,
      { force }
    );
    return response.data;
  },

  getSummary: async (id: number): Promise<SummaryResponse> => {
    const response = await apiClient.get<SummaryResponse>(`${BASE_URL}/${id}/summary`);
    return response.data;
  },

  /** AA matching */
  getAAMatching: async (id: number): Promise<AAMatchingData> => {
    const response = await apiClient.get<AAMatchingData>(`${BASE_URL}/${id}/aa-matching`);
    return response.data;
  },

  proposeAAMatching: async (id: number): Promise<{ proposed_aa_ids: number[] }> => {
    const response = await apiClient.post<{ proposed_aa_ids: number[] }>(
      `${BASE_URL}/${id}/aa-matching/propose`
    );
    return response.data;
  },

  saveAAMatching: async (id: number, aaIds: number[]): Promise<{ message: string; aa_ids: number[] }> => {
    const response = await apiClient.put<{ message: string; aa_ids: number[] }>(
      `${BASE_URL}/${id}/aa-matching`,
      { aa_ids: aaIds }
    );
    return response.data;
  },
};
