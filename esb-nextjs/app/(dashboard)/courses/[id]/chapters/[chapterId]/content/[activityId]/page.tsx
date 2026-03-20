'use client';

import { useParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, FileText, Image as ImageIcon, File, AlertCircle, Loader2 } from 'lucide-react';
import { sectionActivitiesApi } from '@/lib/api/references';
import { useChapter } from '@/lib/hooks/useChapters';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ContentViewerPage() {
  const params = useParams();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);
  const activityId = parseInt(params.activityId as string);

  const { data: chapterData, isLoading: chapterLoading } = useChapter(chapterId);

  const sectionIds = chapterData?.tn_chapter?.sections?.map((s: any) => s.id) ?? [];

  const activityQueries = useQueries({
    queries: sectionIds.map((id: number) => ({
      queryKey: ['section-activities', id],
      queryFn: () => sectionActivitiesApi.list(id),
      enabled: !!id,
    })),
  });

  const allActivities = activityQueries.flatMap((q) => q.data ?? []);
  const activity = allActivities.find((a) => a.id === activityId);
  const isLoading = chapterLoading || activityQueries.some((q) => q.isLoading);

  const backHref = `/courses/${courseId}/chapters/${chapterId}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
        <p className="text-muted-foreground mb-4">Contenu introuvable.</p>
        <Link href={backHref} className="text-rose-800 hover:underline text-sm">← Retour au chapitre</Link>
      </div>
    );
  }

  const iconMap = {
    text_doc: <FileText className="h-5 w-5 text-rose-800" />,
    image: <ImageIcon className="h-5 w-5 text-amber-600" />,
    pdf_extract: <File className="h-5 w-5 text-rose-700" />,
  };

  const bgMap = {
    text_doc: 'bg-rose-100',
    image: 'bg-amber-100',
    pdf_extract: 'bg-rose-100',
  };

  const icon = iconMap[activity.activity_type as keyof typeof iconMap] ?? <FileText className="h-5 w-5 text-gray-500" />;
  const bg = bgMap[activity.activity_type as keyof typeof bgMap] ?? 'bg-gray-100';

  return (
    <div className="max-w-4xl mx-auto py-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-bolt-ink mb-6 no-underline transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au chapitre
      </Link>

      <div className="rounded-2xl border border-bolt-line bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-bolt-line">
          <div className={`h-9 w-9 rounded-xl ${bg} flex items-center justify-center`}>
            {icon}
          </div>
          <div>
            <h1 className="font-bold text-bolt-ink leading-tight">
              {activity.title || 'Document'}
            </h1>
            {chapterData?.chapter && (
              <p className="text-xs text-muted-foreground mt-0.5">
                🔬 Activité Pratique — {chapterData.chapter.title}
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8">
          {/* Text doc: Markdown render */}
          {activity.activity_type === 'text_doc' && (
            <article className="prose prose-sm max-w-none text-bolt-ink">
              <ReactMarkdown>{activity.content || '*Aucun contenu*'}</ReactMarkdown>
            </article>
          )}

          {/* Image */}
          {activity.activity_type === 'image' && activity.image_url && (
            <div className="flex justify-center">
              <img
                src={`${API_URL}${activity.image_url}`}
                alt={activity.title || 'Image'}
                className="max-w-full rounded-xl border border-bolt-line shadow-sm"
              />
            </div>
          )}

          {/* PDF extract */}
          {activity.activity_type === 'pdf_extract' && (
            <div className="rounded-xl border border-bolt-line bg-gray-50 p-6 text-center">
              <File className="h-12 w-12 mx-auto mb-3 text-rose-700/40" />
              <p className="text-sm font-medium text-bolt-ink mb-1">{activity.title}</p>
              {activity.pdf_page_start && activity.pdf_page_end && (
                <p className="text-xs text-muted-foreground">
                  Pages {activity.pdf_page_start} — {activity.pdf_page_end}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
