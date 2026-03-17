'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useChapter } from '@/lib/hooks/useChapters';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { ChatPageLayout } from '@/components/chat/ChatPageLayout';
import { DocumentSelector } from '@/components/chat/DocumentSelector';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ArrowLeft, MessageSquare, FileText } from 'lucide-react';

const PdfViewerPanel = dynamic(
  () => import('@/components/chat/PdfViewerPanel').then((mod) => mod.PdfViewerPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg p-8">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-sm text-gray-600">Loading PDF viewer...</span>
        </div>
      </div>
    ),
  }
);

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const chapterId = parseInt(params.chapterId as string);
  const courseId = parseInt(params.id as string);

  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const { data, isLoading, error } = useChapter(chapterId);

  useEffect(() => {
    const docId = searchParams.get('doc');
    if (docId) {
      setSelectedDocumentId(parseInt(docId));
    } else {
      setSelectedDocumentId(null);
    }
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="w-full px-4 py-6">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="mb-6 h-12 w-full" />
        <div className="grid gap-4 lg:grid-cols-1">
          <Skeleton className="h-[760px]" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Chapter not found"
          description="The chapter you're looking for doesn't exist or you don't have access to it."
          icon={<FileText className="h-12 w-12" />}
        />
      </div>
    );
  }

  const { chapter, course, documents } = data;
  const mode = selectedDocumentId ? 'document' : 'chapter';
  const selectedDocument = selectedDocumentId
    ? documents.find((doc) => doc.id === selectedDocumentId)
    : null;

  return (
    <div className="w-full px-4 py-5">
      <div className="mb-4 lg:mb-5">
        <Breadcrumbs
          items={[
            { label: 'Courses', href: '/courses' },
            { label: course.title, href: `/courses/${courseId}` },
            { label: chapter.title, href: `/courses/${courseId}/chapters/${chapterId}` },
            { label: 'Chat' },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/courses/${courseId}/chapters/${chapterId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold lg:text-3xl">Adaptive Chat · {chapter.title}</h1>
            </div>
            <Badge variant={selectedDocumentId ? 'default' : 'outline'} className="text-xs">
              {selectedDocumentId && selectedDocument
                ? `Document: ${selectedDocument.title}`
                : `Tous les documents du chapitre (${documents.length})`}
            </Badge>
          </div>
        </div>

        {documents.length > 0 && (
          <DocumentSelector
            documents={documents}
            selectedDocumentId={selectedDocumentId}
            onDocumentChange={setSelectedDocumentId}
            chapterId={chapterId}
            courseId={courseId}
          />
        )}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents available"
          description="Upload documents to this chapter before using the chatbot."
          icon={<FileText className="h-12 w-12" />}
        />
      ) : (
        <ChatPageLayout
          leftPanel={<PdfViewerPanel documentId={selectedDocumentId} courseId={courseId} />}
          rightPanel={
            <ChatPanel
              mode={mode}
              documentId={selectedDocumentId || undefined}
              chapterId={chapterId}
              title={selectedDocument?.title || chapter.title}
            />
          }
        />
      )}
    </div>
  );
}
