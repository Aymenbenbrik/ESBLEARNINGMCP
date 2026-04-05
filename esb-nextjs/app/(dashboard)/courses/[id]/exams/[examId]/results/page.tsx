'use client';
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useSessionResults, useExamResults, useAutoCorrect } from '@/lib/hooks/useExamBank';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Award, AlertTriangle, ArrowLeft, Users, TrendingUp, Target, Zap, Loader2 } from 'lucide-react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import { GradeSessionModal } from '@/components/courses/GradeSessionModal';
import { useState } from 'react';
import type { ExamSession } from '@/lib/types/exam-bank';
import { toast } from 'sonner';

// ── Student results view (session-based) ─────────────────────────────────────

function StudentResultsContent({ sessionId, courseId }: { sessionId: number; courseId: string }) {
  const { data: session, isLoading } = useSessionResults(sessionId);

  if (isLoading) return <LoadingSpinner />;

  if (!session) return (
    <div className="container mx-auto px-4 py-8 text-center">
      <p className="text-destructive">Session introuvable.</p>
      <Button asChild variant="outline" className="mt-4">
        <Link href={'/courses/' + courseId}>Retour au cours</Link>
      </Button>
    </div>
  );

  const exam = session.exam;
  const answers = session.answers || [];
  const questions = exam?.questions || [];
  const scorePercent = session.max_score ? ((session.score ?? 0) / session.max_score) * 100 : 0;
  const passed = scorePercent >= 50;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div className="text-center space-y-2">
        <div className={'h-20 w-20 rounded-full flex items-center justify-center mx-auto ' + (passed ? 'bg-green-100' : 'bg-red-100')}>
          <Award className={'h-10 w-10 ' + (passed ? 'text-green-500' : 'text-red-500')} />
        </div>
        <h1 className="text-2xl font-bold">{exam?.title}</h1>
        <p className="text-muted-foreground">Résultats de votre épreuve</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-blue-600">{(session.score ?? 0).toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">/ {(session.max_score ?? 0).toFixed(1)} pts</p>
            </div>
            <div>
              <p className={'text-3xl font-bold ' + (passed ? 'text-green-600' : 'text-red-500')}>{scorePercent.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">Score</p>
            </div>
            <div>
              <p className={'text-lg font-bold ' + (passed ? 'text-green-600' : 'text-red-500')}>{passed ? '✓ Réussi' : '✗ Insuffisant'}</p>
              <p className="text-xs text-muted-foreground">Résultat</p>
            </div>
          </div>
          <Progress value={scorePercent} className="h-3" />
          <div className="flex justify-center gap-6 text-sm text-muted-foreground">
            {session.time_spent_seconds != null && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {Math.floor(session.time_spent_seconds / 60)}min {session.time_spent_seconds % 60}s
              </span>
            )}
            {(session.violation_count ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                {session.violation_count} violation{(session.violation_count ?? 0) > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Correction détaillée</h2>
        {questions.map((question, idx) => {
          const answer = answers.find(a => a.question_id === question.id);
          const isCorrect = answer?.is_correct;
          const qScore = answer?.score ?? 0;
          return (
            <Card key={question.id} className={'border-l-4 ' + (isCorrect ? 'border-l-green-500' : qScore > 0 ? 'border-l-amber-500' : 'border-l-red-500')}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">Q{idx + 1}</span>
                    <Badge variant="outline" className="text-xs capitalize">{question.question_type.replace('_', ' ')}</Badge>
                  </div>
                  <Badge className={'text-xs ' + (isCorrect ? 'bg-green-100 text-green-700 border-green-200' : qScore > 0 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-red-100 text-red-700 border-red-200')}>
                    {isCorrect ? <CheckCircle className="h-3 w-3 mr-1 inline" /> : <XCircle className="h-3 w-3 mr-1 inline" />}
                    {qScore.toFixed(1)} / {question.points} pts
                  </Badge>
                </div>
                <p className="text-sm font-medium mt-1 whitespace-pre-line">{question.question_text}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {answer?.student_choice && (
                  <p><span className="text-muted-foreground">Votre réponse : </span>
                  <span className={isCorrect ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{answer.student_choice}</span></p>
                )}
                {answer?.student_answer && (
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-muted-foreground text-xs mb-1">Votre réponse :</p>
                    <p className="whitespace-pre-line">{answer.student_answer}</p>
                  </div>
                )}
                {(question as any).correct_choice && question.question_type !== 'open_ended' && (
                  <p className="text-green-600">Bonne réponse : <strong>{(question as any).correct_choice}</strong></p>
                )}
                {(question as any).answer && (
                  <div className="bg-green-50 rounded p-3 border border-green-200">
                    <p className="text-green-700 text-xs font-medium mb-1">Réponse modèle :</p>
                    <p className="whitespace-pre-line text-gray-700 text-sm">{(question as any).answer}</p>
                  </div>
                )}
                {answer?.ai_feedback && (
                  <div className="bg-blue-50 rounded p-3 border border-blue-200">
                    <p className="text-blue-700 text-xs font-medium mb-1">💡 Feedback IA :</p>
                    <p className="whitespace-pre-line text-gray-700 text-sm">{answer.ai_feedback}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center pb-8">
        <Button asChild variant="outline">
          <Link href={'/courses/' + courseId}><ArrowLeft className="h-4 w-4 mr-2" />Retour au cours</Link>
        </Button>
      </div>
    </div>
  );
}

// ── Teacher dashboard view ────────────────────────────────────────────────────

function TeacherDashboardContent({ examId, courseId }: { examId: string; courseId: string }) {
  const { data, isLoading } = useExamResults(parseInt(examId));
  const autoCorrectMutation = useAutoCorrect(parseInt(examId));
  const [gradingSession, setGradingSession] = useState<ExamSession | null>(null);

  if (isLoading) return <LoadingSpinner />;

  if (!data) return (
    <div className="container mx-auto px-4 py-8 text-center">
      <p className="text-destructive">Épreuve introuvable.</p>
      <Button asChild variant="outline" className="mt-4">
        <Link href={'/courses/' + courseId}>Retour au cours</Link>
      </Button>
    </div>
  );

  const { exam, total_sessions, submitted_count, graded_count, avg_score, pass_rate, sessions, stats_by_question } = data;

  // Score distribution histogram
  const buckets = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((low, i, arr) => {
    const high = arr[i + 1] ?? Infinity;
    const count = sessions.filter(s => s.score != null && s.score >= low && s.score < high).length;
    return { label: `${low}–${high === Infinity ? '+' : high}`, count };
  }).slice(0, -1);

  // Bloom distribution
  const bloomMap = new Map<string, { total: number; count: number }>();
  (stats_by_question ?? []).forEach(q => {
    if (!q.bloom_level) return;
    const cur = bloomMap.get(q.bloom_level) ?? { total: 0, count: 0 };
    cur.total += q.avg_score ?? 0;
    cur.count += 1;
    bloomMap.set(q.bloom_level, cur);
  });
  const bloomData = Array.from(bloomMap.entries()).map(([level, v]) => ({
    level,
    avg: v.count ? +(v.total / v.count).toFixed(2) : 0,
  }));

  const handleAutoCorrect = async () => {
    try {
      const result = await autoCorrectMutation.mutateAsync();
      toast.success(`${result.graded_count} session(s) corrigée(s) !`);
    } catch {
      toast.error('Erreur lors de la correction automatique');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href={'/courses/' + courseId}><ArrowLeft className="h-4 w-4 mr-1" />Retour au cours</Link>
          </Button>
          <h1 className="text-2xl font-bold">{exam.title}</h1>
          <p className="text-sm text-muted-foreground">Dashboard des résultats</p>
        </div>
        <Button
          onClick={handleAutoCorrect}
          disabled={autoCorrectMutation.isPending}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
        >
          {autoCorrectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Auto-corriger
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'Sessions', value: total_sessions, color: 'text-blue-600' },
          { icon: TrendingUp, label: 'Score moyen', value: `${avg_score.toFixed(1)} / ${exam.total_points}`, color: 'text-green-600' },
          { icon: Target, label: 'Taux de réussite', value: `${pass_rate.toFixed(0)}%`, color: 'text-purple-600' },
          { icon: CheckCircle, label: 'Notées', value: `${graded_count} / ${submitted_count}`, color: 'text-amber-600' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-3">
              <Icon className={'h-8 w-8 ' + color} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={'text-xl font-bold ' + color}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Score distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribution des scores</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={buckets} margin={{ left: -20 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bloom radar */}
        {bloomData.length > 2 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Score moyen par niveau Bloom</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={bloomData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="level" tick={{ fontSize: 11 }} />
                  <Radar name="Score" dataKey="avg" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Per-question stats */}
      {stats_by_question && stats_by_question.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Analyse par question</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Question</th>
                  <th className="py-2 pr-4">Bloom</th>
                  <th className="py-2 pr-4">Difficulté</th>
                  <th className="py-2 pr-4">Pts max</th>
                  <th className="py-2 pr-4">Moy.</th>
                  <th className="py-2">Taux réussite</th>
                </tr>
              </thead>
              <tbody>
                {stats_by_question.map((q, i) => (
                  <tr key={q.question_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-2 pr-4 max-w-[200px] truncate">Q{i + 1}: {q.question_text}</td>
                    <td className="py-2 pr-4">
                      {q.bloom_level && <Badge variant="outline" className="text-xs">{q.bloom_level}</Badge>}
                    </td>
                    <td className="py-2 pr-4">
                      {q.difficulty && <Badge variant="outline" className="text-xs">{q.difficulty}</Badge>}
                    </td>
                    <td className="py-2 pr-4 font-mono">{q.points}</td>
                    <td className="py-2 pr-4 font-mono">{(q.avg_score != null ? q.avg_score.toFixed(1) : "—")}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={q.total_answers ? (q.correct_count / q.total_answers) * 100 : 0}
                          className="h-2 w-16"
                        />
                        <span className="font-mono">
                          {q.total_answers ? Math.round((q.correct_count / q.total_answers) * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Sessions table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Sessions des étudiants</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground text-xs">
                <th className="py-2 pr-4">Étudiant</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Temps</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Aucune session</td></tr>
              ) : sessions.map(s => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="py-2 pr-4 font-medium">{s.student_name ?? `Étudiant #${s.student_id}`}</td>
                  <td className="py-2 pr-4 font-mono">
                    {s.score != null ? `${s.score.toFixed(1)} / ${s.max_score?.toFixed(1) ?? '?'}` : '—'}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {s.time_spent_seconds != null
                      ? `${Math.floor(s.time_spent_seconds / 60)}m${s.time_spent_seconds % 60}s`
                      : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge
                      variant="outline"
                      className={`text-xs ${s.status === 'graded' ? 'text-green-700 border-green-200' : s.status === 'submitted' ? 'text-amber-700 border-amber-200' : ''}`}
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="py-2">
                    {s.status !== 'started' && (
                      <Button size="sm" variant="outline" onClick={() => setGradingSession(s)}>
                        Corriger
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Grading modal */}
      {gradingSession && (
        <GradeSessionModal
          session={gradingSession}
          exam={exam}
          onClose={() => setGradingSession(null)}
        />
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center min-h-[400px]">
      <div className="animate-spin h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  );
}

// ── Page router — student vs teacher based on ?session= param ─────────────────

function ResultsContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.id as string;
  const examId = params.examId as string;
  const sessionId = parseInt(searchParams.get('session') || '0');

  if (sessionId > 0) {
    return <StudentResultsContent sessionId={sessionId} courseId={courseId} />;
  }
  return <TeacherDashboardContent examId={examId} courseId={courseId} />;
}

export default function ExamResultsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-[400px]"><div className="animate-spin h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent" /></div>}>
      <ResultsContent />
    </Suspense>
  );
}



