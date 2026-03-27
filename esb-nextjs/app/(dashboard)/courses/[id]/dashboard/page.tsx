'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCourse, useCourseDashboard } from '@/lib/hooks/useCourses';
import { DashboardStats } from '@/components/courses/DashboardStats';
import { DashboardCharts } from '@/components/courses/DashboardCharts';
import { ExamDashboardSection } from '@/components/courses/ExamDashboardSection';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, ArrowLeft, Lock } from 'lucide-react';
import Link from 'next/link';

export default function CourseDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const courseId = parseInt(params.id as string);

  const { data: courseData, isLoading: courseLoading } = useCourse(courseId);
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = useCourseDashboard(courseId);

  if (authLoading || courseLoading || dashboardLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="space-y-6">
          <Skeleton className="h-32" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  const isTeacher = user?.is_teacher || user?.is_superuser;
  if (!isTeacher) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Accès refusé"
          description="Seuls les enseignants peuvent consulter ce dashboard."
          icon={<Lock className="h-12 w-12" />}
          action={<Button onClick={() => router.push(`/courses/${courseId}`)}>Retour au cours</Button>}
        />
      </div>
    );
  }

  if (dashboardError || !dashboardData || !courseData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Dashboard non disponible"
          description="Aucune donnée disponible pour l'instant. Les statistiques apparaîtront dès que les étudiants commenceront les quiz."
          icon={<BarChart3 className="h-12 w-12" />}
          action={
            <Button onClick={() => router.push(`/courses/${courseId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />Retour au cours
            </Button>
          }
        />
      </div>
    );
  }

  const { course } = courseData;
  const { stats, bloom_distribution, difficulty_distribution, aaa_distribution, recent_quizzes, exam_stats } =
    dashboardData;

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Cours', href: '/courses' },
          { label: course.title, href: `/courses/${courseId}` },
          { label: 'Dashboard' },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7" />
            Analytiques du cours
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{course.title}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/courses/${courseId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />Retour au cours
          </Link>
        </Button>
      </div>

      {/* Quiz KPIs */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-6 rounded-full bg-bolt-accent" />
          <h2 className="text-base font-semibold">Statistiques Quiz</h2>
        </div>
        <DashboardStats stats={stats} />
      </section>

      {/* Exam section — per-course */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-6 rounded-full bg-violet-500" />
          <h2 className="text-base font-semibold">Épreuves & Examens</h2>
        </div>
        {exam_stats ? (
          <ExamDashboardSection examStats={exam_stats} courseId={courseId} />
        ) : (
          <p className="text-sm text-muted-foreground">Aucune donnée d&apos;épreuve.</p>
        )}
      </section>

      {/* Bloom / Difficulty / AA charts */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-6 rounded-full bg-bolt-accent" />
          <h2 className="text-base font-semibold">Distributions cognitives</h2>
        </div>
        <DashboardCharts
          bloom_distribution={bloom_distribution}
          difficulty_distribution={difficulty_distribution}
          aaa_distribution={aaa_distribution}
        />
      </section>

      {/* Recent quiz activity */}
      {recent_quizzes && recent_quizzes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activité récente — Quiz</CardTitle>
            <p className="text-sm text-muted-foreground">Dernières soumissions des étudiants</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recent_quizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium">{quiz.student_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(quiz.completed_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{quiz.score}%</p>
                    <p className="text-xs text-muted-foreground">Score</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {(!recent_quizzes || recent_quizzes.length === 0) &&
        bloom_distribution.length === 0 &&
        difficulty_distribution.length === 0 &&
        (!exam_stats || exam_stats.total_exams === 0) && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">Pas encore de données</p>
                <p className="text-muted-foreground max-w-md">
                  Les statistiques apparaîtront dès que les étudiants commenceront les quiz ou après ajout d&apos;épreuves.
                </p>
                <Button className="mt-6" asChild>
                  <Link href={`/courses/${courseId}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />Retour au cours
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}

