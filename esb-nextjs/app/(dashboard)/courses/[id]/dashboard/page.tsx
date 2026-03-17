'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCourse, useCourseDashboard } from '@/lib/hooks/useCourses';
import { DashboardStats } from '@/components/courses/DashboardStats';
import { DashboardCharts } from '@/components/courses/DashboardCharts';
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

  // Loading state
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

  // Check if user is a teacher
  const isTeacher = user?.is_teacher || user?.is_superuser;
  if (!isTeacher) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Access Denied"
          description="Only teachers can view course dashboards. Students can view their own progress from the course page."
          icon={<Lock className="h-12 w-12" />}
          action={
            <Button onClick={() => router.push(`/courses/${courseId}`)}>
              Back to Course
            </Button>
          }
        />
      </div>
    );
  }

  // Error state
  if (dashboardError || !dashboardData || !courseData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Dashboard Not Available"
          description="Unable to load dashboard data. This could be because there are no quizzes or student activity yet."
          icon={<BarChart3 className="h-12 w-12" />}
          action={
            <Button onClick={() => router.push(`/courses/${courseId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Course
            </Button>
          }
        />
      </div>
    );
  }

  const { course } = courseData;
  const { stats, bloom_distribution, difficulty_distribution, aaa_distribution, recent_quizzes } =
    dashboardData;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: course.title, href: `/courses/${courseId}` },
          { label: 'Dashboard' },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Course Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Performance insights and statistics for {course.title}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/courses/${courseId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Course
          </Link>
        </Button>
      </div>

      {/* Stats Section */}
      <div className="mb-8">
        <DashboardStats stats={stats} />
      </div>

      {/* Charts Section */}
      <div className="mb-8">
        <DashboardCharts
          bloom_distribution={bloom_distribution}
          difficulty_distribution={difficulty_distribution}
          aaa_distribution={aaa_distribution}
        />
      </div>

      {/* Recent Quizzes Section */}
      {recent_quizzes && recent_quizzes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Quiz Activity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Latest quiz completions by students
            </p>
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
                      Completed on {new Date(quiz.completed_at).toLocaleDateString()}
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

      {/* Empty State for No Data */}
      {(!recent_quizzes || recent_quizzes.length === 0) &&
        bloom_distribution.length === 0 &&
        difficulty_distribution.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No Analytics Data Yet</p>
                <p className="text-muted-foreground max-w-md">
                  Dashboard analytics will appear once students start completing quizzes.
                  Create quizzes and encourage students to participate!
                </p>
                <Button className="mt-6" asChild>
                  <Link href={`/courses/${courseId}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Course
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
