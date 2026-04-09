'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useAssistant } from '@/lib/hooks/useAssistant';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  X,
  Trash2,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import type { ChatMessage } from '@/lib/api/assistant';

export function AssistantWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    sendMessage,
    isLoading,
    isRecording,
    startRecording,
    stopRecording,
    playAudio,
    detectedLanguage,
    clearHistory,
  } = useAssistant();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-play audio for assistant messages if audio enabled
  useEffect(() => {
    if (audioEnabled && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant' && last.content) {
        playAudio(last.content, last.language || 'fr');
      }
    }
  }, [messages, audioEnabled, playAudio]);

  if (!user) return null;

  const role = user.is_superuser ? 'admin' : user.is_teacher ? 'teacher' : 'student';
  const isTunisian = detectedLanguage === 'tn';

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const widgetSize = isExpanded ? 'w-[480px] h-[640px]' : 'w-[380px] h-[520px]';

  const greetings: Record<string, string> = {
    student: `Salut ${user.username} ! 👋 Je suis ton assistant pédagogique. Je peux t'aider avec tes cours, tes notes, ton planning et te recommander des activités.`,
    teacher: `Bonjour ${user.username} ! 👋 Je suis votre assistant pédagogique. Je peux vous aider à suivre vos étudiants, détecter ceux en difficulté et proposer des activités adaptées.`,
    admin: `Bonjour ${user.username} ! 👋 Je suis l'assistant ESB. Comment puis-je vous aider ?`,
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 group"
        >
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg flex items-center justify-center hover:scale-110 transition-transform duration-200 ring-2 ring-white">
              <Image
                src={isTunisian ? '/avatar/fenek.png' : '/avatar/assistant.png'}
                alt="Assistant"
                width={36}
                height={36}
                className="rounded-full object-cover"
              />
            </div>
            {/* Pulse animation */}
            <div className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-30" />
          </div>
          <span className="absolute -top-8 right-0 bg-foreground text-background text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Assistant ESB 🦊
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`fixed bottom-6 right-6 z-50 ${widgetSize} bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Image
                src={isTunisian ? '/avatar/fenek.png' : '/avatar/assistant.png'}
                alt="Assistant"
                width={28}
                height={28}
                className="rounded-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm">
                {isTunisian ? '🦊 Fenek — Assistant ESB' : '🎓 Assistant ESB'}
              </h3>
              <p className="text-white/70 text-xs truncate">
                {role === 'teacher' ? 'Mode Enseignant' : role === 'admin' ? 'Mode Admin' : 'Mode Étudiant'}
                {detectedLanguage === 'tn' && ' • 🇹🇳 Derja'}
                {detectedLanguage === 'en' && ' • 🇬🇧 English'}
                {detectedLanguage === 'fr' && ' • 🇫🇷 Français'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className="text-white/80 hover:text-white p-1 rounded"
                title={audioEnabled ? 'Désactiver audio' : 'Activer audio'}
              >
                {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-white/80 hover:text-white p-1 rounded"
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={clearHistory}
                className="text-white/80 hover:text-white p-1 rounded"
                title="Effacer l'historique"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Welcome message */}
            {messages.length === 0 && (
              <div className="flex gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Image src="/avatar/assistant.png" alt="" width={20} height={20} className="rounded-full" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                  <p className="text-sm leading-relaxed">{greetings[role]}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {role === 'student' && (
                      <>
                        <SuggestionChip text="📊 Comment vont mes notes ?" onSelect={sendMessage} />
                        <SuggestionChip text="📅 Qu'est-ce que j'ai cette semaine ?" onSelect={sendMessage} />
                        <SuggestionChip text="💡 Recommande-moi des exercices" onSelect={sendMessage} />
                      </>
                    )}
                    {role === 'teacher' && (
                      <>
                        <SuggestionChip text="⚠️ Quels étudiants sont en difficulté ?" onSelect={sendMessage} />
                        <SuggestionChip text="📊 Résumé des performances" onSelect={sendMessage} />
                        <SuggestionChip text="📝 Propose un quiz adapté" onSelect={sendMessage} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Chat messages */}
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                isTunisian={msg.language === 'tn'}
                onPlayAudio={audioEnabled ? () => playAudio(msg.content, msg.language || 'fr') : undefined}
              />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Image src={isTunisian ? '/avatar/fenek.png' : '/avatar/assistant.png'} alt="" width={20} height={20} className="rounded-full" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t p-3 bg-muted/30">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isRecording
                    ? '🎤 Enregistrement en cours...'
                    : 'Écrivez votre message...'
                }
                className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[40px] max-h-[100px]"
                rows={1}
                disabled={isRecording}
              />
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-2.5 rounded-xl transition-colors ${
                  isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-muted hover:bg-muted-foreground/10'
                }`}
                title={isRecording ? 'Arrêter' : 'Parler'}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-2.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  message,
  isTunisian,
  onPlayAudio,
}: {
  message: ChatMessage;
  isTunisian: boolean;
  onPlayAudio?: () => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <Image
            src={isTunisian ? '/avatar/fenek.png' : '/avatar/assistant.png'}
            alt=""
            width={20}
            height={20}
            className="rounded-full"
          />
        </div>
      )}
      <div className={`max-w-[80%] ${isUser ? 'ml-auto' : ''}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-amber-500 text-white rounded-tr-sm'
              : 'bg-muted rounded-tl-sm'
          }`}
        >
          {message.content}
        </div>
        <div className={`flex items-center gap-2 mt-0.5 ${isUser ? 'justify-end' : ''}`}>
          {message.timestamp && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(message.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {!isUser && message.tools_used && message.tools_used.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0">
              🔧 {message.tools_used.length} outil{message.tools_used.length > 1 ? 's' : ''}
            </Badge>
          )}
          {!isUser && onPlayAudio && (
            <button onClick={onPlayAudio} className="text-muted-foreground hover:text-foreground">
              <Volume2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestionChip({ text, onSelect }: { text: string; onSelect: (t: string) => void }) {
  return (
    <button
      onClick={() => onSelect(text)}
      className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1 transition-colors"
    >
      {text}
    </button>
  );
}
