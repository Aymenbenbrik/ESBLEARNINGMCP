import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StudentProgress } from '@/lib/types/course';
import { CheckCircle, ClipboardList } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface StudentProgressCardProps {
  progress: StudentProgress;
}

export function StudentProgressCard({ progress }: StudentProgressCardProps) {
  const quizProgress = progress.quizzes_total > 0
    ? (progress.quizzes_completed / progress.quizzes_total) * 100
    : 0;

  const assignmentProgress = progress.assignments_total > 0
    ? (progress.assignments_submitted / progress.assignments_total) * 100
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium">Quizzes</span>
            </div>
            <span className="text-muted-foreground">
              {progress.quizzes_completed} / {progress.quizzes_total}
            </span>
          </div>
          <Progress value={quizProgress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {Math.round(quizProgress)}% complete
          </p>
        </div>

        {progress.assignments_total > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                <span className="font-medium">Assignments</span>
              </div>
              <span className="text-muted-foreground">
                {progress.assignments_submitted} / {progress.assignments_total}
              </span>
            </div>
            <Progress value={assignmentProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {Math.round(assignmentProgress)}% complete
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
