'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Send, Loader2, CheckCircle, Clock,
  AlertCircle, XCircle, SkipForward, Flag, MessageSquareCode,
} from 'lucide-react';
import { useTP, useMySubmission, useSubmitCode } from '@/lib/hooks/usePracticalWork';
import { practicalWorkApi } from '@/lib/api/practicalWork';
import { StatementRenderer } from '@/components/tp/StatementRenderer';
import { SafeExamWrapper } from '@/components/tp/SafeExamWrapper';
import { TPChatbot } from '@/components/tp/TPChatbot';
import type { CorrectionStatus, TPQuestion } from '@/lib/types/practicalWork';
import { toast } from 'sonner';

const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python', sql: 'SQL', r: 'R', java: 'Java', c: 'C', cpp: 'C++',
};

const LANG_PLACEHOLDER: Record<string, string> = {
  python: '# Votre solution Python ici\n',
  sql:    '-- Votre requête SQL ici\n',
  r:      '# Votre code R ici\n',
  java:   '// Votre code Java ici\n',
  c:      '// Votre code C ici\n#include <stdio.h>\n\nint main() {\n    // TODO\n    return 0;\n}\n',
  cpp:    '// Votre code C++ ici\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // TODO\n    return 0;\n}\n',
};

function CorrectionStatusBadge({ status }: { status: CorrectionStatus }) {
  const cfg: Record<CorrectionStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    pending:    { label: 'En attente', icon: <Clock className="w-3 h-3" />, cls: 'bg-yellow-100 text-yellow-800' },
    correcting: { label: 'Correction…', icon: <Loader2 className="w-3 h-3 animate-spin" />, cls: 'bg-blue-100 text-blue-800' },
    done:       { label: 'Corrigé ✓', icon: <CheckCircle className="w-3 h-3" />, cls: 'bg-green-100 text-green-800' },
    failed:     { label: 'Échec', icon: <XCircle className="w-3 h-3" />, cls: 'bg-red-100 text-red-800' },
  };
  const c = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Question {current + 1} / {total}</span>
        <span>{pct}% complété</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rose-600 to-rose-800 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-1 mt-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full transition-colors ${
              i < current ? 'bg-rose-800' : i === current ? 'bg-rose-400' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionView({
  question,
  language,
  tpId,
  tpNature,
  code,
  onCodeChange,
  onNext,
  onSkip,
  onSubmitTP,
  isSubmitting,
  isLast,
}: {
  question: TPQuestion;
  language: string;
  tpId: number;
  tpNature: 'formative' | 'sommative';
  code: string;
  onCodeChange: (c: string) => void;
  onNext: () => void;
  onSkip: () => void;
  onSubmitTP: () => void;
  isSubmitting: boolean;
  isLast: boolean;
}) {
  const [loadingStarter, setLoadingStarter] = useState(false);

  const handleInsertComment = async () => {
    setLoadingStarter(true);
    try {
      const result = await practicalWorkApi.getQuestionStarter(tpId, question.id, question.text);
      const starter = result.starter_code || result.comment_header || '';
      if (!code.trim()) {
        onCodeChange(starter);
      } else {
        onCodeChange(result.comment_header + '\n\n' + code);
      }
      toast.success('Énoncé inséré');
    } catch {
      toast.error('Erreur lors de la génération');
    } finally {
      setLoadingStarter(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-rose-800 text-white text-sm font-bold flex items-center justify-center shrink-0">
              {question.id}
            </div>
            <h2 className="text-base font-semibold text-gray-900">{question.title}</h2>
          </div>
          <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800">
            {question.points} pt{question.points > 1 ? 's' : ''}
          </span>
        </div>
        <StatementRenderer content={question.text} className="mt-2" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-700">
          <span className="text-xs text-gray-400 font-mono">{LANGUAGE_LABELS[language] ?? language}</span>
          <button
            onClick={handleInsertComment}
            disabled={loadingStarter || isSubmitting}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
          >
            {loadingStarter ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquareCode className="w-3 h-3" />}
            Insérer énoncé
          </button>
        </div>
        <textarea
          value={code}
          onChange={e => onCodeChange(e.target.value)}
          disabled={isSubmitting}
          rows={14}
          spellCheck={false}
          placeholder={LANG_PLACEHOLDER[language] ?? '// Votre code ici\n'}
          className="w-full bg-gray-900 text-green-400 font-mono text-sm px-4 py-3 resize-none focus:outline-none placeholder:text-gray-600 disabled:opacity-60"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          disabled={isSubmitting}
          className="flex items-center gap-2 border border-gray-300 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          title="Passer cette question (note 0)"
        >
          <SkipForward className="w-4 h-4" />
          Passer
        </button>

        <div className="flex-1" />

        {isLast ? (
          <button
            onClick={onSubmitTP}
            disabled={isSubmitting}
            className="flex items-center gap-2 bg-rose-800 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-rose-900 transition-colors disabled:opacity-50 shadow-sm"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
            Soumettre le TP
          </button>
        ) : (
          <button
            onClick={onNext}
            disabled={isSubmitting}
            className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Question suivante
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {tpNature === 'formative' && (
        <TPChatbot
          tpId={tpId}
          questionId={question.id}
          questionText={question.text}
          currentCode={code}
        />
      )}
    </div>
  );
}

function ResultsView({
  submission,
  tp,
  questions,
  onRetry,
}: {
  submission: any;
  tp: any;
  questions: TPQuestion[] | null;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {submission.proposed_grade !== null && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
            <p className="text-xs text-blue-600 font-medium mb-1">Note proposée (IA)</p>
            <p className="text-3xl font-bold text-blue-800">
              {submission.proposed_grade}
              <span className="text-sm font-normal text-blue-600">/{tp.max_grade}</span>
            </p>
          </div>
        )}
        {submission.final_grade !== null && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <p className="text-xs text-green-600 font-medium mb-1">Note finale</p>
            <p className="text-3xl font-bold text-green-800">
              {submission.final_grade}
              <span className="text-sm font-normal text-green-600">/{tp.max_grade}</span>
            </p>
          </div>
        )}
      </div>

      {submission.correction_report && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">📋 Rapport de correction</p>
          <StatementRenderer content={submission.correction_report} />
        </div>
      )}

      {submission.answers && submission.answers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-gray-700">💻 Code soumis</p>
          {submission.answers.map((a: any) => {
            const q = questions?.find(q => q.id === a.question_id);
            return (
              <div key={a.question_id} className="space-y-1">
                <p className="text-xs font-medium text-gray-500">
                  Q{a.question_id}{q ? ` — ${q.title} (${q.points} pts)` : ''}
                </p>
                <pre className="bg-gray-900 text-green-400 font-mono text-xs rounded-xl p-3 overflow-x-auto whitespace-pre-wrap max-h-32">
                  {a.code || '(vide — 0 point)'}
                </pre>
              </div>
            );
          })}
        </div>
      )}

      {submission.teacher_comment && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-amber-700 mb-1">Commentaire de l'enseignant</p>
          <p className="text-sm text-amber-900 whitespace-pre-line">{submission.teacher_comment}</p>
        </div>
      )}

      <button
        onClick={onRetry}
        className="w-full border border-rose-800 text-rose-800 py-2.5 rounded-xl text-sm font-medium hover:bg-rose-50 transition-colors"
      >
        Soumettre à nouveau
      </button>
    </div>
  );
}

export default function StudentTPPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  const chapterId = params.chapterId as string;
  const tpId = Number(params.tpId);

  const { data: tp, isLoading: tpLoading, error: tpError } = useTP(tpId);
  const { data: submission } = useMySubmission(tpId);
  const submitCode = useSubmitCode(tpId);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const backUrl = `/courses/${courseId}/chapters/${chapterId}`;

  const questions: TPQuestion[] | null = tp?.questions && tp.questions.length > 0 ? tp.questions : null;
  const totalQ = questions?.length ?? 1;
  const isSommative = tp?.tp_nature === 'sommative';

  const setAnswer = useCallback((qId: number, code: string) => {
    setAnswers(prev => ({ ...prev, [qId]: code }));
  }, []);

  const handleSkip = useCallback(() => {
    if (currentIdx < totalQ - 1) {
      setCurrentIdx(i => i + 1);
    }
  }, [currentIdx, totalQ]);

  const handleNext = useCallback(() => {
    setCurrentIdx(i => Math.min(i + 1, totalQ - 1));
  }, [totalQ]);

  const handleSubmitTP = useCallback(async () => {
    if (!questions) {
      const code = answers[0] ?? '';
      await submitCode.mutateAsync({ code });
      setIsSubmitted(true);
      return;
    }

    const answersPayload = questions.map(q => ({
      question_id: q.id,
      code: answers[q.id] ?? '',
    }));

    try {
      await submitCode.mutateAsync({ answers: answersPayload });
      setIsSubmitted(true);
    } catch {
      toast.error('Erreur lors de la soumission.');
    }
  }, [questions, answers, submitCode]);

  const handleRetry = () => {
    setAnswers({});
    setCurrentIdx(0);
    setIsSubmitted(false);
  };

  const isPolling = submission?.correction_status === 'pending' || submission?.correction_status === 'correcting';
  const showResults = isSubmitted || (submission && submission.status !== 'submitted');

  if (tpLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B1A2E]" />
      </div>
    );
  }

  if (tpError || !tp) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-gray-600">Ce TP est introuvable.</p>
        <button onClick={() => router.push(backUrl)} className="text-[#8B1A2E] underline text-sm">Retour</button>
      </div>
    );
  }

  const currentQ = questions?.[currentIdx];
  const totalPoints = questions?.reduce((s, q) => s + q.points, 0) ?? tp.max_grade;

  return (
    <SafeExamWrapper enabled={isSommative && !showResults} isSubmitted={isSubmitted}>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              {!isSommative && (
                <button
                  onClick={() => router.push(backUrl)}
                  className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-gray-900 truncate">{tp.title}</h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#1E40AF]/10 text-[#1E40AF]">
                    {LANGUAGE_LABELS[tp.language] ?? tp.language}
                  </span>
                  <span className="text-xs text-gray-500">{totalPoints} pts</span>
                  {isSommative ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">🔒 Sommative</span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">🎓 Formative</span>
                  )}
                  {submission && <CorrectionStatusBadge status={submission.correction_status} />}
                </div>
              </div>
            </div>

            {questions && !showResults && (
              <ProgressBar current={currentIdx} total={totalQ} />
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-6">
          {isPolling && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <p className="text-sm text-blue-800">Correction IA en cours… la page se met à jour automatiquement.</p>
            </div>
          )}

          {showResults && submission ? (
            <ResultsView
              submission={submission}
              tp={tp}
              questions={questions}
              onRetry={handleRetry}
            />
          ) : questions && currentQ ? (
            <QuestionView
              question={currentQ}
              language={tp.language}
              tpId={tp.id}
              tpNature={tp.tp_nature ?? 'formative'}
              code={answers[currentQ.id] ?? ''}
              onCodeChange={code => setAnswer(currentQ.id, code)}
              onNext={handleNext}
              onSkip={handleSkip}
              onSubmitTP={handleSubmitTP}
              isSubmitting={submitCode.isPending}
              isLast={currentIdx === totalQ - 1}
            />
          ) : (
            <div className="space-y-4">
              {tp.statement && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">📄 Énoncé</h2>
                  <StatementRenderer content={tp.statement} />
                </div>
              )}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-700">
                  <span className="text-xs text-gray-400 font-mono">{LANGUAGE_LABELS[tp.language]}</span>
                </div>
                <textarea
                  value={answers[0] ?? ''}
                  onChange={e => setAnswer(0, e.target.value)}
                  rows={18}
                  spellCheck={false}
                  className="w-full bg-gray-900 text-green-400 font-mono text-sm px-4 py-3 resize-none focus:outline-none"
                />
              </div>
              <button
                onClick={handleSubmitTP}
                disabled={submitCode.isPending}
                className="w-full flex items-center justify-center gap-2 bg-rose-800 text-white py-3 rounded-xl font-semibold hover:bg-rose-900 transition-colors disabled:opacity-50"
              >
                {submitCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Soumettre le TP
              </button>
            </div>
          )}
        </div>
      </div>
    </SafeExamWrapper>
  );
}
