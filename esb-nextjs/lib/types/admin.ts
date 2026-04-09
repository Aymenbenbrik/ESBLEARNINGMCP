import { User } from './course';

// ============================================================================
// PROGRAM TYPES
// ============================================================================

export interface Program {
  id: number;
  name: string;
  code?: string | null;
  description: string | null;
  program_type?: string;
  created_at: string;
  courses_count: number;
  classes_count: number;
  aaps_count?: number;
  competences_count?: number;
}

export interface ProgramAAP {
  id: number;
  program_id: number;
  code: string;
  description: string;
  order: number;
  competence_ids: number[];
}

export interface ProgramCompetence {
  id: number;
  program_id: number;
  code: string;
  description: string;
  aap_ids: number[];
}

export interface AAPCompetenceMatrix {
  aaps: ProgramAAP[];
  competences: ProgramCompetence[];
  matrix: {
    competence: ProgramCompetence;
    aap_links: boolean[];
  }[];
}

export interface ExtractDescriptorResult {
  message: string;
  result: { aaps_count: number; competences_count: number; links_count: number; courses_linked?: number };
  extracted: {
    aaps: { code: string; denomination: string; description: string }[];
    competences: { code: string; description: string; nature: string }[];
    matrix: { competence_code: string; aap_codes: string[] }[];
    study_plan?: { name: string; semester: number; ue: string }[];
  };
}

export interface PipelineStep {
  agent: string;
  status: string;
  details: Record<string, unknown>;
}

export interface PipelineTeacher {
  name: string;
  username: string;
  password?: string;
  email: string;
  id: number;
}

export interface PipelineModule {
  course_id: number;
  title: string;
  code: string;
  semester: number;
  ue: string;
  teacher_id: number;
  teacher_name: string;
  course_link: string;
}

export interface ProcessDescriptorResult {
  message: string;
  steps: PipelineStep[];
  modules_table: PipelineModule[];
  teachers_created: PipelineTeacher[];
}

export interface ProgramDetails {
  program: {
    id: number;
    name: string;
    code?: string | null;
    description: string | null;
    program_type?: string;
    descriptor_file?: string;
    descriptor_uploaded_at?: string;
    created_at: string;
    courses_count: number;
    classes_count: number;
    courses: ProgramCourse[];
    classes: ProgramClass[];
    aaps: ProgramAAP[];
    competences: ProgramCompetence[];
  };
}

export interface ProgramCourse {
  id: number;
  title: string;
  description: string | null;
  teacher: User | null;
  chapters_count: number;
  students_count: number;
}

export interface ProgramClass {
  id: number;
  name: string;
  program_id: number;
  created_at: string;
  students_count: number;
  courses_count: number;
}

// ============================================================================
// CLASS TYPES
// ============================================================================

export interface Classe {
  id: number;
  name: string;
  program_id: number;
  program_name: string | null;
  created_at: string;
  students_count: number;
}

export interface ClassCourseAssignment {
  id: number;
  course: {
    id: number;
    title: string;
    description: string | null;
  };
  teacher: User | null;
  created_at: string;
}

export interface ClassDetails {
  class: {
    id: number;
    name: string;
    program_id: number;
    program_name: string | null;
    created_at: string;
    students_count: number;
  };
  assignments: ClassCourseAssignment[];
  available_teachers: User[];
  program_courses: {
    id: number;
    title: string;
    description: string | null;
    teacher_id: number | null;
  }[];
}

export interface ClassStudent {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

export interface ClassStudentsResponse {
  class: {
    id: number;
    name: string;
    program_id: number;
    program_name: string | null;
  };
  enrolled_students: ClassStudent[];
  all_students: {
    id: number;
    username: string;
    email: string;
    class_id: number | null;
    class_name: string | null;
  }[];
  total_enrolled: number;
}

// ============================================================================
// ADMIN DASHBOARD TYPES
// ============================================================================

export interface AdminDashboardStats {
  programs_count: number;
  classes_count: number;
  students_count: number;
  teachers_count: number;
  courses_count: number;
  total_users: number;
}

export interface RecentProgram {
  id: number;
  name: string;
  created_at: string | null;
}

export interface RecentClass {
  id: number;
  name: string;
  program_id: number;
  program_name: string | null;
  created_at: string | null;
}

export interface RecentUser {
  id: number;
  username: string;
  email: string;
  is_teacher: boolean;
  is_superuser: boolean;
  created_at: string | null;
}

export interface AdminDashboardResponse {
  stats: AdminDashboardStats;
  recent: {
    programs: RecentProgram[];
    classes: RecentClass[];
    users: RecentUser[];
  };
}

// ============================================================================
// FORM DATA TYPES
// ============================================================================

export interface CreateProgramData {
  name: string;
  code?: string;
  description?: string;
  program_type?: string;
}

export interface UpdateProgramData {
  name?: string;
  code?: string;
  description?: string;
  program_type?: string;
}

export interface CreateClassData {
  name: string;
}

// ============================================================================
// ADMIN CLASS MANAGEMENT TYPES
// ============================================================================

export interface AdminClassListItem {
  id: number;
  name: string;
  description: string | null;
  academic_year: string | null;
  program_id: number | null;
  program_name: string | null;
  students_count: number;
  courses_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminClassesListResponse {
  classes: AdminClassListItem[];
  total: number;
}

export interface AdminCreateClassData {
  name: string;
  description?: string;
  academic_year?: string;
  program_id?: number | null;
}

export interface AdminUpdateClassData {
  name?: string;
  description?: string;
  academic_year?: string;
  program_id?: number | null;
}

export interface AdminClassMutationResponse {
  message: string;
  class: AdminClassListItem;
}

export interface AdminDeleteClassResponse {
  message: string;
}

export interface TeacherAssignment {
  course_id: number;
  teacher_id: number | null;
}

export interface AssignTeachersData {
  assignments: TeacherAssignment[];
}

export interface UpdateClassStudentsData {
  student_ids: number[];
}

// ============================================================================
// TEACHER MANAGEMENT TYPES
// ============================================================================

export interface AdminTeacher {
  id: number;
  username: string;
  email: string;
  is_superuser: boolean;
  created_at: string | null;
  courses_count: number;
  students_count: number;
}

export interface TeachersListResponse {
  teachers: AdminTeacher[];
  total: number;
}

export interface CreateTeacherData {
  username: string;
  email: string;
  password?: string;
}

export interface CreateTeacherResponse {
  message: string;
  teacher: AdminTeacher & { password: string };
}

export interface UpdateTeacherData {
  username?: string;
  email?: string;
  is_superuser?: boolean;
}

export interface UpdateTeacherResponse {
  message: string;
  teacher: AdminTeacher;
}

export interface ResetTeacherPasswordResponse {
  message: string;
  password: string;
}

export interface AddCourseToProgramData {
  course_id: number;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ProgramsListResponse {
  programs: Program[];
  total: number;
}

export interface CreateProgramResponse {
  message: string;
  program: Program;
}

export interface UpdateProgramResponse {
  message: string;
  program: Program;
}

export interface DeleteProgramResponse {
  message: string;
}

export interface AddCourseToProgramResponse {
  message: string;
  program: {
    id: number;
    name: string;
    courses_count: number;
  };
  course: {
    id: number;
    title: string;
  };
}

export interface RemoveCourseFromProgramResponse {
  message: string;
  program: {
    id: number;
    name: string;
    courses_count: number;
  };
}

export interface CreateClassResponse {
  message: string;
  class: {
    id: number;
    name: string;
    program_id: number;
    program_name: string;
    created_at: string;
    students_count: number;
    courses_count: number;
  };
}

export interface AssignTeachersResponse {
  message: string;
  updated: number;
  errors: string[] | null;
}

export interface UpdateClassStudentsResponse {
  message: string;
  added: number;
  removed: number;
  total: number;
}
