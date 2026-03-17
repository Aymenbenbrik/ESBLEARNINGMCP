'use client';

import { useState, useEffect, useRef } from 'react';
import {
  useChatHistory,
  useSendMessage,
  useClearChat,
  useChapterChatHistory,
  useSendChapterMessage,
  useClearChapterChat,
} from '@/lib/hooks/useChat';
import { ChatMessage as ChatMessageType } from '@/lib/types/chat';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'document' | 'chapter';
  documentId?: number;
  chapterId?: number;
  title: string;
}

export function ChatDialog({
  open,
  onOpenChange,
  mode,
  documentId,
  chapterId,
  title,
}: ChatDialogProps) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Select appropriate hooks based on mode
  const { data: documentHistory, refetch: refetchDocument } = useChatHistory(documentId || 0);
  const { data: chapterHistory, refetch: refetchChapter } = useChapterChatHistory(chapterId || 0);
  const sendDocumentMessage = useSendMessage();
  const sendChapterMessage = useSendChapterMessage();
  const clearDocumentChat = useClearChat();
  const clearChapterChat = useClearChapterChat();

  const history = mode === 'document' ? documentHistory : chapterHistory;
  const messages = history?.messages || [];

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Refetch history when dialog opens
  useEffect(() => {
    if (open) {
      if (mode === 'document') {
        refetchDocument();
      } else {
        refetchChapter();
      }
    }
  }, [open, mode, refetchDocument, refetchChapter]);

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
          },
        }
      );
    } else if (mode === 'chapter' && chapterId) {
      sendChapterMessage.mutate(
        { chapterId, data: { message: messageText } },
        {
          onSuccess: () => {
            refetchChapter();
          },
        }
      );
    }
  };

  const handleClear = () => {
    const confirm = window.confirm('Are you sure you want to clear the chat history?');
    if (!confirm) return;

    if (mode === 'document' && documentId) {
      clearDocumentChat.mutate(documentId, {
        onSuccess: () => {
          refetchDocument();
        },
      });
    } else if (mode === 'chapter' && chapterId) {
      clearChapterChat.mutate(chapterId, {
        onSuccess: () => {
          refetchChapter();
        },
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSending = sendDocumentMessage.isPending || sendChapterMessage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DialogTitle>Chat about {title}</DialogTitle>
              <DialogDescription>
                {mode === 'chapter'
                  ? 'Ask questions about all documents in this chapter'
                  : 'Ask questions about this document'}
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Messages Area */}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>No messages yet. Start a conversation!</p>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))
            )}

            {isSending && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">AI is thinking...</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t pt-4">
          <div className="flex gap-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message here... (Shift+Enter for new line)"
              className="flex-1 resize-none"
              rows={3}
              disabled={isSending}
            />
            <Button onClick={handleSend} disabled={!message.trim() || isSending} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Individual Message Component
function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.is_user;

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        }`}
      >
        {isUser ? 'You' : 'AI'}
      </div>

      {/* Message Content */}
      <div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block rounded-lg px-4 py-3 ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {/* Render markdown */}
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>

        {/* Timestamp */}
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
