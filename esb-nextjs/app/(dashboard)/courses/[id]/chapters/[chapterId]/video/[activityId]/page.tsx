'use client';

import { useParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Youtube, AlertCircle, Loader2 } from 'lucide-react';
import { sectionActivitiesApi } from '@/lib/api/references';
import { useChapter } from '@/lib/hooks/useChapters';

export default function VideoViewerPage() {
  const params = useParams();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);
  const activityId = parseInt(params.activityId as string);

  const { data: chapterData, isLoading: chapterLoading } = useChapter(chapterId);

  // Fetch activities from all sections to find the one we want
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

  if (!activity || !activity.youtube_embed_id) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
        <p className="text-muted-foreground mb-4">Vidéo introuvable.</p>
        <Link href={backHref} className="text-blue-600 hover:underline text-sm">
          ← Retour au chapitre
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Back navigation */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-bolt-ink mb-6 no-underline transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au chapitre
      </Link>

      {/* Video card */}
      <div className="rounded-2xl border border-bolt-line bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-bolt-line">
          <div className="h-9 w-9 rounded-xl bg-red-100 flex items-center justify-center">
            <Youtube className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="font-bold text-bolt-ink leading-tight">
              {activity.title || 'Vidéo'}
            </h1>
            {chapterData?.chapter && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {chapterData.chapter.title}
              </p>
            )}
          </div>
        </div>

        {/* YouTube embed */}
        <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={`https://www.youtube.com/embed/${activity.youtube_embed_id}?rel=0&modestbranding=1`}
            title={activity.title || 'Vidéo'}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Transcript status */}
        {activity.transcript_status && (
          <div className="px-6 py-3 bg-gray-50 border-t border-bolt-line">
            {activity.transcript_status === 'indexed' && (
              <span className="text-xs text-emerald-700 font-medium">
                ✓ Disponible dans le chatbot pédagogique
              </span>
            )}
            {activity.transcript_status === 'indexing' && (
              <span className="text-xs text-yellow-700 font-medium flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Analyse de la vidéo en cours…
              </span>
            )}
            {activity.transcript_status === 'failed' && (
              <span className="text-xs text-red-600 font-medium">
                ✗ Analyse indisponible (vidéo sans sous-titres publics)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
