'use client';

import Link from 'next/link';
import { useMyDashboard } from '@/lib/hooks/useDashboards';
import { DashboardStats } from '@/components/courses/DashboardStats';
import { DashboardCharts } from '@/components/courses/DashboardCharts';
import { ExamDashboardSection } from '@/components/courses/ExamDashboardSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, BarChart3, Users, Home, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function TeacherDashboardPage() {
  const { data, isLoading, error } = useMyDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle>Dashboard</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Impossible de charger le dashboard.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalExams = data.exam_stats?.total_exams ?? 0;
  const analyzedExams = data.exam_stats?.exams_analyzed ?? 0;

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Enseignant</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Vue globale sur l&apos;activité pédagogique, les quiz et les épreuves.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/courses"><Home className="h-4 w-4 mr-2" />Accueil</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/classes"><Users className="h-4 w-4 mr-2" />Mes classes</Link>
          </Button>
        </div>
      </div>

      {/* Quiz KPIs */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-6 rounded-full bg-bolt-accent" />
          <h2 className="text-base font-semibold">Activité Quiz</h2>
        </div>
        <DashboardStats stats={data.stats} />
      </section>

      {/* Exam global KPIs */}
      {totalExams > 0 && data.exam_stats && (
        <section>
          <ExamDashboardSection
            examStats={data.exam_stats}
            title={`Épreuves — ${totalExams} au total, ${analyzedExams} analysées`}
          />
        </section>
      )}

      {/* Charts */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-6 rounded-full bg-bolt-accent" />
          <h2 className="text-base font-semibold">Distributions cognitives (Quiz)</h2>
        </div>
        <DashboardCharts
          bloom_distribution={data.bloom_distribution}
          difficulty_distribution={data.difficulty_distribution}
          aaa_distribution={data.aaa_distribution}
        />
      </section>

      {/* Per-course cards */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-6 rounded-full bg-bolt-accent" />
          <h2 className="text-base font-semibold">Cours</h2>
          <Badge variant="outline" className="text-xs">{data.courses.length} cours</Badge>
        </div>
        {data.courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun cours trouvé.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.courses.map((c) => {
              const cExams = c.exam_stats?.total_exams ?? 0;
              const cAnalyzed = c.exam_stats?.exams_analyzed ?? 0;
              return (
                <Card key={c.id} className="border flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    {c.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Étudiants</span>
                        <span className="font-medium">{c.stats.total_students}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Quiz</span>
                        <span className="font-medium">{c.stats.total_quizzes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Score moyen</span>
                        <span className="font-medium">{c.stats.avg_score?.toFixed(1) ?? '—'}%</span>
                      </div>
                      {cExams > 0 && (
                        <div className="flex justify-between items-center border-t border-bolt-line pt-1 mt-1">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <FileText className="h-3 w-3" />Épreuves
                          </span>
                          <span className="font-medium">
                            {cExams} <span className="text-xs text-muted-foreground">({cAnalyzed} analysées)</span>
                          </span>
                        </div>
                      )}
                      {c.exam_stats?.avg_overall_score !== null && c.exam_stats?.avg_overall_score !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Score IA moyen</span>
                          <span className="font-medium text-violet-600">{c.exam_stats.avg_overall_score.toFixed(1)}/10</span>
                        </div>
                      )}
                    </div>
                    <Button asChild className="w-full mt-2" size="sm">
                      <Link href={`/courses/${c.id}/dashboard`}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Dashboard du cours
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

