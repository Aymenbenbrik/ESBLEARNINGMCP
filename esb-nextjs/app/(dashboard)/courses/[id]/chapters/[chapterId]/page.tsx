'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChapter, useDeleteChapter, useGenerateSummary } from '@/lib/hooks/useChapters';
import { useAuth } from '@/lib/hooks/useAuth';
import { ChapterHeader } from '@/components/chapters/ChapterHeader';
import { DocumentsList } from '@/components/chapters/DocumentsList';
import { ChapterSummary } from '@/components/chapters/ChapterSummary';
import { DeleteChapterDialog } from '@/components/chapters/DeleteChapterDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, MessageSquare, ClipboardList, Users, ChevronRight, Upload } from 'lucide-react';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ChapterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = parseInt(params.chapterId as string);
  const courseId = parseInt(params.id as string);
  const { data, isLoading, error } = useChapter(chapterId);
  const { user } = useAuth();
  const deleteMutation = useDeleteChapter();
  const generateSummaryMutation = useGenerateSummary();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = () => {
    deleteMutation.mutate(chapterId, {
      onSuccess: () => {
        router.push(`/courses/${courseId}`);
      },
    });
  };

  const handleGenerateSummary = () => {
    generateSummaryMutation.mutate(chapterId);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-64 mb-6" />
        <Skeleton className="h-96" />
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

  const { chapter, course, documents, tn_chapter } = data;

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: 'Courses', href: '/courses' },
            { label: course.title, href: `/courses/${courseId}` },
            { label: chapter.title },
          ]}
        />

        <ChapterHeader
          chapter={chapter}
          course={course}
          onDelete={chapter.can_edit ? () => setShowDeleteDialog(true) : undefined}
          onGenerateSummary={chapter.can_edit ? handleGenerateSummary : undefined}
          isGeneratingSummary={generateSummaryMutation.isPending}
        />

        {user && (
          <div className="mb-6 flex flex-wrap gap-3">
            <Button asChild variant="default" size="lg" className="rounded-2xl">
              <Link href={`/courses/${courseId}/chapters/${chapterId}/quiz/setup`}>
                <ClipboardList className="mr-2 h-5 w-5" />
                Quiz
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="rounded-2xl">
              <Link href={`/courses/${courseId}/chapters/${chapterId}/chat`}>
                <MessageSquare className="mr-2 h-5 w-5" />
                Chatbot
              </Link>
            </Button>
            {(user?.is_teacher || user?.is_superuser) && (
              <Button asChild variant="outline" size="lg" className="rounded-2xl">
                <Link href={`/courses/${courseId}/chapters/${chapterId}/quiz/submissions`}>
                  <Users className="mr-2 h-5 w-5" />
                  Quiz Submissions
                </Link>
              </Button>
            )}
          </div>
        )}

        <div className="space-y-6">
          <ChapterSummary
            summary={chapter.summary}
            canGenerate={chapter.can_edit}
            onGenerate={handleGenerateSummary}
            isGenerating={generateSummaryMutation.isPending}
          />

          <DocumentsList documents={documents} chapterId={chapterId} canEdit={chapter.can_edit} />

          {tn_chapter && tn_chapter.sections.length > 0 && (
            <Card className="rounded-[24px] border-bolt-line shadow-sm">
              <CardHeader>
                <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <span>TN sections · affichage minimal & moderne</span>
                  <div className="flex flex-wrap gap-2">
                    {(tn_chapter.aaa || []).slice(0, 6).map((a) => (
                      <span
                        key={a.label}
                        title={a.description || a.label}
                        className="rounded-full bg-bolt-accent/10 px-2.5 py-1 text-xs font-semibold text-bolt-accent"
                      >
                        {a.label}
                      </span>
                    ))}
                    {(tn_chapter.aap || []).slice(0, 6).map((a) => (
                      <span
                        key={a.label}
                        title={a.description || a.label}
                        className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tn_chapter.sections.map((section) => (
                    <details
                      key={section.id}
                      className="group rounded-[20px] border border-bolt-line bg-white open:shadow-sm"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                        <div>
                          <p className="font-semibold">
                            Section {section.index}: {section.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {section.aaa && section.aaa.length > 0
                              ? `${section.aaa.slice(0, 8).map((x) => x.label).join(' • ')}${section.aaa.length > 8 ? ' …' : ''}`
                              : 'No AAA mapping found for this section.'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-bolt-ink/5 px-2 py-1 text-xs font-semibold text-bolt-muted">
                            {(section.aaa || []).length} AAA
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                        </div>
                      </summary>

                      <div className="border-t border-bolt-line px-4 pb-4 pt-4">
                        {(section.aaa && section.aaa.length > 0) ? (
                          <div className="mb-4 flex flex-wrap gap-2">
                            {section.aaa.map((a) => (
                              <span
                                key={a.label}
                                title={a.description || a.label}
                                className="rounded-full bg-bolt-accent/10 px-2.5 py-1 text-xs font-semibold text-bolt-accent"
                              >
                                {a.label}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {chapter.can_edit ? (
                          <Button asChild variant="outline" size="sm" className="rounded-full">
                            <Link
                              href={`/courses/${courseId}/chapters/${chapterId}/documents/new?title=${encodeURIComponent(`Section ${section.index} - ${section.title}`)}`}
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Ajouter un fichier de cours
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </details>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <DeleteChapterDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        chapterId={chapterId}
        chapterName={chapter.title}
        onDelete={handleDelete}
      />
    </>
  );
}
