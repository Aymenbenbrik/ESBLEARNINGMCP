'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStudentDashboard } from '@/lib/hooks/useDashboards';
import { DashboardCharts } from '@/components/courses/DashboardCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TeacherStudentDashboardPage() {
  const params = useParams();
  const studentId = Number(params?.id);

  const { data, isLoading, error } = useStudentDashboard(studentId);

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
            <CardTitle>Student Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unable to load student dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/students">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{data.student.username}</h1>
            <p className="text-muted-foreground">Student dashboard</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Courses" value={String(data.stats.total_courses)} />
        <StatCard label="Quizzes completed" value={String(data.stats.quizzes_completed)} />
        <StatCard label="Avg score" value={`${data.stats.avg_score.toFixed(1)}%`} />
        <StatCard label="Completion" value={`${data.stats.completion_rate.toFixed(1)}%`} />
      </div>

      <DashboardCharts
        bloom_distribution={data.bloom_distribution}
        difficulty_distribution={data.difficulty_distribution}
        aaa_distribution={data.aaa_distribution}
      />

      <Card>
        <CardHeader>
          <CardTitle>Progress by course</CardTitle>
        </CardHeader>
        <CardContent>
          {data.courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrolled courses found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Course</th>
                    <th className="text-right py-2 px-3 text-sm text-muted-foreground">Quizzes</th>
                    <th className="text-right py-2 px-3 text-sm text-muted-foreground">Completion</th>
                    <th className="text-right py-2 px-3 text-sm text-muted-foreground">Avg score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.courses.map((c) => (
                    <tr key={c.id} className="border-b last:border-b-0">
                      <td className="py-2 px-3 font-medium">{c.title}</td>
                      <td className="py-2 px-3 text-right">{c.quizzes_completed}/{c.total_quizzes}</td>
                      <td className="py-2 px-3 text-right">{c.completion_rate.toFixed(1)}%</td>
                      <td className="py-2 px-3 text-right">{c.avg_score.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent quizzes</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_quizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent quiz activity.</p>
          ) : (
            <div className="space-y-2">
              {data.recent_quizzes.map((q) => (
                <div key={q.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="font-medium">{q.quiz_title ?? `Quiz #${q.id}`}</div>
                    <div className="text-sm text-muted-foreground">
                      {q.completed_at ? new Date(q.completed_at).toLocaleString() : '—'}
                    </div>
                  </div>
                  <div className="font-semibold">{q.score.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
