'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChapter, useDeleteChapter, useGenerateSummary } from '@/lib/hooks/useChapters';
import { useAuth } from '@/lib/hooks/useAuth';
import { ChapterHeader } from '@/components/chapters/ChapterHeader';
import { DocumentsList } from '@/components/chapters/DocumentsList';
import { ChapterSummary } from '@/components/chapters/ChapterSummary';
import { ChapterAAMatching } from '@/components/chapters/ChapterAAMatching';
import { DeleteChapterDialog } from '@/components/chapters/DeleteChapterDialog';
import { ChapterReferences } from '@/components/chapters/ChapterReferences';
import { SectionContentPanel } from '@/components/chapters/SectionContentPanel';
import { SectionActivities } from '@/components/chapters/SectionActivities';
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
    generateSummaryMutation.mutate({ id: chapterId });
  };

  const handleRegenerateSummary = () => {
    generateSummaryMutation.mutate({ id: chapterId, force: true });
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

        {/* ── Top: Summary + Chapter AA Matching (full width) ──────── */}
        <div className="space-y-6 mb-6">
          <ChapterSummary
            summary={chapter.summary}
            canGenerate={chapter.can_edit}
            onGenerate={handleGenerateSummary}
            onRegenerate={handleRegenerateSummary}
            isGenerating={generateSummaryMutation.isPending}
          />
          <ChapterAAMatching chapterId={chapterId} canEdit={chapter.can_edit} />
        </div>

        {/* ── Main grid: Left (sections + docs + refs) | Right (activities) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* 1. TN Sections (without AA per section) */}
            {tn_chapter && tn_chapter.sections.length > 0 && (
              <Card className="rounded-[24px] border-bolt-line shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Sections du chapitre</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tn_chapter.sections.map((section) => (
                      <details
                        key={section.id}
                        className="group rounded-[20px] border border-bolt-line bg-white open:shadow-sm"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                          <p className="font-semibold text-sm">
                            Section {section.index} — {section.title}
                          </p>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                        </summary>

                        <div className="border-t border-bolt-line px-4 pb-4 pt-4 space-y-3">
                          {chapter.can_edit && (
                            <Button asChild variant="outline" size="sm" className="rounded-full">
                              <Link
                                href={`/courses/${courseId}/chapters/${chapterId}/documents/new?title=${encodeURIComponent(`Section ${section.index} - ${section.title}`)}`}
                              >
                                <Upload className="mr-2 h-4 w-4" />
                                Ajouter un fichier de cours
                              </Link>
                            </Button>
                          )}
                          <SectionContentPanel
                            sectionId={section.id}
                            canEdit={chapter.can_edit}
                          />
                        </div>
                      </details>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 2. Documents */}
            <DocumentsList documents={documents} chapterId={chapterId} canEdit={chapter.can_edit} />

            {/* 3. References */}
            <ChapterReferences
              courseId={courseId}
              chapterId={chapterId}
              canEdit={chapter.can_edit}
            />
          </div>

          {/* ── RIGHT COLUMN: Activities per section ─────────────────── */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-bolt-ink px-1">Activités du chapitre</h2>

            {tn_chapter && tn_chapter.sections.length > 0 ? (
              tn_chapter.sections.map((section) => (
                <div key={section.id} className="rounded-[16px] border border-bolt-line bg-white p-4 shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Section {section.index}
                  </p>
                  <p className="text-sm font-medium text-bolt-ink leading-snug mb-3">{section.title}</p>
                  <SectionActivities
                    sectionId={section.id}
                    canEdit={chapter.can_edit}
                  />
                </div>
              ))
            ) : (
              <div className="rounded-[16px] border border-bolt-line bg-white p-6 text-center text-sm text-muted-foreground shadow-sm">
                Aucune section disponible pour ce chapitre.
              </div>
            )}
          </div>
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
