
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useClassChatInfo, useClassChatMessages, useSendClassChatMessage } from '@/lib/hooks/useClassChat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Send } from 'lucide-react';

export default function ClassChatPage() {
  const params = useParams();
  const classId = Number(params?.id);

  const { user } = useAuth();

  const infoQuery = useClassChatInfo(classId);
  const { data, isLoading } = useClassChatMessages(classId, 80);
  const sendMutation = useSendClassChatMessage(classId);

  const [content, setContent] = useState('');

  const scrollWrapRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo(() => data?.messages ?? [], [data]);

  // Auto-scroll to the latest message (best-effort for Radix ScrollArea).
  useEffect(() => {
    const root = scrollWrapRef.current;
    if (!root) return;
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length]);

  const classInfo = infoQuery.data;
  const programName = classInfo?.class?.program_name;
  const studentsCount = classInfo?.students_count;
  const classCourses = classInfo?.courses ?? [];

  async function handleSend() {
    const text = content.trim();
    if (!text || sendMutation.isPending) return;

    try {
      await sendMutation.mutateAsync(text);
      setContent('');
    } catch (e) {
      // handled by UI below
    }
  }

  if (isLoading || infoQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/classes/${classId}/dashboard`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to dashboard
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {classInfo?.class?.name ?? 'Class Chat'}
            </h1>
            <p className="text-muted-foreground">
              {programName ? <>{programName} • </> : null}
              {typeof studentsCount === 'number' ? <>{studentsCount} students • </> : null}
              {`${classCourses.length} modules`}
            </p>
            <p className="text-muted-foreground">
              Tag <span className="font-medium">@bot</span> to get a chatbot reply.
            </p>

            <p className="text-xs text-muted-foreground mt-1">
              🔒 Avoid sharing personal data (grades/scores/private info) in this class chat.
            </p>

            {classCourses.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {classCourses.slice(0, 10).map((c) => (
                  <Badge key={c.id} variant="secondary">
                    {c.title}
                  </Badge>
                ))}
                {classCourses.length > 10 ? (
                  <Badge variant="outline">+{classCourses.length - 10} more</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Card className="h-[65vh] flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3">
          <div ref={scrollWrapRef} className="flex-1 pr-3">
            <ScrollArea className="h-full">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No messages yet. Start the conversation!
                </p>
              ) : (
                messages.map((m) => {
                  const isMine = !m.is_bot && !!user?.id && m.sender?.id === user.id;
                  const align = isMine ? 'justify-end' : 'justify-start';

                  const bubbleClass = m.is_bot
                    ? 'bg-muted border'
                    : isMine
                      ? 'bg-background border'
                      : 'bg-muted/50 border';

                  return (
                    <div key={m.id} className={`flex ${align}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 ${bubbleClass}`}>
                        {/* Show sender only for non-self messages (and bot) */}
                        {!isMine ? (
                          <div className="text-xs text-muted-foreground mb-1">
                            {m.sender_name}
                          </div>
                        ) : null}
                        <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                        {m.created_at ? (
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {new Date(m.created_at).toLocaleString()}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a message... (use @bot to ask the assistant)"
              className="min-h-[90px]"
            />
            <div className="flex justify-end">
              <Button onClick={handleSend} disabled={sendMutation.isPending}>
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send
              </Button>
            </div>
            {sendMutation.isError && (
              <p className="text-sm text-red-600">
                Failed to send message. Please try again.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
