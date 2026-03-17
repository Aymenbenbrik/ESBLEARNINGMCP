'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useClassDashboard } from '@/lib/hooks/useDashboards';
import { DashboardStats } from '@/components/courses/DashboardStats';
import { DashboardCharts } from '@/components/courses/DashboardCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare } from 'lucide-react';

export default function ClassDashboardPage() {
  const params = useParams();
  const classId = Number(params?.id);

  const { data, isLoading, error } = useClassDashboard(classId);

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
            <CardTitle>Class Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unable to load class dashboard.
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
          <h1 className="text-2xl font-bold">{data.class.name}</h1>
          <p className="text-muted-foreground">
            {data.class.program_name ? `Program: ${data.class.program_name}` : 'Class overview'}
          </p>
        </div>

        <Button asChild>
          <Link href={`/classes/${classId}/chat`}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Open Class Chat
          </Link>
        </Button>
      </div>

      <DashboardStats stats={data.stats} />

      <DashboardCharts
        bloom_distribution={data.bloom_distribution}
        difficulty_distribution={data.difficulty_distribution}
        aaa_distribution={data.aaa_distribution}
      />

      <Card>
        <CardHeader>
          <CardTitle>Student performance</CardTitle>
        </CardHeader>
        <CardContent>
          {data.students.length === 0 ? (
            <p className="text-sm text-muted-foreground">Per-student performance is available to teachers/administrators only.</p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-sm text-muted-foreground">Student</th>
                                    <th className="text-right py-2 px-3 text-sm text-muted-foreground">Quizzes</th>
                  <th className="text-right py-2 px-3 text-sm text-muted-foreground">Avg score</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id} className="border-b last:border-b-0">
                    <td className="py-2 px-3 font-medium">{s.username}</td>
                                        <td className="py-2 px-3 text-right">{s.quizzes_completed}</td>
                    <td className="py-2 px-3 text-right">{s.avg_score.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
