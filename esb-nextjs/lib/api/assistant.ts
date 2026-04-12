import { apiClient } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  /** Backend (Gemini) may return structured content instead of a plain string */
  content: string | unknown;
  timestamp?: string;
  language?: string;
  tools_used?: string[];
  tunbert_intents?: { intent: string; confidence: number; description_fr: string }[];
}

export interface ChatResponse {
  /** Backend (Gemini) may return structured content instead of a plain string */
  response: string | unknown;
  language: string;
  tools_used: string[];
  tunbert_intents?: { intent: string; confidence: number; description_fr: string }[];
}

const BASE = '/api/v1/assistant';

export const assistantApi = {
  chat: async (message: string, history: ChatMessage[]): Promise<ChatResponse> => {
    const { data } = await apiClient.post<ChatResponse>(`${BASE}/chat`, {
      message,
      history: history.map(m => ({ role: m.role, content: m.content })),
    });
    return data;
  },

  textToSpeech: async (text: string, language: string): Promise<Blob> => {
    const response = await apiClient.post(`${BASE}/tts`, { text, language }, {
      responseType: 'blob',
    });
    return response.data;
  },

  speechToText: async (audioBlob: Blob): Promise<{ text: string; language: string }> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    const { data } = await apiClient.post<{ text: string; language: string }>(
      `${BASE}/stt`,
      formData,
      { headers: { 'Content-Type': undefined as any } }
    );
    return data;
  },
};
