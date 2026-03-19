'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';
import { SectionQuiz, SubmitQuizResponse } from '@/lib/types/references';
import { useSubmitSectionQuiz } from '@/lib/hooks/useReferences';
import { BookOpen, Clock, X, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SurveyQuizPlayerProps {
  sectionId: number;
  quiz: SectionQuiz;
  surveyJson: Record<string, unknown>;
  attemptsUsed: number;
  onClose: () => void;
}

export default function SurveyQuizPlayer({
  sectionId,
  quiz,
  surveyJson,
  attemptsUsed,
  onClose,
}: SurveyQuizPlayerProps) {
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitQuizResponse | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(
    quiz.duration_minutes ? quiz.duration_minutes * 60 : null
  );
  const pendingAnswersRef = useRef<Record<string, string>>({});

  const submitMutation = useSubmitSectionQuiz(sectionId);

  const handleSubmit = (answers: Record<string, string>) => {
    submitMutation.mutate(answers, {
      onSuccess: (data) => {
        setSubmitted(true);
        setResult(data);
      },
    });
  };

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || submitted) return;
    if (timeLeft <= 0) {
      handleSubmit(pendingAnswersRef.current);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => (t ?? 1) - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, submitted]);

  const surveyModel = useMemo(() => {
    const m = new Model(surveyJson);
    m.showProgressBar = 'top';
    m.showCompletedPage = false;
    m.onValueChanged.add((sender) => {
      pendingAnswersRef.current = sender.data as Record<string, string>;
    });
    m.onComplete.add((sender) => {
      const rawData = sender.data as Record<string, unknown>;
      const answers: Record<string, string> = {};
      Object.entries(rawData).forEach(([name, val]) => {
        const qId = name.replace(/^q_/, '');
        answers[qId] = Array.isArray(val) ? val.join(',') : String(val);
      });
      handleSubmit(answers);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Submitted state ───────────────────────────────────────────── */
  if (submitted) {
    const showFeedback = quiz.show_feedback !== false;
    const score = result?.score ?? 0;
    const maxScore = result?.max_score ?? quiz.max_score;
    const pct = maxScore ? Math.round((score / maxScore) * 100) : 0;
    const attemptsRemaining = result?.attempts_remaining ?? 0;

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
        <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500" />
        {showFeedback && result ? (
          <>
            <p className="font-bold text-lg text-bolt-ink">Quiz soumis !</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">
              {score.toFixed(1)} / {maxScore}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{pct}%</p>
          </>
        ) : (
          <>
            <p className="font-bold text-lg text-bolt-ink">Votre réponse a été soumise.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              L&apos;enseignant vous communiquera votre résultat.
            </p>
          </>
        )}
        {attemptsRemaining > 0 && (
          <Button className="mt-4 rounded-full" variant="outline" onClick={onClose}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Recommencer ({attemptsRemaining} tentative{attemptsRemaining > 1 ? 's' : ''} restante
            {attemptsRemaining > 1 ? 's' : ''})
          </Button>
        )}
        <Button className="mt-3 rounded-full" onClick={onClose}>
          Fermer
        </Button>
      </div>
    );
  }

  /* ── Full-screen quiz ──────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-bolt-line bg-white shadow-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-5 w-5 shrink-0 text-bolt-accent" />
          <span className="font-semibold text-bolt-ink text-sm truncate">{quiz.title}</span>
          <span className="hidden sm:block text-[11px] text-muted-foreground shrink-0">
            Tentative {attemptsUsed + 1}/{quiz.max_attempts ?? 1}
          </span>
        </div>
        {timeLeft !== null && (
          <div
            className={`flex items-center gap-1.5 font-mono text-sm font-bold shrink-0 ${
              timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-bolt-ink'
            }`}
          >
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft)}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 hover:bg-gray-100 text-gray-500 hover:text-bolt-ink"
          aria-label="Quitter"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Survey */}
      <div className="flex-1 overflow-auto">
        <Survey model={surveyModel} />
      </div>
    </div>
  );
}
