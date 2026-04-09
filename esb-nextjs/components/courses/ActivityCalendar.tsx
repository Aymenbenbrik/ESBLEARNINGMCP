'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCalendarActivities } from '@/lib/hooks/useCalendar';
import type { ActivityType, CalendarActivity } from '@/lib/api/calendar';
import {
  CalendarDays,
  BookOpen,
  FileText,
  ClipboardCheck,
  Users,
  RotateCcw,
  Loader2,
} from 'lucide-react';

const TYPE_CONFIG: Record<ActivityType, { label: string; color: string; icon: typeof BookOpen }> = {
  quiz: { label: 'Quiz', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: BookOpen },
  exam: { label: 'Examen', color: 'bg-red-100 text-red-700 border-red-200', icon: FileText },
  assignment: { label: 'Devoir', color: 'bg-green-100 text-green-700 border-green-200', icon: ClipboardCheck },
  attendance: { label: 'Séance', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Users },
  revision: { label: 'Révision', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: RotateCcw },
};

function getWeekDays(): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  // Start from Monday (1) — if Sunday (0), go back 6 days
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0];
}

export function ActivityCalendar() {
  const { data, isLoading } = useCalendarActivities();

  const weekDays = useMemo(() => getWeekDays(), []);

  const grouped = useMemo(() => {
    if (!data?.activities) return new Map<string, CalendarActivity[]>();
    const map = new Map<string, CalendarActivity[]>();
    for (const day of weekDays) {
      map.set(day, []);
    }
    for (const act of data.activities) {
      if (act.date && map.has(act.date)) {
        map.get(act.date)!.push(act);
      }
    }
    return map;
  }, [data, weekDays]);

  if (isLoading) {
    return (
      <Card className="rounded-[24px] border-slate-200 shadow-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  const hasActivities = data?.activities && data.activities.some((a) => weekDays.includes(a.date));

  return (
    <Card className="rounded-[24px] border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <CalendarDays className="h-5 w-5 text-red-500" />
          Calendrier de la semaine
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasActivities ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Aucune activité prévue cette semaine.
          </p>
        ) : (
          <div className="space-y-3">
            {weekDays.map((day, idx) => {
              const acts = grouped.get(day) || [];
              if (acts.length === 0) return null;
              const today = isToday(day);
              return (
                <div key={day}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        today ? 'text-red-600' : 'text-slate-400'
                      }`}
                    >
                      {DAY_NAMES[idx]}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(day)}</span>
                    {today && (
                      <Badge variant="secondary" className="rounded-full bg-red-50 px-2 py-0 text-[10px] text-red-600">
                        Aujourd&apos;hui
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5 pl-2">
                    {acts.map((act) => {
                      const config = TYPE_CONFIG[act.type] || TYPE_CONFIG.quiz;
                      const Icon = config.icon;
                      return (
                        <div
                          key={act.id}
                          className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            <Icon className="h-4 w-4 text-slate-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-slate-900">
                                {act.title}
                              </span>
                              <Badge
                                variant="outline"
                                className={`flex-shrink-0 rounded-full border px-2 py-0 text-[10px] font-medium ${config.color}`}
                              >
                                {config.label}
                              </Badge>
                            </div>
                            {act.course_title && (
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {act.course_title}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
