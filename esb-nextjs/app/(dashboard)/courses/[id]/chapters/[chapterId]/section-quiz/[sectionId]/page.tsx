'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, BookOpen, Clock, Send, X, AlertTriangle, CheckCircle2, Loader2, ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/hooks/useAuth';
import { useChapter } from '@/lib/hooks/useChapters';
import { useTakeQuiz, useSubmitSectionQuiz, useSurveyJson } from '@/lib/hooks/useReferences';
import { SectionQuizQuestion } from '@/lib/types/references';

const SurveyQuizPlayer = dynamic(() => import('@/components/chapters/SurveyQuizPlayer'), { ssr: false });

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function QuizTaker({ sectionId, onDone }: { sectionId: number; onDone: () => void }) {
  const { data: takeData, isLoading, error } = useTakeQuiz(sectionId);
  const { data: surveyJson } = useSurveyJson(sectionId);
  const submitMutation = useSubmitSectionQuiz(sectionId);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const quiz = takeData?.quiz;

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error || !takeData) {
    const errMsg = (error as any)?.response?.data?.error;
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
        <p className="font-medium text-bolt-ink">{errMsg || 'Quiz indisponible'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {errMsg?.includes('attempts') ? 'Vous avez atteint le nombre maximal de tentatives.' : 'Le quiz n\'est pas encore publié.'}
        </p>
      </div>
    );
  }

  if (submitted && result) {
    const pct = result.percent ?? (result.max_score ? Math.round((result.score / result.max_score) * 100) : 0);
    const passed = pct >= 50; // default 50% threshold
    return (
      <div className="py-12 text-center">
        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${passed ? 'bg-emerald-100' : 'bg-red-100'}`}>
          {passed
            ? <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            : <X className="h-8 w-8 text-red-500" />}
        </div>
        <p className="text-2xl font-bold text-bolt-ink">{result.score?.toFixed(1)} / {result.max_score}</p>
        <p className={`text-sm font-semibold mt-1 ${passed ? 'text-emerald-600' : 'text-red-600'}`}>
          {pct}% — {passed ? 'Réussi ✓' : 'Non réussi'}
        </p>
        <Button className="mt-6 rounded-full" onClick={onDone}>
          Retour
        </Button>
      </div>
    );
  }

  // Use SurveyJS player if surveyJson exists
  if (surveyJson?.survey_json && quiz) {
    return (
      <SurveyQuizPlayer
        sectionId={sectionId}
        quiz={quiz as any}
        surveyJson={surveyJson.survey_json}
        attemptsUsed={takeData.attempts_used ?? 0}
        onClose={onDone}
      />
    );
  }

  // Classic MCQ flow
  const questions: SectionQuizQuestion[] = takeData?.questions ?? [];
  if (!questions.length) return (
    <div className="py-12 text-center text-sm text-muted-foreground">Aucune question disponible.</div>
  );

  const q = questions[currentQ];
  const qId = String(q.id);
  const isLast = currentQ === questions.length - 1;
  const answeredCount = questions.filter((qu) => !!answers[String(qu.id)]).length;

  const handleSubmit = () => {
    submitMutation.mutate(answers, {
      onSuccess: (data) => { setSubmitted(true); setResult(data); }
    });
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Progress */}
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mb-6">
        <div
          className="h-1.5 bg-blue-600 transition-all rounded-full"
          style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="flex gap-4">
        {/* Sidebar */}
        <div className="hidden sm:flex w-16 flex-col items-center gap-1.5 shrink-0">
          {questions.map((qu, idx) => (
            <button
              key={qu.id}
              type="button"
              onClick={() => setCurrentQ(idx)}
              className={`h-7 w-7 rounded-lg text-xs font-bold transition-colors ${
                idx === currentQ ? 'bg-blue-600 text-white shadow-sm'
                : answers[String(qu.id)] ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : 'bg-white border border-bolt-line text-gray-400 hover:border-blue-300'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        {/* Question */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Question {currentQ + 1} / {questions.length} — {answeredCount} répondue{answeredCount > 1 ? 's' : ''}
          </p>
          <p className="text-base font-medium text-bolt-ink mb-5">
            <span className="mr-1.5 text-blue-600 font-bold">Q{currentQ + 1}.</span>
            {q.question_text}
          </p>

          {/* MCQ choices */}
          {(q.question_type === 'mcq' || q.question_type === 'true_false' || !q.question_type) && (
            <div className="space-y-2.5">
              {(['a', 'b', 'c', 'd'] as const).map((k) => {
                const text = q[`choice_${k}` as keyof SectionQuizQuestion] as string | null;
                if (!text) return null;
                const chosen = answers[qId] === k;
                return (
                  <button key={k} type="button" onClick={() => setAnswers((p) => ({ ...p, [qId]: k }))}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                      chosen ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-transparent bg-gray-50 hover:border-blue-200 hover:bg-gray-100'
                    }`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
                      chosen ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 text-gray-500'
                    }`}>{k.toUpperCase()}</span>
                    <span>{text}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Open / Code / Drag-drop */}
          {(q.question_type === 'open_ended' || q.question_type === 'code' || q.question_type === 'drag_drop') && (
            <textarea
              rows={q.question_type === 'code' ? 8 : 5}
              placeholder={q.question_type === 'code' ? '// Écrivez votre code ici…' : 'Écrivez votre réponse…'}
              value={answers[qId] ?? ''}
              onChange={(e) => setAnswers((p) => ({ ...p, [qId]: e.target.value }))}
              className={`w-full rounded-xl border border-bolt-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 resize-none ${q.question_type === 'code' ? 'font-mono text-xs' : ''}`}
            />
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" className="rounded-full"
              disabled={currentQ === 0} onClick={() => setCurrentQ((i) => i - 1)}>
              ← Précédent
            </Button>
            <div className="flex-1" />
            {isLast ? (
              <Button type="button" size="sm" className="rounded-full bg-blue-600 hover:bg-blue-700"
                disabled={submitMutation.isPending} onClick={handleSubmit}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {submitMutation.isPending ? 'Envoi…' : 'Soumettre'}
              </Button>
            ) : (
              <Button type="button" size="sm" className="rounded-full"
                onClick={() => setCurrentQ((i) => i + 1)}>
                Suivant →
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Exit confirm overlay */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 rounded-2xl bg-white p-6 shadow-xl max-w-sm w-full">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
            <p className="text-center font-semibold">Quitter le quiz ?</p>
            <p className="mt-1 text-center text-sm text-muted-foreground">Vos réponses ne seront pas enregistrées.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-full" onClick={() => setShowExitConfirm(false)}>Continuer</Button>
              <Button variant="destructive" className="flex-1 rounded-full" onClick={onDone}>Quitter</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SectionQuizPage() {
  const params = useParams();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);
  const sectionId = parseInt(params.sectionId as string);

  const { user } = useAuth();
  const { data: chapterData } = useChapter(chapterId);
  const { data: takeData, isLoading } = useTakeQuiz(sectionId, undefined, !user?.is_teacher);

  const [started, setStarted] = useState(false);
  const backHref = `/courses/${courseId}/chapters/${chapterId}`;
  const quiz = takeData?.quiz;

  if (user?.is_teacher) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-bolt-ink mb-6 no-underline transition-colors">
          <ArrowLeft className="h-4 w-4" /> Retour au chapitre
        </Link>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-blue-600/60" />
          <h2 className="font-bold text-bolt-ink mb-2">Gestion du Quiz</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Les quizz sont gérés depuis la page principale du chapitre (onglet sections).
          </p>
          <Link href={backHref}>
            <Button variant="outline" className="rounded-full">
              Gérer depuis le chapitre
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-bolt-ink mb-6 no-underline transition-colors">
        <ArrowLeft className="h-4 w-4" /> Retour au chapitre
      </Link>

      <div className="rounded-2xl border border-blue-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-blue-100 bg-blue-50/40">
          <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <h1 className="font-bold text-bolt-ink leading-tight">
              {isLoading ? 'Quiz' : quiz?.title ?? 'Quiz'}
            </h1>
            {chapterData?.chapter && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Consolidation des Acquis — {chapterData.chapter.title}
              </p>
            )}
          </div>
        </div>

        <div className="p-6">
          {!started ? (
            /* Quiz overview */
            <div className="text-center py-6">
              {isLoading ? (
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              ) : quiz ? (
                <>
                  <div className="inline-flex flex-wrap justify-center gap-4 mb-6">
                    {quiz.max_attempts && (
                      <div className="rounded-xl bg-blue-50 px-4 py-2 text-center">
                        <p className="text-lg font-bold text-blue-700">{takeData?.attempts_used ?? 0}/{quiz.max_attempts}</p>
                        <p className="text-xs text-muted-foreground">Tentatives utilisées</p>
                      </div>
                    )}
                    {quiz.duration_minutes && (
                      <div className="rounded-xl bg-gray-50 px-4 py-2 text-center">
                        <p className="text-lg font-bold text-bolt-ink flex items-center gap-1 justify-center">
                          <Clock className="h-4 w-4" />{quiz.duration_minutes} min
                        </p>
                        <p className="text-xs text-muted-foreground">Durée</p>
                      </div>
                    )}
                    {quiz.max_score && (
                      <div className="rounded-xl bg-gray-50 px-4 py-2 text-center">
                        <p className="text-lg font-bold text-bolt-ink">{quiz.max_score} pts</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                    )}
                  </div>
                  <Button
                    className="rounded-full px-8 bg-blue-600 hover:bg-blue-700"
                    onClick={() => setStarted(true)}
                  >
                    Commencer le quiz
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Quiz indisponible.</p>
              )}
            </div>
          ) : (
            <QuizTaker sectionId={sectionId} onDone={() => setStarted(false)} />
          )}
        </div>
      </div>
    </div>
  );
}
