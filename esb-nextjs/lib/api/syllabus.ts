import { apiClient } from './client';

const BASE_URL = '/api/v1/syllabus';

export interface TNAAItem {
  number: number;
  description: string;
}

export interface TNAAPItem {
  number: number;
  selected: boolean;
}

export interface TNAALink {
  aa_number: number;
  aa_description: string;
  description_override?: string;
}

export interface TNSection {
  index: string;
  title: string;
  aa_links: TNAALink[];
}

export interface TNChapter {
  index: number;
  title: string;
  aa_links: TNAALink[];
  sections: TNSection[];
}

export interface TNAdministrative {
  module_name: string;
  code_ue: string;
  code_ecue: string;
  field: string;
  department: string;
  option: string;
  volume_presentiel: string;
  volume_personnel: string;
  coefficient: number;
  credits: number;
  responsible: string;
  teachers: string[];
}

export interface TNEvaluation {
  methods: string[];
  criteria: string[];
  measures: string[];
  final_grade_formula: string;
}

export interface TNStructured {
  administrative?: TNAdministrative;
  aa: TNAAItem[];
  aap: TNAAPItem[];
  chapters: TNChapter[];
  evaluation?: TNEvaluation;
  bibliography: Array<{ position: number; entry: string }>;
}

export interface SyllabusData {
  id: number;
  course_id: number;
  file_path: string;
  syllabus_type: 'bga' | 'tn';
  clo_data: any;
  plo_data: any;
  weekly_plan: any;
  tn_data: any;
  tn_structured: TNStructured | null;
  created_at: string;
}

export interface CLOData {
  clos: Array<{
    number: number;
    description: string;
    weight: number;
    percent: number;
  }>;
}

export interface PLOData {
  plos: Array<{
    number: number;
    description: string;
  }>;
}

export interface WeeklyPlan {
  weeks: Array<{
    week_number: number;
    topics: string[];
    activities: string[];
    assessments: string[];
    clos: number[];
  }>;
}

export interface UploadSyllabusData {
  file: File;
  syllabus_type: 'bga' | 'tn';
}

export interface ExtractionResult {
  success: boolean;
  message: string;
  data: {
    clo_count?: number;
    plo_count?: number;
    weekly_plan_count?: number;
    tn_chapters_count?: number;
    tn_aa_count?: number;
    chapters_created: number;
  };
}

export interface ClassificationResult {
  success: boolean;
  message: string;
  data: {
    classified: boolean;
    classification: any;
  };
}

export const syllabusApi = {
  /**
   * Upload syllabus file (BGA or TN)
   */
  upload: async (courseId: number, data: UploadSyllabusData): Promise<{ message: string; syllabus_id: number }> => {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('syllabus_type', data.syllabus_type);

    const response = await apiClient.post(`${BASE_URL}/${courseId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Get syllabus data for a course
   */
  get: async (courseId: number): Promise<SyllabusData> => {
    const response = await apiClient.get(`${BASE_URL}/${courseId}`);
    return response.data;
  },

  /**
   * Trigger content extraction from syllabus
   */
  extract: async (courseId: number): Promise<ExtractionResult> => {
    const response = await apiClient.post(`${BASE_URL}/${courseId}/extract`);
    return response.data;
  },

  /**
   * Trigger chapter classification based on syllabus
   */
  classify: async (courseId: number): Promise<ClassificationResult> => {
    const response = await apiClient.post(`${BASE_URL}/${courseId}/classify`);
    return response.data;
  },

  /**
   * Get CLO data for a course
   */
  getCLOData: async (courseId: number): Promise<CLOData> => {
    const response = await apiClient.get(`${BASE_URL}/${courseId}/clo`);
    return response.data;
  },

  /**
   * Get PLO data for a course
   */
  getPLOData: async (courseId: number): Promise<PLOData> => {
    const response = await apiClient.get(`${BASE_URL}/${courseId}/plo`);
    return response.data;
  },

  /**
   * Get weekly plan from syllabus
   */
  getWeeklyPlan: async (courseId: number): Promise<WeeklyPlan> => {
    const response = await apiClient.get(`${BASE_URL}/${courseId}/weekly-plan`);
    return response.data;
  },

  /**
   * Download syllabus file
   */
  download: async (courseId: number): Promise<Blob> => {
    const response = await apiClient.get(`${BASE_URL}/${courseId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  }
};
