'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { useQuizSubmissions, useReinstateQuiz } from '@/lib/hooks/useQuiz';
import { QuizSubmission } from '@/lib/types/quiz';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Eye,
  RotateCcw,
  Users,
  XCircle,
} from 'lucide-react';

function StatusBadge({ submission }: { submission: QuizSubmission }) {
  if (submission.is_disqualified) {
    return <Badge variant="destructive">Disqualified</Badge>;
  }
  if (submission.completed_at) {
    if (submission.score !== null && submission.score >= 50) {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Passed</Badge>;
    }
    return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Failed</Badge>;
  }
  return <Badge variant="secondary">In Progress</Badge>;
}

function StatCard({
  title,
  value,
  icon,
  colorClass,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${colorClass}`}>{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function QuizSubmissionsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);

  const { data, isLoading } = useQuizSubmissions(chapterId);
  const reinstateQuiz = useReinstateQuiz();

  const [reinstateTarget, setReinstateTarget] = useState<QuizSubmission | null>(null);

  useEffect(() => {
    if (user && !user.is_teacher && !user.is_superuser) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  if (!user || (!user.is_teacher && !user.is_superuser)) return null;

  const handleReinstate = () => {
    if (!reinstateTarget) return;
    reinstateQuiz.mutate(reinstateTarget.quiz_id, {
      onSuccess: () => setReinstateTarget(null),
    });
  };

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: 'Courses', href: '/courses' },
            { label: 'Course', href: `/courses/${courseId}` },
            { label: 'Chapter', href: `/courses/${courseId}/chapters/${chapterId}` },
            { label: 'Quiz Submissions' },
          ]}
        />

        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            {isLoading ? 'Loading...' : `${data?.chapter_title ?? 'Chapter'} — Quiz Submissions`}
          </h1>
          <p className="text-muted-foreground mt-1">All student quiz attempts for this chapter</p>
        </div>

        {/* Stat Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Total Submissions"
              value={data.total_submissions}
              icon={<Users className="h-5 w-5 text-blue-600" />}
              colorClass="bg-blue-100"
            />
            <StatCard
              title="Passed"
              value={data.passed_count}
              icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
              colorClass="bg-green-100"
            />
            <StatCard
              title="Failed"
              value={data.failed_count}
              icon={<XCircle className="h-5 w-5 text-yellow-600" />}
              colorClass="bg-yellow-100"
            />
            <StatCard
              title="Disqualified"
              value={data.disqualified_count}
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
              colorClass="bg-red-100"
            />
          </div>
        ) : null}

        {/* Submissions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : !data || data.submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mb-4 opacity-40" />
                <p className="text-lg font-medium">No students have taken this quiz yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date Started</TableHead>
                    <TableHead>Violations</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.submissions.map((submission) => (
                    <TableRow key={submission.quiz_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{submission.student_name}</p>
                          <p className="text-xs text-muted-foreground">{submission.student_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {submission.score !== null ? `${submission.score}%` : '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge submission={submission} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(submission.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{submission.violations_count}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/courses/${courseId}/chapters/${chapterId}/quiz/${submission.quiz_id}/results`}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Link>
                          </Button>
                          {submission.is_disqualified && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setReinstateTarget(submission)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Reinstate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reinstate Confirmation Dialog */}
      <Dialog open={!!reinstateTarget} onOpenChange={(open) => !open && setReinstateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reinstate Student</DialogTitle>
            <DialogDescription>
              Are you sure you want to reinstate{' '}
              <strong>{reinstateTarget?.student_name}</strong>? Their violations will be cleared and
              they will be able to retake the quiz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReinstateTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReinstate}
              disabled={reinstateQuiz.isPending}
            >
              {reinstateQuiz.isPending ? 'Reinstating...' : 'Reinstate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
