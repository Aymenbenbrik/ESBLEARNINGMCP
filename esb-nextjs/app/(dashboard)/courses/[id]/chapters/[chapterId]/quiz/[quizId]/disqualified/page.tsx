'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { quizApi } from '@/lib/api/quiz';
import { QuizViolation } from '@/lib/types/quiz';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { XCircle, ArrowLeft, AlertTriangle } from 'lucide-react';

const violationLabels: Record<string, string> = {
  fullscreen_exit: 'Exited fullscreen',
  copy: 'Attempted to copy (Ctrl+C)',
  paste: 'Attempted to paste (Ctrl+V)',
  tab_switch: 'Switched tabs / left window',
  right_click: 'Right-clicked during exam',
  print_screen: 'Pressed Print Screen',
  select_all: 'Attempted to select all (Ctrl+A)',
};

export default function DisqualifiedPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);
  const quizId = parseInt(params.quizId as string);

  const [violations, setViolations] = useState<QuizViolation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    quizApi
      .getViolations(quizId)
      .then((data) => setViolations(data.violations))
      .catch(() => setViolations([]))
      .finally(() => setIsLoading(false));
  }, [quizId]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push(`/courses/${courseId}/chapters/${chapterId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Chapter
        </Button>
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <XCircle className="h-20 w-20 text-red-600" />
        </div>
        <h1 className="text-3xl font-bold text-red-700 mb-2">Quiz Disqualified</h1>
        <p className="text-4xl font-bold text-gray-900 mb-4">Score: 0%</p>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-lg mx-auto">
          <p className="text-red-800 text-sm">
            You were removed from the quiz due to repeated violations of exam rules.
          </p>
        </div>
      </div>

      {/* Violation Log */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Violation Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : violations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No violation records found.</p>
          ) : (
            <div className="space-y-3">
              {violations.map((v, idx) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                    <span className="text-sm font-medium">
                      {violationLabels[v.violation_type] ?? v.violation_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={v.is_warning ? 'outline' : 'destructive'}>
                      {v.is_warning ? 'Warning' : 'Disqualified'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.occurred_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reinstatement Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
        <p className="text-blue-800 text-sm">
          If you believe this was a mistake, please contact your teacher for reinstatement.
        </p>
      </div>
    </div>
  );
}
