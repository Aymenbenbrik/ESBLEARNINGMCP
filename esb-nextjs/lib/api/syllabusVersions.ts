import { apiClient } from './client';
import type {
  SyllabusVersion,
  SyllabusVersionsResponse,
  DiffResponse,
  ChangeReportResponse,
  CreateVersionRequest,
  UpdateVersionRequest,
  RejectVersionRequest,
} from '../types/syllabusVersions';

const BASE = (courseId: number) => `/api/v1/syllabus/${courseId}/versions`;

export const syllabusVersionsApi = {
  /** List all versions for a course syllabus */
  list: async (courseId: number): Promise<SyllabusVersionsResponse> => {
    const res = await apiClient.get<SyllabusVersionsResponse>(BASE(courseId));
    return res.data;
  },

  /** Get a specific version (includes full snapshot) */
  get: async (courseId: number, versionId: number): Promise<SyllabusVersion> => {
    const res = await apiClient.get<SyllabusVersion>(`${BASE(courseId)}/${versionId}`);
    return res.data;
  },

  /** Create a new draft version */
  create: async (courseId: number, data: CreateVersionRequest): Promise<SyllabusVersion> => {
    const res = await apiClient.post<SyllabusVersion>(BASE(courseId), data);
    return res.data;
  },

  /** Update label / notes / snapshot of a draft version */
  update: async (courseId: number, versionId: number, data: UpdateVersionRequest): Promise<SyllabusVersion> => {
    const res = await apiClient.patch<SyllabusVersion>(`${BASE(courseId)}/${versionId}`, data);
    return res.data;
  },

  /** Submit a draft version for validation */
  submit: async (courseId: number, versionId: number): Promise<SyllabusVersion> => {
    const res = await apiClient.post<SyllabusVersion>(`${BASE(courseId)}/${versionId}/submit`, {});
    return res.data;
  },

  /** Validate a proposed version */
  validate: async (courseId: number, versionId: number): Promise<SyllabusVersion> => {
    const res = await apiClient.post<SyllabusVersion>(`${BASE(courseId)}/${versionId}/validate`, {});
    return res.data;
  },

  /** Reject a proposed version */
  reject: async (courseId: number, versionId: number, data: RejectVersionRequest): Promise<SyllabusVersion> => {
    const res = await apiClient.post<SyllabusVersion>(`${BASE(courseId)}/${versionId}/reject`, data);
    return res.data;
  },

  /** Apply a validated version to the live syllabus */
  apply: async (courseId: number, versionId: number): Promise<{ message: string; version: SyllabusVersion }> => {
    const res = await apiClient.post<{ message: string; version: SyllabusVersion }>(
      `${BASE(courseId)}/${versionId}/apply`, {}
    );
    return res.data;
  },

  /** Compute diff between two versions */
  diff: async (courseId: number, fromId?: number, toId?: number): Promise<DiffResponse> => {
    const params = new URLSearchParams();
    if (fromId) params.set('from', String(fromId));
    if (toId)   params.set('to',   String(toId));
    const res = await apiClient.get<DiffResponse>(`${BASE(courseId)}/diff?${params}`);
    return res.data;
  },

  /** Generate end-of-course change report */
  report: async (courseId: number): Promise<ChangeReportResponse> => {
    const res = await apiClient.get<ChangeReportResponse>(`${BASE(courseId)}/report`);
    return res.data;
  },
};
