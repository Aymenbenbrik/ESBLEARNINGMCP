import { apiClient } from './client';
import {
  CoursesListResponse,
  CourseDetails,
  CreateCourseData,
  UpdateCourseData,
  EnrollmentResponse,
  ModuleUploadResponse,
  Course,
  CourseDashboardResponse,
} from '../types/course';

const BASE_URL = '/api/v1/courses';

export const coursesApi = {
  /**
   * Get list of courses for current user
   * Teachers: see courses they created
   * Students: see enrolled courses + available courses
   */
  list: async (): Promise<CoursesListResponse> => {
    const response = await apiClient.get<CoursesListResponse>(BASE_URL);
    return response.data;
  },

  /**
   * Create a new course (teachers only)
   */
  create: async (data: CreateCourseData): Promise<Course> => {
    const response = await apiClient.post<Course>(BASE_URL, data);
    return response.data;
  },

  /**
   * Get course details
   * Returns different data for teachers vs students
   */
  get: async (id: number): Promise<CourseDetails> => {
    const response = await apiClient.get<CourseDetails>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Update a course (teachers only)
   */
  update: async (id: number, data: UpdateCourseData): Promise<Course> => {
    const response = await apiClient.put<Course>(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  /**
   * Delete a course (teachers only)
   */
  delete: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Enroll in a course (students only)
   */
  enroll: async (id: number): Promise<EnrollmentResponse> => {
    const response = await apiClient.post<EnrollmentResponse>(`${BASE_URL}/${id}/enroll`);
    return response.data;
  },

  /**
   * Upload a module-level attachment (teachers only)
   */
  uploadModule: async (id: number, data: FormData): Promise<ModuleUploadResponse> => {
    const response = await apiClient.post<ModuleUploadResponse>(
      `${BASE_URL}/${id}/upload-module`,
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
   * Get course dashboard analytics (teachers only)
   * Returns stats, bloom/difficulty/AAA distributions, and recent quizzes
   */
  getDashboard: async (id: number): Promise<CourseDashboardResponse> => {
    const response = await apiClient.get<CourseDashboardResponse>(`${BASE_URL}/${id}/dashboard`);
    return response.data;
  },
};
