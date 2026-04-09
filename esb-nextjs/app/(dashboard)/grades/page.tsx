'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCourses } from '@/lib/hooks/useCourses';
import { useMyProgress } from '@/lib/hooks/useProgress';
import { useClassDashboard } from '@/lib/hooks/useDashboards';
import { useStudentAAScores, useStudentAAPScores } from '@/lib/hooks/useEvaluation';
import { CourseProgressBar } from '@/components/courses/CourseProgressBar';
import { StudentAARadar } from '@/components/evaluation/StudentAARadar';
import { StudentAAPRadar } from '@/components/evaluation/StudentAAPRadar';
import { AAProgressList } from '@/components/evaluation/AAProgressList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, TrendingUp, Award, BarChart3, Target } from 'lucide-react';
import Link from 'next/link';
import { safePercent } from '@/lib/format';
import { useStudentDashboard } from '@/lib/hooks/useDashboards';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  Cell,
} from 'recharts';

function gradeColor(grade: number | null | undefined) {
  if (grade == null) return 'text-slate-400';
  if (grade >= 14) return 'text-green-600 font-bold';
  if (grade >= 10) return 'text-orange-500 font-bold';
  return 'text-red-600 font-bold';
}

function gradeBgColor(grade: number) {
  if (grade >= 80) return '#22c55e';
  if (grade >= 50) return '#eab308';
  return '#ef4444';
}

function MiniScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
}

function QuizSparkline({ quizzes }: { quizzes: { score: number; title: string }[] }) {
  if (quizzes.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  const data = quizzes.slice(-5).map((q, i) => ({
    name: q.title || `Q${i + 1}`,
    score: q.score,
  }));

  return (
    <div className="w-24 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 6, padding: '4px 8px' }}
            formatter={(value: any) => [`${Number(value).toFixed(0)}%`, 'Score']}
            labelFormatter={(label: any) => String(label)}
          />
          <Bar dataKey="score" radius={[2, 2, 0, 0]} maxBarSize={12}>
            {data.map((entry, i) => (
              <Cell key={i} fill={gradeBgColor(entry.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function GradesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isTeacher = !!(user?.is_teacher || user?.is_superuser);
  const { data: coursesData, isLoading: coursesLoading } = useCourses();
  const { data: dashData, isLoading: dashLoading } = useStudentDashboard(user?.id ?? 0);
  const { data: progressData } = useMyProgress();

  const studentId = user?.id ?? 0;
  const classId = dashData?.student?.class_id ?? 0;
  const { data: classData } = useClassDashboard(classId);
  const programId = classData?.class?.program_id ?? undefined;
  const programName = classData?.class?.program_name ?? undefined;

  const [selectedCourseId, setSelectedCourseId] = useState<number | undefined>(undefined);

  const { data: aaData, isLoading: aaLoading } = useStudentAAScores(studentId, selectedCourseId);
  const { data: aapData, isLoading: aapLoading } = useStudentAAPScores(studentId, programId);

  const isLoading = authLoading || coursesLoading || dashLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user || !dashData) return null;

  const courses = dashData.courses || [];
  const stats = dashData.stats;

  const selectedCourseName = courses.find((c: any) => c.id === selectedCourseId)?.title;

  // Progress map
  const progressMap = new Map<number, number>();
  if (progressData?.progress) {
    for (const p of progressData.progress) {
      progressMap.set(p.course_id, p.overall_progress);
    }
  }

  // Recent quizzes map for sparklines
  const quizByCourse = new Map<number, { score: number; title: string }[]>();
  if (dashData.recent_quizzes) {
    for (const q of dashData.recent_quizzes) {
      const courseId = (q as any).course_id;
      if (!courseId) continue;
      if (!quizByCourse.has(courseId)) quizByCourse.set(courseId, []);
      quizByCourse.get(courseId)!.push({ score: q.score, title: q.quiz_title || '' });
    }
  }

  // Compute overall averages
  const allScores = courses.map((c: any) => c.avg_score).filter((s: number) => s > 0);
  const overallAvg = allScores.length > 0 ? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length : 0;
  const bestScore = allScores.length > 0 ? Math.max(...allScores) : 0;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="h-6 w-6 text-red-600" />
          Mes Notes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Récapitulatif de vos résultats par module
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-slate-900">{courses.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Modules inscrits</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6 text-center">
            <p className={`text-3xl font-bold ${gradeColor(overallAvg)}`}>
              {overallAvg > 0 ? overallAvg.toFixed(1) + '%' : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Moyenne générale</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">
              {bestScore > 0 ? bestScore.toFixed(1) + '%' : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Meilleur score</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-slate-900">{stats.quizzes_completed}</p>
            <p className="text-xs text-muted-foreground mt-1">Quiz complétés</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-slate-900">{safePercent(stats.completion_rate)}</p>
            <p className="text-xs text-muted-foreground mt-1">Taux de complétion</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Grades Table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Notes par module
          </CardTitle>
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun module inscrit.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-3 text-sm font-medium text-muted-foreground">Module</th>
                    <th className="text-left py-3 px-3 text-sm font-medium text-muted-foreground">Progression</th>
                    <th className="text-center py-3 px-3 text-sm font-medium text-muted-foreground">Tendance Quiz</th>
                    <th className="text-right py-3 px-3 text-sm font-medium text-muted-foreground">Quiz</th>
                    <th className="text-right py-3 px-3 text-sm font-medium text-muted-foreground">Moyenne Quiz</th>
                    <th className="text-right py-3 px-3 text-sm font-medium text-muted-foreground">Complétion</th>
                    <th className="text-right py-3 px-3 text-sm font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c: any) => (
                    <tr key={c.id} className="border-b last:border-b-0 hover:bg-slate-50">
                      <td className="py-3 px-3">
                        <p className="font-medium">{c.title}</p>
                        <div className="mt-1">
                          <MiniScoreBar score={c.avg_score || 0} />
                        </div>
                      </td>
                      <td className="py-3 px-3 w-32">
                        <CourseProgressBar
                          progress={progressMap.get(c.id) ?? c.completion_rate}
                          size="sm"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex justify-center">
                          <QuizSparkline quizzes={quizByCourse.get(c.id) ?? []} />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="font-medium">{c.quizzes_completed}</span>
                        <span className="text-muted-foreground">/{c.total_quizzes}</span>
                      </td>
                      <td className={`py-3 px-3 text-right ${gradeColor(c.avg_score)}`}>
                        {c.avg_score > 0 ? c.avg_score.toFixed(1) + '%' : '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Badge variant={c.completion_rate >= 80 ? 'default' : 'secondary'} className="text-xs">
                          {c.completion_rate.toFixed(0)}%
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/courses/${c.id}`}>Détails</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Évaluation AA / AAP ─────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Target className="h-5 w-5 text-green-600" />
          Mes Acquis d&apos;Apprentissage
        </h2>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Module :</span>
          <Select
            value={selectedCourseId ? String(selectedCourseId) : undefined}
            onValueChange={(v) => setSelectedCourseId(Number(v))}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Sélectionner un module" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCourseId && (
          <div className="space-y-4">
            {aaLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <StudentAARadar
                    scores={aaData?.scores ?? []}
                    courseName={selectedCourseName}
                  />
                  {programId && (
                    <StudentAAPRadar
                      scores={aapData?.scores ?? []}
                      programName={programName}
                    />
                  )}
                </div>
                <AAProgressList scores={aaData?.scores ?? []} />
              </>
            )}
          </div>
        )}

        {!selectedCourseId && (
          <Card className="rounded-2xl">
            <CardContent className="py-12">
              <p className="text-sm text-muted-foreground text-center">
                Sélectionnez un module pour afficher vos acquis d&apos;apprentissage.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* AAP section when no course selected but program exists */}
      {!selectedCourseId && programId && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Mes AAP de Formation
          </h2>
          {aapLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <StudentAAPRadar
              scores={aapData?.scores ?? []}
              programName={programName}
            />
          )}
        </div>
      )}
    </div>
  );
}
