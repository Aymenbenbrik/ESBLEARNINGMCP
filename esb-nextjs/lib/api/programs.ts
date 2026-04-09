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
  ProgramAAP,
  ProgramCompetence,
  AAPCompetenceMatrix,
  ExtractDescriptorResult,
  ProcessDescriptorResult,
  ExtractSyllabiResult,
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

  // =========================================================================
  // DESCRIPTOR
  // =========================================================================

  /**
   * Upload a descriptor file (.docx) for a program
   */
  uploadDescriptor: async (programId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    // Let Axios auto-set Content-Type with multipart boundary (remove default json header)
    const { data } = await apiClient.post(
      `${BASE_URL}/${programId}/upload-descriptor`,
      formData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { headers: { 'Content-Type': undefined as any } }
    );
    return data;
  },

  /**
   * Extract AAP & competences from uploaded descriptor
   */
  extractDescriptor: async (programId: number): Promise<ExtractDescriptorResult> => {
    const { data } = await apiClient.post<ExtractDescriptorResult>(
      `${BASE_URL}/${programId}/extract-descriptor`
    );
    return data;
  },

  /**
   * Process descriptor: full agentic AI pipeline
   */
  processDescriptor: async (programId: number): Promise<ProcessDescriptorResult> => {
    const { data } = await apiClient.post<ProcessDescriptorResult>(
      `${BASE_URL}/${programId}/process-descriptor`
    );
    return data;
  },

  // =========================================================================
  // STUDY PLAN
  // =========================================================================

  /**
   * Upload a study plan file (.zip, .pdf, .docx) for a program
   */
  uploadStudyPlan: async (programId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post(
      `${BASE_URL}/${programId}/upload-study-plan`,
      formData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { headers: { 'Content-Type': undefined as any } }
    );
    return data;
  },

  /**
   * Extract syllabi from course PDFs for all courses in program
   */
  extractSyllabi: async (programId: number): Promise<ExtractSyllabiResult> => {
    const { data } = await apiClient.post<ExtractSyllabiResult>(
      `${BASE_URL}/${programId}/extract-syllabi`
    );
    return data;
  },

  // =========================================================================
  // AAP
  // =========================================================================

  listAAPs: async (programId: number): Promise<ProgramAAP[]> => {
    const { data } = await apiClient.get<{ aaps: ProgramAAP[] }>(`${BASE_URL}/${programId}/aap`);
    return data.aaps;
  },

  createAAP: async (
    programId: number,
    payload: { code: string; description: string; order: number }
  ): Promise<ProgramAAP> => {
    const { data } = await apiClient.post<ProgramAAP>(`${BASE_URL}/${programId}/aap`, payload);
    return data;
  },

  updateAAP: async (
    programId: number,
    aapId: number,
    payload: { code?: string; description?: string; order?: number }
  ): Promise<ProgramAAP> => {
    const { data } = await apiClient.put<ProgramAAP>(
      `${BASE_URL}/${programId}/aap/${aapId}`,
      payload
    );
    return data;
  },

  deleteAAP: async (programId: number, aapId: number): Promise<{ message: string }> => {
    const { data } = await apiClient.delete<{ message: string }>(
      `${BASE_URL}/${programId}/aap/${aapId}`
    );
    return data;
  },

  // =========================================================================
  // COMPETENCES
  // =========================================================================

  listCompetences: async (programId: number): Promise<ProgramCompetence[]> => {
    const { data } = await apiClient.get<{ competences: ProgramCompetence[] }>(
      `${BASE_URL}/${programId}/competences`
    );
    return data.competences;
  },

  createCompetence: async (
    programId: number,
    payload: { code: string; description: string }
  ): Promise<ProgramCompetence> => {
    const { data } = await apiClient.post<ProgramCompetence>(
      `${BASE_URL}/${programId}/competences`,
      payload
    );
    return data;
  },

  updateCompetence: async (
    programId: number,
    compId: number,
    payload: { code?: string; description?: string }
  ): Promise<ProgramCompetence> => {
    const { data } = await apiClient.put<ProgramCompetence>(
      `${BASE_URL}/${programId}/competences/${compId}`,
      payload
    );
    return data;
  },

  deleteCompetence: async (
    programId: number,
    compId: number
  ): Promise<{ message: string }> => {
    const { data } = await apiClient.delete<{ message: string }>(
      `${BASE_URL}/${programId}/competences/${compId}`
    );
    return data;
  },

  // =========================================================================
  // MATRIX
  // =========================================================================

  getMatrix: async (programId: number): Promise<AAPCompetenceMatrix> => {
    const { data } = await apiClient.get<AAPCompetenceMatrix>(
      `${BASE_URL}/${programId}/aap-competence-matrix`
    );
    return data;
  },

  updateMatrix: async (
    programId: number,
    links: { competence_id: number; aap_ids: number[] }[]
  ): Promise<AAPCompetenceMatrix> => {
    const { data } = await apiClient.put<AAPCompetenceMatrix>(
      `${BASE_URL}/${programId}/aap-competence-matrix`,
      { links }
    );
    return data;
  },
};
