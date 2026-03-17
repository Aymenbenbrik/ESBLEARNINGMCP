import apiClient from './client';
import {
  ClassChatMessagesResponse,
  ClassChatInfoResponse,
  MyClassesResponse,
  PostClassChatMessageResponse,
} from '@/lib/types/class-chat';

export const classChatApi = {
  getMyClasses: async () => {
    const res = await apiClient.get<MyClassesResponse>('/api/v1/class-chat/my');
    return res.data;
  },

  getMessages: async (classId: number, limit: number = 50) => {
    const res = await apiClient.get<ClassChatMessagesResponse>(
      `/api/v1/class-chat/${classId}/messages`,
      { params: { limit } }
    );
    return res.data;
  },

  getInfo: async (classId: number) => {
    const res = await apiClient.get<ClassChatInfoResponse>(
      `/api/v1/class-chat/${classId}/info`
    );
    return res.data;
  },

  postMessage: async (classId: number, content: string) => {
    const res = await apiClient.post<PostClassChatMessageResponse>(
      `/api/v1/class-chat/${classId}/messages`,
      { content }
    );
    return res.data;
  },
};
