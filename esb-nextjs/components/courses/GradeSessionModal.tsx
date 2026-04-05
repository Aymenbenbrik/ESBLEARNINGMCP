'use client';

import { useState } from 'react';
import { useValidateScore } from '@/lib/hooks/useExamBank';
import type { ExamSession, ValidatedExam, ExamSessionAnswer } from '@/lib/types/exam-bank';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Loader2, Bot } from 'lucide-react';
import { toast } from 'sonner';

interface GradeSessionModalProps {
  session: ExamSession;
  exam: ValidatedExam;
  onClose: () => void;
}

interface QuestionScore {
  score: string;
  feedback: string;
  dirty: boolean;
}

export function GradeSessionModal({ session, exam, onClose }: GradeSessionModalProps) {
  const questions = exam.questions ?? [];
  const answers = session.answers ?? [];

  // Local overrides: questionId → { score, feedback }
  const [overrides, setOverrides] = useState<Record<number, QuestionScore>>(() => {
    const init: Record<number, QuestionScore> = {};
    answers.forEach(a => {
      init[a.question_id] = {
        score: String(a.score ?? ''),
        feedback: a.ai_feedback ?? '',
        dirty: false,
      };
    });
    return init;
  });

  const validateMutation = useValidateScore(session.id);
  const [saving, setSaving] = useState(false);

  const handleSaveAll = async () => {
    setSaving(true);
    const dirty = Object.entries(overrides).filter(([, v]) => v.dirty);
    try {
      for (const [qIdStr, val] of dirty) {
        await validateMutation.mutateAsync({
          question_id: parseInt(qIdStr),
          score: parseFloat(val.score) || 0,
          feedback: val.feedback,
        });
      }
      toast.success('Notes validées avec succès !');
      onClose();
    } catch {
      toast.error('Erreur lors de la validation des notes');
    } finally {
      setSaving(false);
    }
  };

  const setScore = (qId: number, score: string) =>
    setOverrides(prev => ({ ...prev, [qId]: { ...prev[qId], score, dirty: true } }));

  const setFeedback = (qId: number, feedback: string) =>
    setOverrides(prev => ({ ...prev, [qId]: { ...prev[qId], feedback, dirty: true } }));

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Corriger la session — {session.student_name ?? `Étudiant #${session.student_id}`}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Score actuel : {session.score?.toFixed(1) ?? '?'} / {session.max_score?.toFixed(1) ?? '?'} pts
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {questions.map((question, idx) => {
            const answer: ExamSessionAnswer | undefined = answers.find(a => a.question_id === question.id);
            const override = overrides[question.id];
            const hasAiFeedback = answer?.ai_feedback;
            const isOpenEnded = question.question_type === 'open_ended' || question.question_type === 'code';

            return (
              <div key={question.id} className="rounded-lg border border-bolt-line p-4 space-y-3">
                {/* Question header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">Q{idx + 1}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {question.question_type.replace('_', ' ')}
                      </Badge>
                      {answer?.is_correct === true && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                      {answer?.is_correct === false && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                    <p className="text-sm font-medium whitespace-pre-line">{question.question_text}</p>
                  </div>
                </div>

                {/* Student answer */}
                {answer?.student_choice && (
                  <div className="bg-gray-50 rounded p-2 text-sm">
                    <span className="text-muted-foreground text-xs">Choix : </span>
                    <span className="font-medium">{answer.student_choice}</span>
                  </div>
                )}
                {answer?.student_answer && (
                  <div className="bg-gray-50 rounded p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Réponse de l&apos;étudiant :</p>
                    <p className="whitespace-pre-line">{answer.student_answer}</p>
                  </div>
                )}

                {/* AI feedback (read-only) */}
                {hasAiFeedback && (
                  <div className="bg-blue-50 rounded p-3 border border-blue-200 text-sm">
                    <p className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1">
                      <Bot className="h-3.5 w-3.5" /> Feedback IA
                    </p>
                    <p className="text-gray-700">{answer!.ai_feedback}</p>
                  </div>
                )}

                {/* Score override (open_ended or manual grading) */}
                {isOpenEnded && (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Note (/ {question.points} pts)</Label>
                      <Input
                        type="number"
                        min="0"
                        max={question.points}
                        step="0.5"
                        value={override?.score ?? ''}
                        onChange={e => setScore(question.id, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Feedback</Label>
                      <Textarea
                        rows={2}
                        value={override?.feedback ?? ''}
                        onChange={e => setFeedback(question.id, e.target.value)}
                        placeholder="Commentaire pour l'étudiant…"
                        className="text-sm resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSaveAll} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Valider les notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
