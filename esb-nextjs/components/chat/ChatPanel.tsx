'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  useChatHistory,
  useSendMessage,
  useClearChat,
  useChapterChatHistory,
  useSendChapterMessage,
  useClearChapterChat,
} from '@/lib/hooks/useChat';
import { ChatMessage as ChatMessageType } from '@/lib/types/chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Trash2, History, Sparkles, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';

interface ChatPanelProps {
  mode: 'document' | 'chapter';
  documentId?: number;
  chapterId?: number;
  title: string;
  onHistoryClick?: () => void;
}

const QUICK_PROMPTS = [
  'Explique ce concept simplement',
  'Donne-moi un exemple guidé',
  'Pose-moi 3 questions de révision',
  'Résume cette partie étape par étape',
];

export function ChatPanel({
  mode,
  documentId,
  chapterId,
  title,
  onHistoryClick,
}: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: documentHistory, refetch: refetchDocument } = useChatHistory(documentId || 0);
  const { data: chapterHistory, refetch: refetchChapter } = useChapterChatHistory(chapterId || 0);
  const sendDocumentMessage = useSendMessage();
  const sendChapterMessage = useSendChapterMessage();
  const clearDocumentChat = useClearChat();
  const clearChapterChat = useClearChapterChat();

  const history = mode === 'document' ? documentHistory : chapterHistory;
  const messages = history?.messages || [];
  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((msg) => !msg.is_user),
    [messages]
  );

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    scrollToBottom(messages.length > 2 ? 'smooth' : 'auto');
  }, [messages.length]);

  useEffect(() => {
    if (mode === 'document' && documentId) {
      refetchDocument();
    } else if (mode === 'chapter' && chapterId) {
      refetchChapter();
    }
  }, [mode, documentId, chapterId, refetchDocument, refetchChapter]);

  const handleSend = async () => {
    if (!message.trim()) return;

    const messageText = message.trim();
    setMessage('');

    if (mode === 'document' && documentId) {
      sendDocumentMessage.mutate(
        { documentId, data: { message: messageText } },
        {
          onSuccess: () => {
            refetchDocument();
            requestAnimationFrame(() => scrollToBottom('smooth'));
          },
        }
      );
    } else if (mode === 'chapter' && chapterId) {
      sendChapterMessage.mutate(
        { chapterId, data: { message: messageText } },
        {
          onSuccess: () => {
            refetchChapter();
            requestAnimationFrame(() => scrollToBottom('smooth'));
          },
        }
      );
    }
  };

  const handleClear = () => {
    const confirmed = window.confirm('Are you sure you want to clear the chat history?');
    if (!confirmed) return;

    if (mode === 'document' && documentId) {
      clearDocumentChat.mutate(documentId, { onSuccess: () => refetchDocument() });
    } else if (mode === 'chapter' && chapterId) {
      clearChapterChat.mutate(chapterId, { onSuccess: () => refetchChapter() });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const threshold = 96;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsNearBottom(distanceFromBottom < threshold);
  };

  const applyQuickPrompt = (prompt: string) => {
    setMessage(prompt);
  };

  const isSending = sendDocumentMessage.isPending || sendChapterMessage.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b bg-background/95 px-5 py-5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-base text-foreground">Adaptive tutor · {title}</h3>
              <Badge variant="secondary" className="hidden sm:inline-flex">Context kept</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'chapter'
                ? 'Le tuteur utilise tous les documents du chapitre et garde le contexte de la conversation.'
                : 'Le tuteur s’appuie sur ce document, répond étape par étape et adapte ses explications.'}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {onHistoryClick && (
              <Button variant="ghost" size="icon" onClick={onHistoryClick} title="View History">
                <History className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleClear} title="Clear Chat">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => applyQuickPrompt(prompt)}
              className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground transition hover:bg-muted"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 bg-muted/20">
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-5 py-5 scroll-smooth"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-8">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-background p-6 text-center shadow-sm">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="font-medium text-foreground">Commence une vraie conversation avec ton tuteur</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Demande une explication, un exemple, un quiz rapide ou une correction guidée.
                </p>
              </div>
            ) : (
              messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
            )}

            {isSending && (
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="rounded-2xl border bg-background px-4 py-3 shadow-sm">
                  <p className="text-sm text-muted-foreground">Le tuteur prépare une réponse adaptée…</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {!isNearBottom && messages.length > 1 && (
          <Button
            type="button"
            size="sm"
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-5 right-5 rounded-full shadow-lg"
          >
            <ChevronDown className="mr-1 h-4 w-4" />
            Dernier message
          </Button>
        )}
      </div>

      <div className="border-t bg-background px-5 py-5">
        {lastAssistantMessage && (
          <div className="mb-3 rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Mémoire active :</span> le tuteur garde le fil de la discussion pour continuer l’explication.
          </div>
        )}
        <div className="flex items-end gap-3">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pose une question, demande un exemple, ou écris où tu bloques…"
            className="max-h-52 min-h-[120px] flex-1 resize-none rounded-2xl border-border/70 bg-background text-base"
            rows={5}
            disabled={isSending}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            size="icon"
            className="h-12 w-12 rounded-2xl"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Entrée pour envoyer · Shift+Entrée pour une nouvelle ligne
        </p>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.is_user;

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {isUser ? 'You' : 'AI'}
      </div>

      <div className={`min-w-0 flex-1 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block max-w-[96%] rounded-2xl px-5 py-4 text-left shadow-sm ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'border bg-background text-foreground'
          }`}
        >
          <div className={`prose prose-sm sm:prose-base max-w-none break-words leading-7 ${isUser ? 'prose-invert' : ''}`}>
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex]}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        <p className="mt-1 px-1 text-xs text-muted-foreground">
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
        </p>
      </div>
    </div>
  );
}
