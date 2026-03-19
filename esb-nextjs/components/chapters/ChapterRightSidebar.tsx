'use client';

import { useChapterDeadlines, useActivityProgress } from '@/lib/hooks/useChapters';
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Props {
  chapterId: number;
}

export function ChapterRightSidebar({ chapterId }: Props) {
  const { data: deadlinesData } = useChapterDeadlines(chapterId);
  const { data: progressData } = useActivityProgress(chapterId);
  const deadlines = deadlinesData?.deadlines ?? [];
  const completed = progressData?.completed ?? [];

  return (
    <div className="space-y-4">
      {/* Upcoming deadlines */}
      <div className="rounded-[16px] border border-bolt-line bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-amber-500" />
          <p className="text-xs font-semibold text-bolt-ink uppercase tracking-wide">Échéances</p>
        </div>
        {deadlines.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune échéance à venir.</p>
        ) : (
          <div className="space-y-2">
            {deadlines.map((d, i) => (
              <div
                key={i}
                className={`rounded-[12px] border p-2.5 text-xs ${
                  d.completed
                    ? 'border-green-200 bg-green-50'
                    : d.seconds_remaining < 86400
                    ? 'border-red-200 bg-red-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <p className="font-medium text-bolt-ink leading-snug">{d.title}</p>
                    <p className="text-muted-foreground mt-0.5">{d.section_title}</p>
                  </div>
                  {d.completed && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                  )}
                  {!d.completed && d.seconds_remaining < 86400 && (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                  )}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {d.type === 'quiz' ? '📝 Quiz' : '📋 Devoir'} —{' '}
                  {formatDistanceToNow(new Date(d.deadline), { addSuffix: true, locale: fr })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed activities */}
      <div className="rounded-[16px] border border-bolt-line bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <p className="text-xs font-semibold text-bolt-ink uppercase tracking-wide">Activités faites</p>
        </div>
        {completed.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune activité complétée.</p>
        ) : (
          <div className="space-y-2">
            {completed.slice(0, 10).map((c, i) => (
              <div key={i} className="rounded-[10px] border border-bolt-line bg-bolt-surface p-2 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-bolt-ink">{c.title}</p>
                  {c.type === 'quiz' && c.score != null && (
                    <span className="text-[10px] font-semibold text-blue-600">
                      {c.score.toFixed(1)}/{c.max_score}
                    </span>
                  )}
                  {c.type === 'assignment' && c.grade != null && (
                    <span className="text-[10px] font-semibold text-green-600">{c.grade}/20</span>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5">{c.section_title}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
