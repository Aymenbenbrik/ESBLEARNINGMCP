'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useChapter } from '@/lib/hooks/useChapters';
import { SectionAssignmentTaker } from '@/components/chapters/SectionAssignmentTaker';
import { SectionAssignmentManager } from '@/components/chapters/SectionAssignmentManager';

export default function AssignmentPage() {
  const params = useParams();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);
  const sectionId = parseInt(params.sectionId as string);

  const { user } = useAuth();
  const { data: chapterData, isLoading } = useChapter(chapterId);

  const backHref = `/courses/${courseId}/chapters/${chapterId}`;
  const isTeacher = user?.is_teacher ?? false;

  return (
    <div className="max-w-3xl mx-auto py-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-bolt-ink mb-6 no-underline transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au chapitre
      </Link>

      <div className="rounded-2xl border border-blue-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-blue-100 bg-blue-50/40">
          <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <h1 className="font-bold text-bolt-ink leading-tight">
              Devoir à Rendre
            </h1>
            {isLoading ? (
              <div className="h-3 w-32 bg-gray-200 animate-pulse rounded mt-1" />
            ) : chapterData?.chapter ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Consolidation des Acquis — {chapterData.chapter.title}
              </p>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {isTeacher ? (
            <SectionAssignmentManager sectionId={sectionId} />
          ) : (
            <SectionAssignmentTaker sectionId={sectionId} />
          )}
        </div>
      </div>
    </div>
  );
}
