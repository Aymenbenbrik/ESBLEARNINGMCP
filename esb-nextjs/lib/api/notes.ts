import { apiClient } from './client';
import { Note, CreateNoteData, UpdateNoteData } from '../types/notes';

const BASE_URL = '/api/v1/notes';

export const notesApi = {
  /**
   * Get all notes for a document
   */
  getDocumentNotes: async (documentId: number): Promise<{ notes: Note[] }> => {
    const response = await apiClient.get(`${BASE_URL}/document/${documentId}`);
    return response.data;
  },

  /**
   * Create a new note
   */
  create: async (data: CreateNoteData): Promise<Note> => {
    const formData = new FormData();
    formData.append('document_id', data.document_id.toString());

    if (data.content) {
      formData.append('content', data.content);
    }

    if (data.image) {
      formData.append('image', data.image);
    }

    const response = await apiClient.post(BASE_URL, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Update a note
   */
  update: async (noteId: number, data: UpdateNoteData): Promise<Note> => {
    const formData = new FormData();

    if (data.content) {
      formData.append('content', data.content);
    }

    if (data.image) {
      formData.append('image', data.image);
    }

    const response = await apiClient.put(`${BASE_URL}/${noteId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Delete a note
   */
  delete: async (noteId: number): Promise<{ message: string }> => {
    const response = await apiClient.delete(`${BASE_URL}/${noteId}`);
    return response.data;
  },

  /**
   * Get note image URL (absolute URL for use in <img src>)
   */
  getImageUrl: (filename: string): string => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return `${API_URL}${BASE_URL}/image/${filename}`;
  }
};
