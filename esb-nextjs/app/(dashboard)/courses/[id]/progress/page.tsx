'use client';

import { use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useMyCourseProgress, useCourseStudentsProgress } from '@/lib/hooks/useProgress';
import { CourseProgressBar } from '@/components/courses/CourseProgressBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  FileText,
  Loader2,
  Trophy,
} from 'lucide-react';

const statusConfig = {
  completed: { label: 'Terminé', icon: CheckCircle2, color: 'text-green-600 bg-green-50 border-green-200' },
  in_progress: { label: 'En cours', icon: Clock, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  not_started: { label: 'Non commencé', icon: Circle, color: 'text-slate-400 bg-slate-50 border-slate-200' },
};

export default function CourseProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const courseId = parseInt(id);
  const { user } = useAuth();
  const isTeacher = !!(user?.is_teacher || user?.is_superuser);

  const studentProgress = useMyCourseProgress(courseId);
  const teacherProgress = useCourseStudentsProgress(courseId);

  const data = isTeacher ? null : studentProgress.data;
  const teacherData = isTeacher ? teacherProgress.data : null;
  const isLoading = isTeacher ? teacherProgress.isLoading : studentProgress.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/courses/${courseId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {data?.course?.title || teacherData?.course?.title || 'Progression'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isTeacher ? 'Vue progression de tous les étudiants' : 'Votre progression détaillée'}
          </p>
        </div>
      </div>

      {/* ─── Student View ─── */}
      {!isTeacher && data && (
        <>
          {/* Overview Card */}
          {data.snapshot && (
            <Card className="rounded-2xl border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Progression globale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CourseProgressBar progress={data.snapshot.overall_progress} size="md" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">
                      {data.snapshot.chapters_visited}/{data.snapshot.chapters_total}
                    </p>
                    <p className="text-xs text-slate-500">Chapitres visités</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">
                      {data.snapshot.quizzes_completed}/{data.snapshot.quizzes_total}
                    </p>
                    <p className="text-xs text-slate-500">Quiz complétés</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">
                      {data.snapshot.documents_opened}/{data.snapshot.documents_total}
                    </p>
                    <p className="text-xs text-slate-500">Documents ouverts</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">
                      {data.snapshot.quizzes_avg_score.toFixed(0)}%
                    </p>
                    <p className="text-xs text-slate-500">Moy. quiz</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Chapter Timeline */}
          <Card className="rounded-2xl border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Progression par chapitre
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.chapters.map((ch, idx) => {
                  const cfg = statusConfig[ch.status as keyof typeof statusConfig] || statusConfig.not_started;
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={ch.chapter_id} className="flex items-start gap-4">
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${cfg.color}`}>
                          <StatusIcon className="h-4 w-4" />
                        </div>
                        {idx < data.chapters.length - 1 && (
                          <div className="w-px flex-1 bg-slate-200 min-h-[24px]" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">
                              Ch. {ch.chapter_order} — {ch.chapter_title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              {ch.visited && (
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" /> Visité
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {ch.documents_opened}/{ch.documents_total} docs
                              </span>
                              {ch.quiz_completed && (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  Quiz {ch.quiz_score != null ? `${ch.quiz_score.toFixed(0)}%` : '✓'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-24 shrink-0">
                            <CourseProgressBar progress={ch.progress_percent} size="sm" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── Teacher View ─── */}
      {isTeacher && teacherData && (
        <Card className="rounded-2xl border-slate-200">
          <CardHeader>
            <CardTitle>Progression des étudiants ({teacherData.students.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {teacherData.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun étudiant inscrit.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 text-sm text-muted-foreground">Étudiant</th>
                      <th className="text-left py-2 px-3 text-sm text-muted-foreground">Progression</th>
                      <th className="text-right py-2 px-3 text-sm text-muted-foreground">Chapitres</th>
                      <th className="text-right py-2 px-3 text-sm text-muted-foreground">Quiz</th>
                      <th className="text-right py-2 px-3 text-sm text-muted-foreground">Moy. Quiz</th>
                      <th className="text-right py-2 px-3 text-sm text-muted-foreground">Docs</th>
                      <th className="text-right py-2 px-3 text-sm text-muted-foreground">Dernière activité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teacherData.students.map((s) => (
                      <tr key={s.student_id} className="border-b last:border-b-0">
                        <td className="py-2 px-3">
                          <div>
                            <p className="font-medium">{s.student_name}</p>
                            <p className="text-xs text-muted-foreground">{s.student_email}</p>
                          </div>
                        </td>
                        <td className="py-2 px-3 w-36">
                          <CourseProgressBar progress={s.overall_progress} size="sm" />
                        </td>
                        <td className="py-2 px-3 text-right">
                          {s.chapters_visited}/{s.chapters_total}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {s.quizzes_completed}/{s.quizzes_total}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {s.quizzes_avg_score.toFixed(0)}%
                        </td>
                        <td className="py-2 px-3 text-right">
                          {s.documents_opened}/{s.documents_total}
                        </td>
                        <td className="py-2 px-3 text-right text-xs text-muted-foreground">
                          {s.last_activity
                            ? new Date(s.last_activity).toLocaleDateString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
