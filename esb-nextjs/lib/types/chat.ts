export interface ChatMessage {
  id: number;
  content: string;
  is_user: boolean;
  timestamp: string;
}

export interface Citation {
  section: string;
  page: string;
  content?: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  message_id: number;
  citations: Citation[];
  tool_usage: string[];
}

export interface SendMessageData {
  message: string;
}

export interface ChatHistory {
  messages: ChatMessage[];
  session_id: number;
}
