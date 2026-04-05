'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import {
  useExamResults,
  useAutoCorrect,
  useValidateScore,
  usePublishExam,
  useUnpublishExam,
  usePublishFeedbacks,
  useUpdateSessionFeedback,
} from '@/lib/hooks/useExamBank';
import type { ExamSession, ExamSessionAnswer } from '@/lib/types/exam-bank';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  Cell,
} from 'recharts';
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  TrendingUp,
  Bot,
  Eye,
  ChevronDown,
  ChevronRight,
  Award,
  Clock,
  Send,
  MessageSquare,
  BarChart3,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { PublishFeedbacksModal } from '@/components/courses/PublishFeedbacksModal';

const BLOOM_COLORS: Record<string, string> = {
  Remember: '#6366f1',
  Understand: '#8b5cf6',
  Apply: '#a78bfa',
  Analyze: '#c4b5fd',
  Evaluate: '#ddd6fe',
  Create: '#ede9fe',
  'Se souvenir': '#6366f1',
  Comprendre: '#8b5cf6',
  Appliquer: '#a78bfa',
  Analyser: '#c4b5fd',
  Évaluer: '#ddd6fe',
  Créer: '#ede9fe',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: '#22c55e',
  Medium: '#f59e0b',
  Hard: '#ef4444',
  Facile: '#22c55e',
  Moyen: '#f59e0b',
  Difficile: '#ef4444',
};

// ── Grade Session Modal ───────────────────────────────────────────────────────

interface GradeModalProps {
  session: ExamSession;
  examTotalPoints: number;
  onClose: () => void;
}

function GradeSessionModal({ session, examTotalPoints, onClose }: GradeModalProps) {
  const validateScore = useValidateScore(session.id);
  const [scores, setScores] = useState<Record<number, { score: string; feedback: string }>>({});

  const openAnswers = (session.answers ?? []).filter(
    a => a.student_answer || a.student_choice
  );

  const handleSave = async (answer: ExamSessionAnswer) => {
    const entry = scores[answer.question_id];
    if (!entry) return;
    const score = parseFloat(entry.score);
    if (isNaN(score)) return toast.error('Note invalide');
    try {
      await validateScore.mutateAsync({
        question_id: answer.question_id,
        score,
        feedback: entry.feedback,
      });
      toast.success('Note sauvegardée');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const initEntry = (answer: ExamSessionAnswer) => ({
    score: scores[answer.question_id]?.score ?? (answer.score?.toString() ?? ''),
    feedback: scores[answer.question_id]?.feedback ?? (answer.ai_feedback ?? ''),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Corriger — {session.student_name ?? `Étudiant #${session.student_id}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {openAnswers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucune réponse ouverte à corriger.
            </p>
          )}
          {openAnswers.map(answer => {
            const entry = initEntry(answer);
            return (
              <Card key={answer.id} className="border">
                <CardContent className="pt-4 space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">
                    Question #{answer.question_id}
                  </div>
                  <div className="bg-muted rounded p-3 text-sm whitespace-pre-wrap">
                    {answer.student_answer ?? answer.student_choice ?? '(sans réponse)'}
                  </div>
                  {answer.ai_feedback && (
                    <div className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded p-2">
                      <span className="font-semibold">Suggestion IA : </span>
                      {answer.ai_feedback}
                    </div>
                  )}
                  <div className="flex gap-3 items-end">
                    <div className="w-24">
                      <Label className="text-xs">Note</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={entry.score}
                        onChange={e =>
                          setScores(prev => ({
                            ...prev,
                            [answer.question_id]: { ...initEntry(answer), score: e.target.value },
                          }))
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Commentaire</Label>
                      <Textarea
                        rows={2}
                        placeholder="Commentaire..."
                        value={entry.feedback}
                        onChange={e =>
                          setScores(prev => ({
                            ...prev,
                            [answer.question_id]: { ...initEntry(answer), feedback: e.target.value },
                          }))
                        }
                        className="text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSave(answer)}
                      disabled={validateScore.isPending}
                    >
                      Valider
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Teacher Results Dashboard ─────────────────────────────────────────────────

export default function ExamDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const examId = Number(params.examId);

  const { data, isLoading, refetch } = useExamResults(examId);
  const autoCorrect = useAutoCorrect(examId);
  const publishExam = usePublishExam(courseId);
  const unpublishExam = useUnpublishExam(courseId);
  const updateFeedback = useUpdateSessionFeedback();

  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [gradingSession, setGradingSession] = useState<ExamSession | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [feedbackEdits, setFeedbackEdits] = useState<Record<number, string>>({});
  const [sortField, setSortField] = useState<'avg_score' | 'success_rate' | 'difficulty'>('avg_score');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Épreuve introuvable ou accès refusé.
      </div>
    );
  }

  const {
    exam,
    total_sessions,
    submitted_count,
    graded_count,
    avg_score,
    pass_rate,
    sessions,
    stats_by_question,
  } = data;

  const handleAutoCorrect = async () => {
    try {
      const res = await autoCorrect.mutateAsync();
      toast.success(`${res.graded_count} session(s) corrigées automatiquement`);
      refetch();
    } catch {
      toast.error('Erreur lors de la correction automatique');
    }
  };

  const handlePublishToggle = async () => {
    try {
      if (exam.is_available) {
        await unpublishExam.mutateAsync(examId);
        toast.success('Épreuve dépubliée');
      } else {
        await publishExam.mutateAsync(examId);
        toast.success('Épreuve publiée');
      }
      refetch();
    } catch {
      toast.error('Erreur lors du changement de statut');
    }
  };

  const handleSaveFeedback = async (sessionId: number) => {
    const feedback = feedbackEdits[sessionId];
    if (feedback === undefined) return;
    try {
      await updateFeedback.mutateAsync({ sessionId, data: { feedback } });
      toast.success('Feedback sauvegardé');
      refetch();
    } catch {
      toast.error('Erreur de sauvegarde');
    }
  };

  // Score distribution
  const scoreRanges = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'].map(range => ({
    range,
    count: 0,
  }));
  sessions
    .filter(s => s.score != null)
    .forEach(s => {
      const pct = ((s.score ?? 0) / exam.total_points) * 100;
      const idx = Math.min(Math.floor(pct / 20), 4);
      scoreRanges[idx].count++;
    });

  // Bloom radar data
  const bloomMap: Record<string, { count: number; totalScore: number; maxScore: number }> = {};
  stats_by_question.forEach(q => {
    if (q.bloom_level) {
      const b = bloomMap[q.bloom_level] ?? { count: 0, totalScore: 0, maxScore: 0 };
      b.count++;
      b.totalScore += q.avg_score ?? 0;
      b.maxScore += q.points;
      bloomMap[q.bloom_level] = b;
    }
  });
  const bloomRadarData = Object.entries(bloomMap).map(([bloom, v]) => ({
    bloom,
    performance: v.maxScore > 0 ? Math.round((v.totalScore / v.maxScore) * 100) : 0,
  }));

  // Difficulty bar data
  const diffMap: Record<string, { total: number; correct: number }> = {};
  stats_by_question.forEach(q => {
    if (q.difficulty) {
      const d = diffMap[q.difficulty] ?? { total: 0, correct: 0 };
      d.total += q.total_answers;
      d.correct += q.correct_count;
      diffMap[q.difficulty] = d;
    }
  });
  const diffBarData = Object.entries(diffMap).map(([difficulty, v]) => ({
    difficulty,
    success_rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
  }));

  // CLO bar data
  const cloMap: Record<string, { total: number; correct: number }> = {};
  stats_by_question.forEach(q => {
    if (q.clo) {
      const c = cloMap[q.clo] ?? { total: 0, correct: 0 };
      c.total += q.total_answers;
      c.correct += q.correct_count;
      cloMap[q.clo] = c;
    }
  });
  const cloBarData = Object.entries(cloMap).map(([clo, v]) => ({
    clo,
    success_rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
  }));

  // Sorted questions
  const sortedQuestions = [...stats_by_question].sort((a, b) => {
    if (sortField === 'avg_score') return (b.avg_score ?? 0) - (a.avg_score ?? 0);
    if (sortField === 'success_rate') {
      const ra = a.total_answers > 0 ? a.correct_count / a.total_answers : 0;
      const rb = b.total_answers > 0 ? b.correct_count / b.total_answers : 0;
      return rb - ra;
    }
    return (a.difficulty ?? '').localeCompare(b.difficulty ?? '');
  });

  // Ranked sessions
  const rankedSessions = [...sessions]
    .filter(s => s.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((s, i) => ({ ...s, rank: i + 1 }));
  const unranked = sessions.filter(s => s.score == null);
  const allSessionsRanked = [...rankedSessions, ...unranked.map(s => ({ ...s, rank: null as number | null }))];

  const gradedSessions = sessions.filter(s => s.status === 'graded');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/courses/${courseId}?tab=epreuve_exam`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Retour
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{exam.title}</h1>
            <p className="text-sm text-muted-foreground">
              Dashboard des résultats •{' '}
              <Badge variant={exam.is_available ? 'default' : 'secondary'} className="text-xs">
                {exam.is_available ? '🌐 Publié' : '🔒 Brouillon'}
              </Badge>
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePublishToggle}
            disabled={publishExam.isPending || unpublishExam.isPending}
          >
            {exam.is_available ? '🔒 Dépublier' : '🌐 Publier'}
          </Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleAutoCorrect}
            disabled={autoCorrect.isPending}
          >
            <Bot className="h-4 w-4 mr-1" />
            {autoCorrect.isPending ? 'Correction...' : 'Correction automatique'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Aperçu
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-2">
            <Target className="h-4 w-4" /> Questions
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <Users className="h-4 w-4" /> Sessions
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-2">
            <MessageSquare className="h-4 w-4" /> Feedback
          </TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{total_sessions}</p>
                  <p className="text-xs text-muted-foreground">Participants</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{graded_count}</p>
                  <p className="text-xs text-muted-foreground">Corrigés / {submitted_count} soumis</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{avg_score.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Moyenne / {exam.total_points} pts</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 flex items-center gap-3">
                <Award className="h-8 w-8 text-violet-500" />
                <div>
                  <p className="text-2xl font-bold">{pass_rate}%</p>
                  <p className="text-xs text-muted-foreground">Taux de réussite</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Score distribution + Bloom Radar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribution des notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={scoreRanges}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Étudiants" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {bloomRadarData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Performance Bloom</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={bloomRadarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="bloom" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Radar name="Performance" dataKey="performance" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} />
                      <Tooltip formatter={(v: unknown) => [`${String(v)}%`, 'Performance']} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Difficulty + CLO charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {diffBarData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Taux de réussite par difficulté</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={diffBarData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="difficulty" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                      <Tooltip formatter={(v: unknown) => [`${String(v)}%`, 'Réussite']} />
                      <Bar dataKey="success_rate" name="Taux réussite" radius={[4, 4, 0, 0]}>
                        {diffBarData.map((entry, idx) => (
                          <Cell key={idx} fill={DIFFICULTY_COLORS[entry.difficulty] ?? '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {cloBarData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Performance par CLO</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={cloBarData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="clo" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                      <Tooltip formatter={(v: unknown) => [`${String(v)}%`, 'Réussite']} />
                      <Bar dataKey="success_rate" name="Taux réussite" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── QUESTIONS TAB ── */}
        <TabsContent value="questions">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Statistiques par question ({stats_by_question.length})</CardTitle>
              <div className="flex gap-2 text-xs">
                <span className="text-muted-foreground">Trier :</span>
                {(['avg_score', 'success_rate', 'difficulty'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setSortField(f)}
                    className={`px-2 py-1 rounded border ${sortField === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    {f === 'avg_score' ? 'Moyenne' : f === 'success_rate' ? 'Réussite' : 'Difficulté'}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {sortedQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aucune statistique disponible.
                </p>
              ) : (
                <div className="space-y-2">
                  {sortedQuestions.map((q, i) => {
                    const successRate = q.total_answers > 0
                      ? Math.round((q.correct_count / q.total_answers) * 100)
                      : null;
                    return (
                      <div key={q.question_id} className="flex items-center gap-3 text-sm border rounded p-2">
                        <span className="w-6 text-right font-mono text-xs text-muted-foreground shrink-0">
                          {i + 1}
                        </span>
                        <span className="flex-1 truncate text-sm">{q.question_text}</span>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {q.bloom_level && (
                            <Badge
                              variant="outline"
                              style={{ borderColor: BLOOM_COLORS[q.bloom_level] ?? undefined, fontSize: '10px' }}
                            >
                              {q.bloom_level}
                            </Badge>
                          )}
                          {q.difficulty && (
                            <Badge
                              variant="outline"
                              style={{ borderColor: DIFFICULTY_COLORS[q.difficulty] ?? undefined, fontSize: '10px' }}
                            >
                              {q.difficulty}
                            </Badge>
                          )}
                          {q.clo && (
                            <Badge variant="outline" className="text-xs bg-blue-50">
                              {q.clo}
                            </Badge>
                          )}
                          <span className="text-xs font-mono w-16 text-right">
                            {q.avg_score != null ? `Moy: ${typeof q.avg_score === 'number' ? q.avg_score.toFixed(1) : q.avg_score}` : '—'}
                          </span>
                          <div className="w-20">
                            <Progress
                              value={successRate ?? 0}
                              className="h-2"
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-16 text-right">
                            {successRate != null ? `${successRate}%` : '—'} ({q.correct_count}/{q.total_answers})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SESSIONS TAB ── */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions étudiants ({sessions.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sessions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aucune session pour le moment.
                </p>
              )}
              {allSessionsRanked.map(session => {
                const isExpanded = expandedSession === session.id;
                const pct =
                  session.score != null && exam.total_points > 0
                    ? (session.score / exam.total_points) * 100
                    : null;
                return (
                  <div key={session.id} className="border rounded-lg overflow-hidden">
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      {session.rank != null && (
                        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">
                          #{session.rank}
                        </span>
                      )}
                      <span className="flex-1 font-medium text-sm">
                        {session.student_name ?? `Étudiant #${session.student_id}`}
                      </span>
                      <Badge
                        variant={
                          session.status === 'graded'
                            ? 'default'
                            : session.status === 'submitted'
                            ? 'secondary'
                            : 'outline'
                        }
                        className="text-xs"
                      >
                        {session.status === 'graded'
                          ? '✓ Corrigé'
                          : session.status === 'submitted'
                          ? '⏳ Soumis'
                          : session.status === 'started'
                          ? '🔄 En cours'
                          : session.status}
                      </Badge>
                      {session.time_spent_seconds != null && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.floor(session.time_spent_seconds / 60)}m
                        </span>
                      )}
                      {session.score != null && (
                        <span className="text-sm font-mono w-20 text-right">
                          {session.score.toFixed(1)}/{exam.total_points}
                        </span>
                      )}
                      {pct != null && (
                        <div className="w-24">
                          <Progress value={pct} className="h-2" />
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 shrink-0"
                        onClick={e => {
                          e.stopPropagation();
                          setGradingSession(session);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Corriger
                      </Button>
                    </div>

                    {isExpanded && session.answers && (
                      <div className="border-t px-4 py-3 bg-muted/10 space-y-2">
                        {session.answers.map(a => (
                          <div key={a.id} className="text-xs flex gap-2 items-start">
                            <span className="text-muted-foreground font-mono w-8 shrink-0">
                              Q{a.question_id}
                            </span>
                            <span className="flex-1 break-words">
                              {a.student_answer ?? a.student_choice ?? '—'}
                            </span>
                            {a.is_correct != null && (
                              <Badge
                                variant={a.is_correct ? 'default' : 'destructive'}
                                className="text-xs shrink-0"
                              >
                                {a.is_correct ? '✓' : '✗'}
                              </Badge>
                            )}
                            {a.score != null && (
                              <span className="font-mono shrink-0">{a.score}pt</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FEEDBACK TAB ── */}
        <TabsContent value="feedback">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">
                Feedback ({gradedSessions.length} corrigé(s))
              </CardTitle>
              <Button
                size="sm"
                onClick={() => setShowPublishModal(true)}
                disabled={gradedSessions.length === 0}
              >
                <Send className="h-4 w-4 mr-2" />
                Publier feedbacks
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {gradedSessions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aucune session corrigée pour le moment.
                </p>
              )}
              {gradedSessions.map(session => {
                const fbValue = feedbackEdits[session.id] ?? session.feedback ?? '';
                return (
                  <div key={session.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {session.student_name ?? `Étudiant #${session.student_id}`}
                      </span>
                      <div className="flex items-center gap-2">
                        {session.feedback_published && (
                          <Badge className="text-xs bg-green-100 text-green-800 border-green-200">
                            ✓ Publié
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">
                          {session.score?.toFixed(1)}/{session.max_score}
                        </span>
                      </div>
                    </div>
                    <Textarea
                      rows={3}
                      value={fbValue}
                      onChange={e =>
                        setFeedbackEdits(prev => ({ ...prev, [session.id]: e.target.value }))
                      }
                      placeholder="Feedback pour l'étudiant..."
                      className="text-sm"
                    />
                    {feedbackEdits[session.id] !== undefined && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleSaveFeedback(session.id)}
                          disabled={updateFeedback.isPending}
                        >
                          Sauvegarder
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Grade modal */}
      {gradingSession && (
        <GradeSessionModal
          session={gradingSession}
          examTotalPoints={exam.total_points}
          onClose={() => {
            setGradingSession(null);
            refetch();
          }}
        />
      )}

      {/* Publish feedbacks modal */}
      {showPublishModal && (
        <PublishFeedbacksModal
          examId={examId}
          sessions={sessions}
          onClose={() => setShowPublishModal(false)}
          onPublished={() => refetch()}
        />
      )}
    </div>
  );
}