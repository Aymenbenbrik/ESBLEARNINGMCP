export interface ClassChatClassSummary {
  id: number;
  name: string;
  program_id?: number | null;
  program_name?: string | null;
  students_count: number;
  courses_count: number;
}

export interface MyClassesResponse {
  classes: ClassChatClassSummary[];
}

export interface ClassChatMessage {
  id: number;
  room_id: number;
  class_id: number;
  content: string;
  is_bot: boolean;
  created_at: string;
  sender_name: string;
  sender?: {
    id: number;
    username: string;
  } | null;
}

export interface ClassChatMessagesResponse {
  room: {
    id: number;
    class_id: number;
  };
  messages: ClassChatMessage[];
}

export interface PostClassChatMessageResponse {
  message: ClassChatMessage;
  bot_message?: ClassChatMessage | null;
}

export interface ClassChatInfoCourse {
  id: number;
  title: string;
  description?: string | null;
}

export interface ClassChatInfoUser {
  id: number;
  username: string;
  is_teacher: boolean;
  is_superuser: boolean;
}

export interface ClassChatInfoTeacher {
  id: number;
  username: string;
}

export interface ClassChatInfoStudent {
  id: number;
  username: string;
}

export interface ClassChatInfoResponse {
  room: {
    id: number;
    class_id: number;
  };
  class: {
    id: number;
    name: string;
    academic_year?: string | null;
    program_id?: number | null;
    program_name?: string | null;
  };
  courses: ClassChatInfoCourse[];
  teachers: ClassChatInfoTeacher[];
  students_count: number;
  students: ClassChatInfoStudent[];
  current_user: ClassChatInfoUser;
  current_user_courses: Pick<ClassChatInfoCourse, 'id' | 'title'>[];
}
