'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuizResults, useQuizViolations, useReinstateQuiz } from '@/lib/hooks/useQuiz';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { AlertCircle, CheckCircle2, XCircle, TrophyIcon, ArrowLeft, AlertTriangle, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function QuizResultsPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);
  const quizId = parseInt(params.quizId as string);

  const { data, isLoading, error } = useQuizResults(quizId);
  const { data: violationsData } = useQuizViolations(quizId);
  const reinstateQuizMutation = useReinstateQuiz();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 mb-6" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Results not found"
          description="The quiz results you're looking for don't exist or the quiz hasn't been completed yet."
          icon={<AlertCircle className="h-12 w-12" />}
        />
      </div>
    );
  }

  const { quiz, questions, bloom_stats, clo_stats } = data;

  // Prepare chart data
  const bloomChartData = Object.entries(bloom_stats).map(([level, stats]) => ({
    name: level.charAt(0).toUpperCase() + level.slice(1),
    'Success Rate': stats.success_rate,
    Total: stats.total,
    Correct: stats.correct,
  }));

  const cloChartData = Object.entries(clo_stats).map(([clo, stats]) => ({
    name: clo,
    'Success Rate': stats.success_rate,
    Total: stats.total,
    Correct: stats.correct,
  }));

  const correctCount = questions.filter((q) => q.is_correct === true).length;
  const totalCount = questions.length;
  const score = quiz.score ?? 0;
  const scoreColor = score >= 70 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.push(`/courses/${courseId}/chapters/${chapterId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Chapter
        </Button>
      </div>

      <h1 className="text-3xl font-bold mb-6">Quiz Results</h1>

      {/* Disqualification Banner (teacher view) */}
      {quiz.is_disqualified && (
        <Card className="mb-6 border-red-300 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div>
                  <p className="font-bold text-red-800 text-lg">Student Disqualified</p>
                  <p className="text-red-700 text-sm">
                    This quiz was disqualified due to exam violations.
                    {quiz.disqualified_at && (
                      <> Disqualified at {new Date(quiz.disqualified_at).toLocaleString()}.</>
                    )}
                  </p>
                  {violationsData && violationsData.violations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {violationsData.violations.map((v) => (
                        <Badge key={v.id} variant={v.is_warning ? 'outline' : 'destructive'} className="text-xs">
                          {v.violation_type.replace(/_/g, ' ')} ({v.is_warning ? 'warning' : 'disqualified'})
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                className="border-red-400 text-red-700 hover:bg-red-100"
                onClick={() => reinstateQuizMutation.mutate(quizId)}
                disabled={reinstateQuizMutation.isPending}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {reinstateQuizMutation.isPending ? 'Reinstating...' : 'Reinstate Student'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overall Score Card */}
      <Card className="mb-6">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                {quiz.is_disqualified ? 'Disqualified Score' : 'Your Score'}
              </h2>
              <p className={`text-5xl font-bold ${scoreColor}`}>{score}%</p>
              <p className="text-muted-foreground mt-2">
                {correctCount} out of {totalCount} questions correct
              </p>
              {quiz.is_disqualified && (
                <Badge variant="destructive" className="mt-2">Disqualified</Badge>
              )}
              {quiz.feedback && (
                <p className="text-sm text-muted-foreground mt-4">{quiz.feedback}</p>
              )}
            </div>
            {quiz.is_disqualified ? (
              <XCircle className="h-24 w-24 text-red-600" />
            ) : (
              <TrophyIcon className={`h-24 w-24 ${scoreColor}`} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Statistics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Bloom Taxonomy Statistics */}
        {Object.keys(bloom_stats).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bloom Taxonomy Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-6">
                {Object.entries(bloom_stats).map(([level, stats]) => (
                  <div key={level}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium capitalize">{level}</span>
                      <span className="text-sm text-muted-foreground">
                        {stats.correct}/{stats.total} ({stats.success_rate}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${stats.success_rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={bloomChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="Success Rate" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Competence Statistics (CLO or AAA depending on norms) */}
        {Object.keys(clo_stats).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                {Object.keys(clo_stats).some((k) => k.toUpperCase().includes('AAA'))
                  ? 'AAA Performance'
                  : 'CLO Performance'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-6">
                {Object.entries(clo_stats).map(([clo, stats]) => (
                  <div key={clo}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">{clo}</span>
                      <span className="text-sm text-muted-foreground">
                        {stats.correct}/{stats.total} ({stats.success_rate}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${stats.success_rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cloChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="Success Rate" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

        {/* Question Review */}
      <Card>
        <CardHeader>
          <CardTitle>Question Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {questions.map((question, idx) => (
            <div key={idx} className="border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold">Q{idx + 1}.</span>
                  <Badge variant="outline">{question.bloom_level}</Badge>
                  <Badge variant="outline">{question.difficulty}</Badge>
                  {question.clo && (
                    <Badge variant="secondary">
                      {question.clo.toUpperCase().startsWith('CLO') && Object.keys(clo_stats).some((k) => k.toUpperCase().includes('AAA'))
                        ? question.clo.replace(/^CLO/i, 'AAA')
                        : question.clo}
                    </Badge>
                  )}
                </div>
                {question.is_correct === true ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : question.is_correct === false ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <Badge variant="secondary">Pending</Badge>
                )}
              </div>

              {/* Question Text */}
              <div className="mb-4">
                <p className="font-medium mb-2">Question:</p>
                <div className="text-sm whitespace-pre-wrap">
                  {question.question_text}
                </div>
              </div>

              {/* Student's Answer */}
              <div className="mb-4">
                <p className="font-medium mb-2">Your Answer:</p>
                <div
                  className={`p-3 rounded-lg ${
                    question.is_correct === true
                      ? 'bg-green-50 border border-green-200'
                      : question.is_correct === false
                      ? 'bg-red-50 border border-red-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}
                >
                  {question.question_type === 'mcq' ? (
                    <span className="font-medium">{question.student_choice}</span>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{question.student_choice || 'No answer provided'}</p>
                  )}
                </div>
              </div>

              {/* Correct Answer (for MCQ) */}
              {question.question_type === 'mcq' && question.correct_choice && (
                <div className="mb-4">
                  <p className="font-medium mb-2">Correct Answer:</p>
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <span className="font-medium">{question.correct_choice}</span>
                  </div>
                </div>
              )}

              {/* Explanation */}
              {question.explanation && (
                <div>
                  <p className="font-medium mb-2">Explanation:</p>
                  <div className="text-sm text-muted-foreground p-3 rounded-lg bg-blue-50 border border-blue-200 whitespace-pre-wrap">
                    {question.explanation}
                  </div>
                </div>
              )}

              {question.is_correct === null && question.question_type === 'open_ended' && (
                <div className="mt-4">
                  <Badge variant="secondary">This open-ended question is pending teacher review</Badge>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <Button onClick={() => router.push(`/courses/${courseId}/chapters/${chapterId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Chapter
        </Button>
      </div>
    </div>
  );
}
