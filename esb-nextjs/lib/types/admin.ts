import { User } from './course';

// ============================================================================
// PROGRAM TYPES
// ============================================================================

export interface Program {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  courses_count: number;
  classes_count: number;
}

export interface ProgramDetails {
  program: {
    id: number;
    name: string;
    description: string | null;
    created_at: string;
    courses_count: number;
    classes_count: number;
    courses: ProgramCourse[];
    classes: ProgramClass[];
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
  description?: string;
}

export interface UpdateProgramData {
  name?: string;
  description?: string;
}

export interface CreateClassData {
  name: string;
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
