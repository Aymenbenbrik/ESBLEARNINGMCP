import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { assistantApi, ChatMessage, ChatResponse } from '../api/assistant';

export function useAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string>('fr');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const chatMutation = useMutation<ChatResponse, Error, string>({
    mutationFn: (message) => assistantApi.chat(message, messages),
    onSuccess: (data) => {
      setDetectedLanguage(data.language);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
        language: data.language,
        tools_used: data.tools_used,
      }]);
    },
  });

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, {
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    }]);
    chatMutation.mutate(text.trim());
  }, [chatMutation, messages]);

  const playAudio = useCallback(async (text: string, language: string) => {
    try {
      const blob = await assistantApi.textToSpeech(text, language);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    } catch (e) {
      console.error('TTS error:', e);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          const result = await assistantApi.speechToText(blob);
          if (result.text) {
            sendMessage(result.text);
          }
        } catch (e) {
          console.error('STT error:', e);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error('Mic error:', e);
    }
  }, [sendMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading: chatMutation.isPending,
    isRecording,
    startRecording,
    stopRecording,
    playAudio,
    detectedLanguage,
    clearHistory,
  };
}
