'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useStudentDashboard } from '@/lib/hooks/useDashboards';
import { useMyProgress } from '@/lib/hooks/useProgress';
import { useCalendarActivities } from '@/lib/hooks/useCalendar';
import { useCoachAnalysis } from '@/lib/hooks/useCoach';
import { CourseProgressBar } from '@/components/courses/CourseProgressBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PieChart, Pie, Cell } from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Layers3,
  Loader2,
  MessageSquare,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { Recommendation, SkillGap } from '@/lib/api/coach';
import type { CalendarActivity } from '@/lib/api/calendar';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Circular Progress Ring                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

function ProgressRing({
  value,
  size = 56,
  strokeWidth = 5,
  color = '#f59e0b',
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700"
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-xs font-semibold"
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  KPI Stat Card                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-amber-600',
  bg = 'bg-amber-50',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  bg?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2.5 ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p className="text-2xl font-bold mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Activity Calendar Widget                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

const activityTypeConfig: Record<string, { label: string; icon: string; badgeColor: string }> = {
  quiz: { label: 'Quiz', icon: '📝', badgeColor: 'bg-blue-100 text-blue-700' },
  exam: { label: 'Épreuve', icon: '📋', badgeColor: 'bg-red-100 text-red-700' },
  assignment: { label: 'Devoir', icon: '✏️', badgeColor: 'bg-purple-100 text-purple-700' },
  attendance: { label: 'Séance', icon: '📅', badgeColor: 'bg-green-100 text-green-700' },
  revision: { label: 'Révision', icon: '📖', badgeColor: 'bg-amber-100 text-amber-700' },
};

function CalendarWidget({ activities }: { activities: CalendarActivity[] }) {
  const today = new Date().toISOString().split('T')[0];

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarActivity[]>();
    for (const a of activities.slice(0, 15)) {
      const date = a.date || 'Sans date';
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(a);
    }
    return map;
  }, [activities]);

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Aucune activité à venir</p>
        <p className="text-xs mt-1">Vos quiz, devoirs et séances apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
      {Array.from(grouped.entries()).map(([date, items]) => {
        const isToday = date === today;
        const dateLabel = isToday
          ? "Aujourd'hui"
          : new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });

        return (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2 h-2 rounded-full ${isToday ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}
              />
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  isToday ? 'text-amber-600' : 'text-muted-foreground'
                }`}
              >
                {dateLabel}
              </span>
            </div>
            <div className="space-y-1.5 ml-4">
              {items.map((act) => {
                const cfg = activityTypeConfig[act.type] ?? activityTypeConfig.quiz;
                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-2.5 rounded-lg border p-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-base mt-0.5">{cfg.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight truncate">{act.title}</p>
                      {act.course_title && (
                        <p className="text-xs text-muted-foreground truncate">{act.course_title}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className={`text-[10px] shrink-0 ${cfg.badgeColor}`}>
                      {cfg.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  AI Recommendation Cards                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

const priorityConfig = {
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 border-red-200', icon: Zap },
  important: { label: 'Important', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: AlertTriangle },
  optional: { label: 'Optionnel', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: BookOpen },
};

const recoTypeIcons: Record<string, string> = {
  quiz: '📝',
  revision: '📖',
  exercise: '✏️',
  practice: '💻',
};

function RecommendationCard({ reco }: { reco: Recommendation }) {
  const pCfg = priorityConfig[reco.priority] ?? priorityConfig.optional;
  const PIcon = pCfg.icon;

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 hover:shadow-sm transition-shadow">
      <span className="text-xl mt-0.5">{recoTypeIcons[reco.type] ?? '📝'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold leading-tight truncate">{reco.title}</p>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${pCfg.color}`}>
            <PIcon className="h-3 w-3 mr-0.5" />
            {pCfg.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{reco.description}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          {reco.course_title && (
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> {reco.course_title}
            </span>
          )}
          {reco.estimated_duration_min > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {reco.estimated_duration_min} min
            </span>
          )}
          {reco.target_bloom && (
            <Badge variant="secondary" className="text-[10px]">
              {reco.target_bloom}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Skill Gap Alert                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function SkillGapAlert({ gaps }: { gaps: SkillGap[] }) {
  const critical = gaps.filter((g) => g.severity === 'high');
  if (critical.length === 0) return null;

  return (
    <Card className="border-red-200 bg-red-50/50">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {critical.length} lacune{critical.length > 1 ? 's' : ''} critique{critical.length > 1 ? 's' : ''} détectée{critical.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {critical.slice(0, 4).map((g, i) => (
                <Badge key={i} variant="outline" className="text-xs bg-white border-red-200 text-red-700">
                  {g.area} — {g.course_title} ({Math.round(g.score)}%)
                </Badge>
              ))}
            </div>
            <Link
              href="/student-dashboard/recommendations"
              className="text-xs text-red-700 underline underline-offset-2 mt-2 inline-block hover:text-red-900"
            >
              Voir les recommandations →
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Study Plan Preview                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function StudyPlanPreview({ summary, activities }: { summary?: string; activities: Array<{ day_offset: number; title: string; course_title?: string; duration_min?: number }> }) {
  if (!activities?.length) return null;

  return (
    <div className="space-y-2">
      {summary && (
        <p className="text-sm text-muted-foreground italic">&ldquo;{summary}&rdquo;</p>
      )}
      <div className="space-y-1.5">
        {activities.slice(0, 5).map((act, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <Badge variant="secondary" className="text-xs shrink-0 w-10 justify-center">
              J+{act.day_offset}
            </Badge>
            <span className="truncate font-medium">{act.title}</span>
            {act.course_title && (
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                {act.course_title}
              </span>
            )}
            {act.duration_min && (
              <span className="text-xs text-muted-foreground shrink-0 ml-auto">{act.duration_min} min</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                 */
/* ════════════════════════════════════════════════════════════════════════════ */

export default function StudentDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const studentId = user?.id ?? 0;

  const { data: progressData } = useMyProgress();
  const { data, isLoading } = useStudentDashboard(studentId);
  const { data: calendarData, isLoading: calLoading } = useCalendarActivities();
  const { data: coachData, isLoading: coachLoading } = useCoachAnalysis();

  // Build progress map
  const progressMap = useMemo(() => {
    const m = new Map<number, number>();
    if (progressData?.progress) {
      for (const p of progressData.progress) m.set(p.course_id, p.overall_progress);
    }
    return m;
  }, [progressData]);

  // Compute greeting
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
      </div>
    );
  }

  if (!user || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Mon Tableau de Bord</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Impossible de charger votre tableau de bord.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const classId = data.student.class_id;
  const stats = data.stats;
  const overallProgress =
    data.courses.length > 0
      ? data.courses.reduce((acc, c) => acc + (progressMap.get(c.id) ?? c.completion_rate), 0) / data.courses.length
      : 0;

  const recommendations = coachData?.recommendations ?? [];
  const skillGaps = coachData?.skill_gaps ?? [];
  const studyPlan = coachData?.study_plan;
  const topRecos = recommendations.slice(0, 4);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting}, {user.username} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Voici un aperçu de votre progression et de vos prochaines activités.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600">
            <Link href="/student-dashboard/recommendations">
              <Sparkles className="h-4 w-4 mr-1.5" />
              Coach IA
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/grades">
              <Award className="h-4 w-4 mr-1.5" />
              Notes
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/absences">
              <Calendar className="h-4 w-4 mr-1.5" />
              Absences
            </Link>
          </Button>
          {classId ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/classes/${classId}/chat`}>
                <MessageSquare className="h-4 w-4 mr-1.5" />
                Chat Classe
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Skill Gap Alert ────────────────────────────────────────────── */}
      {!coachLoading && <SkillGapAlert gaps={skillGaps} />}

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={Layers3} label="Modules" value={String(stats.total_courses)} sub="Cours inscrits" />
        <KpiCard
          icon={CheckCircle2}
          label="Quiz terminés"
          value={String(stats.quizzes_completed)}
          sub={`sur ${stats.total_quizzes}`}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <KpiCard
          icon={Target}
          label="Moyenne"
          value={`${stats.avg_score.toFixed(1)}%`}
          sub={stats.avg_score >= 70 ? 'Bon travail !' : stats.avg_score >= 50 ? 'Peut mieux faire' : 'À améliorer'}
          color={stats.avg_score >= 70 ? 'text-emerald-600' : stats.avg_score >= 50 ? 'text-amber-600' : 'text-red-600'}
          bg={stats.avg_score >= 70 ? 'bg-emerald-50' : stats.avg_score >= 50 ? 'bg-amber-50' : 'bg-red-50'}
        />
        <KpiCard
          icon={TrendingUp}
          label="Progression"
          value={`${overallProgress.toFixed(0)}%`}
          sub="Tous modules"
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <KpiCard
          icon={GraduationCap}
          label="Complétion"
          value={`${stats.completion_rate.toFixed(0)}%`}
          sub="Taux global"
          color="text-violet-600"
          bg="bg-violet-50"
        />
      </div>

      {/* ── Main Grid: Calendar + Recommendations ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Calendar — left 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-amber-600" />
                  Calendrier d&apos;activités
                </CardTitle>
                <CardDescription>Prochains quiz, devoirs et séances</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {calLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
              </div>
            ) : (
              <CalendarWidget activities={calendarData?.activities ?? []} />
            )}
          </CardContent>
        </Card>

        {/* Recommendations — right 3 cols */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  Recommandations IA
                </CardTitle>
                <CardDescription>
                  Exercices de renforcement proposés par votre Coach IA
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/student-dashboard/recommendations">
                  Tout voir <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {coachLoading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                <p className="text-xs text-muted-foreground">L&apos;IA analyse vos performances...</p>
              </div>
            ) : topRecos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Aucune recommandation pour le moment</p>
                <p className="text-xs mt-1">Complétez des quiz pour recevoir des suggestions personnalisées</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topRecos.map((r, i) => (
                  <RecommendationCard key={i} reco={r} />
                ))}
              </div>
            )}

            {/* Study Plan Preview */}
            {!coachLoading && studyPlan && (studyPlan.activities?.length ?? 0) > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-600" />
                    Plan d&apos;étude suggéré
                  </h4>
                  <StudyPlanPreview
                    summary={studyPlan.summary}
                    activities={studyPlan.activities}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Course Progress Cards ──────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-amber-600" />
          Progression par module
        </h2>
        {data.courses.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aucun module inscrit</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.courses.map((c) => {
              const prog = progressMap.get(c.id) ?? c.completion_rate;
              const scoreColor =
                c.avg_score >= 70 ? '#10b981' : c.avg_score >= 50 ? '#f59e0b' : '#ef4444';

              return (
                <Card key={c.id} className="hover:shadow-md transition-shadow group">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-3">
                      <ProgressRing value={prog} color={scoreColor} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm leading-tight truncate group-hover:text-amber-700 transition-colors">
                          {c.title}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>{c.quizzes_completed}/{c.total_quizzes} quiz</span>
                          <span>Moy. {c.avg_score.toFixed(0)}%</span>
                        </div>
                        <div className="mt-2">
                          <CourseProgressBar progress={prog} size="sm" />
                        </div>
                      </div>
                      <Button asChild variant="ghost" size="icon" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/courses/${c.id}/dashboard`}>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent Quizzes ─────────────────────────────────────────────── */}
      {data.recent_quizzes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-600" />
              Derniers quiz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.recent_quizzes.slice(0, 6).map((q) => {
                const scoreColor =
                  q.score >= 70 ? 'text-emerald-600' : q.score >= 50 ? 'text-amber-600' : 'text-red-600';
                return (
                  <div
                    key={q.id}
                    className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {q.quiz_title ?? `Quiz #${q.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {q.completed_at
                          ? new Date(q.completed_at).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </p>
                    </div>
                    <span className={`text-lg font-bold ${scoreColor}`}>
                      {q.score.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
