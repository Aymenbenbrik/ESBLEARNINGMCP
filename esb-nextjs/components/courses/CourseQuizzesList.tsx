'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Document, QuizInfo } from '@/lib/types/course';
import { ClipboardList, Eye, Trash2, PlayCircle, Clock, CheckCircle2, Users } from 'lucide-react';
import { EmptyState } from '../shared/EmptyState';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { quizApi } from '@/lib/api/quiz';
import { toast } from 'sonner';
import { useState } from 'react';

interface CourseQuizzesListProps {
  quizzes: Document[] | QuizInfo[];
  courseId: number;
  canEdit: boolean;
  chapters?: { id: number }[];
}

export function CourseQuizzesList({ quizzes, courseId, canEdit, chapters = [] }: CourseQuizzesListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Determine if quizzes are in teacher format (Document[]) or student format (QuizInfo[])
  const isTeacherView = canEdit;

  // Get first chapter ID for student routes (fallback to 1 if no chapters)
  const firstChapterId = chapters.length > 0 ? chapters[0].id : 1;

  const handleViewQuiz = (documentId: number) => {
    router.push(`/courses/${courseId}/quizzes/${documentId}/view`);
  };

  const handleDeleteQuiz = async (documentId: number) => {
    if (!confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) {
      return;
    }

    setDeletingId(documentId);
    try {
      await quizApi.deleteQuizDocument(documentId);
      toast.success('Quiz deleted successfully');
      router.refresh();
    } catch (error) {
      console.error('Failed to delete quiz:', error);
      toast.error('Failed to delete quiz');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTakeQuiz = (documentId: number) => {
    router.push(`/courses/${courseId}/quizzes/${documentId}/start`);
  };

  const handleResumeQuiz = (quizId: number) => {
    router.push(`/courses/${courseId}/chapters/${firstChapterId}/quiz/${quizId}`);
  };

  const handleViewResults = (quizId: number) => {
    router.push(`/courses/${courseId}/chapters/${firstChapterId}/quiz/${quizId}/results`);
  };

  const getQuizState = (quiz: QuizInfo): 'not_started' | 'in_progress' | 'completed' => {
    if (quiz.student_completed) return 'completed';
    if (quiz.quiz_id !== null) return 'in_progress';
    return 'not_started';
  };

  const statusConfig = {
    not_started: {
      label: 'Not Started',
      className: 'bg-gray-100 text-gray-800',
      icon: PlayCircle
    },
    in_progress: {
      label: 'In Progress',
      className: 'bg-yellow-100 text-yellow-800',
      icon: Clock
    },
    completed: {
      label: 'Completed',
      className: 'bg-green-100 text-green-800',
      icon: CheckCircle2
    },
  };

  if (quizzes.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            title="No quizzes yet"
            description="Generate a quiz to get started."
            icon={<ClipboardList className="h-12 w-12" />}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Course Quizzes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {isTeacherView ? (
            // Teacher View - Display Document[]
            (quizzes as Document[]).map((quiz) => {
              const questionCount = quiz.quiz_data?.length || 0;
              const metadata = typeof quiz.metadata === 'string'
                ? JSON.parse(quiz.metadata)
                : quiz.metadata;

              return (
                <div
                  key={quiz.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <ClipboardList className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{quiz.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {questionCount} {questionCount === 1 ? 'question' : 'questions'}
                        {' • '}
                        Created {format(new Date(quiz.created_at), 'MMM d, yyyy')}
                        {metadata?.chapters && ` • Chapters ${metadata.chapters.join(', ')}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewQuiz(quiz.id)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>

                    {quiz.chapter_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          router.push(
                            `/courses/${courseId}/chapters/${quiz.chapter_id}/quiz/submissions`
                          )
                        }
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Submissions
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteQuiz(quiz.id)}
                      disabled={deletingId === quiz.id}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            // Student View - Display QuizInfo[]
            (quizzes as QuizInfo[]).map((quizInfo) => {
              const quiz = quizInfo.document;
              const state = getQuizState(quizInfo);
              const statusData = statusConfig[state];
              const StatusIcon = statusData.icon;
              const questionCount = quiz.quiz_data?.length || 0;
              const metadata = typeof quiz.metadata === 'string'
                ? JSON.parse(quiz.metadata)
                : quiz.metadata;

              return (
                <div
                  key={quiz.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <ClipboardList className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{quiz.title}</p>
                        <Badge className={statusData.className}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusData.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {questionCount} {questionCount === 1 ? 'question' : 'questions'}
                        {' • '}
                        Created {format(new Date(quiz.created_at), 'MMM d, yyyy')}
                        {quizInfo.student_score !== null && ` • Score: ${quizInfo.student_score}%`}
                        {metadata?.chapters && ` • Chapters ${metadata.chapters.join(', ')}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {state === 'not_started' && (
                      <Button
                        size="sm"
                        onClick={() => handleTakeQuiz(quiz.id)}
                      >
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Take Quiz
                      </Button>
                    )}

                    {state === 'in_progress' && (
                      <Button
                        size="sm"
                        onClick={() => handleResumeQuiz(quizInfo.quiz_id!)}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        Resume Quiz
                      </Button>
                    )}

                    {state === 'completed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewResults(quizInfo.quiz_id!)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        View Results
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
