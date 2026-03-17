import { apiClient } from './client';
import {
  ProgramsListResponse,
  ProgramDetails,
  CreateProgramData,
  UpdateProgramData,
  CreateProgramResponse,
  UpdateProgramResponse,
  DeleteProgramResponse,
  AddCourseToProgramData,
  AddCourseToProgramResponse,
  RemoveCourseFromProgramResponse,
  CreateClassData,
  CreateClassResponse,
} from '../types/admin';

const BASE_URL = '/api/v1/programs';

export const programsApi = {
  /**
   * List all programs (superuser only)
   */
  list: async (): Promise<ProgramsListResponse> => {
    const response = await apiClient.get<ProgramsListResponse>(BASE_URL);
    return response.data;
  },

  /**
   * Create a new program (superuser only)
   */
  create: async (data: CreateProgramData): Promise<CreateProgramResponse> => {
    const response = await apiClient.post<CreateProgramResponse>(BASE_URL, data);
    return response.data;
  },

  /**
   * Get program details with courses and classes (superuser only)
   */
  get: async (id: number): Promise<ProgramDetails> => {
    const response = await apiClient.get<ProgramDetails>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Update a program (superuser only)
   */
  update: async (id: number, data: UpdateProgramData): Promise<UpdateProgramResponse> => {
    const response = await apiClient.put<UpdateProgramResponse>(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  /**
   * Delete a program (superuser only)
   * Cannot delete if classes exist
   */
  delete: async (id: number): Promise<DeleteProgramResponse> => {
    const response = await apiClient.delete<DeleteProgramResponse>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Add a course to a program (superuser only)
   */
  addCourse: async (
    programId: number,
    data: AddCourseToProgramData
  ): Promise<AddCourseToProgramResponse> => {
    const response = await apiClient.post<AddCourseToProgramResponse>(
      `${BASE_URL}/${programId}/courses`,
      data
    );
    return response.data;
  },

  /**
   * Remove a course from a program (superuser only)
   */
  removeCourse: async (
    programId: number,
    courseId: number
  ): Promise<RemoveCourseFromProgramResponse> => {
    const response = await apiClient.delete<RemoveCourseFromProgramResponse>(
      `${BASE_URL}/${programId}/courses/${courseId}`
    );
    return response.data;
  },

  /**
   * Create a class within a program (superuser only)
   */
  createClass: async (
    programId: number,
    data: CreateClassData
  ): Promise<CreateClassResponse> => {
    const response = await apiClient.post<CreateClassResponse>(
      `${BASE_URL}/${programId}/classes`,
      data
    );
    return response.data;
  },
};
