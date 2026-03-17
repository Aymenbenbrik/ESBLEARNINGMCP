'use client';

import Link from 'next/link';
import { useMyDashboard } from '@/lib/hooks/useDashboards';
import { DashboardStats } from '@/components/courses/DashboardStats';
import { DashboardCharts } from '@/components/courses/DashboardCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, BarChart3, Users } from 'lucide-react';
import { Home } from 'lucide-react';

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
          <CardHeader>
            <CardTitle>Dashboards</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unable to load dashboard analytics.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of quiz activity, performance, and learning outcomes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/courses">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/classes">
              <Users className="h-4 w-4 mr-2" />
              My Classes
            </Link>
          </Button>
        </div>
      </div>

      <DashboardStats stats={data.stats} />

      <DashboardCharts
        bloom_distribution={data.bloom_distribution}
        difficulty_distribution={data.difficulty_distribution}
        aaa_distribution={data.aaa_distribution}
      />

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
        </CardHeader>
        <CardContent>
          {data.courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No modules found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.courses.map((c) => (
                <Card key={c.id} className="border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    {c.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {c.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Students:</span> {c.stats.total_students}
                      </div>
                      <div>
                        <span className="font-medium">Quizzes:</span> {c.stats.total_quizzes}
                      </div>
                      <div>
                        <span className="font-medium">Avg score:</span> {c.stats.avg_score.toFixed(1)}%
                      </div>
                    </div>
                    <Button asChild className="w-full">
                      <Link href={`/courses/${c.id}/dashboard`}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        View module dashboard
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
