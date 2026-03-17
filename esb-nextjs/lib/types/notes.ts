export interface Note {
  id: number;
  user_id: number;
  document_id: number;
  content: string | null;
  image_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteData {
  document_id: number;
  content?: string;
  image?: File;
}

export interface UpdateNoteData {
  content?: string;
  image?: File;
}
