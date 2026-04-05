'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BookOpen, CheckCircle2, XCircle, Edit3, Globe, Trash2, Plus,
  Loader2, ChevronRight, Award, Clock, Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { chapterPipelineApi, ChapterExercise, ExerciseQuestion } from '@/lib/api/chapter-pipeline';
import { LatexText } from '@/components/shared/LatexText';

interface Props {
  chapterId: number;
  isTeacher?: boolean;
}

const BLOOM_COLORS: Record<string, string> = {
  'Mémoriser': 'bg-gray-100 text-gray-700',
  'Comprendre': 'bg-blue-100 text-blue-700',
  'Appliquer': 'bg-green-100 text-green-700',
  'Analyser': 'bg-yellow-100 text-yellow-700',
  'Évaluer': 'bg-orange-100 text-orange-700',
  'Créer': 'bg-purple-100 text-purple-700',
};

const DIFF_COLORS: Record<string, string> = {
  'Facile': 'bg-green-50 text-green-700 border-green-200',
  'Moyen': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Difficile': 'bg-red-50 text-red-700 border-red-200',
};

function BloomBadge({ level }: { level?: string }) {
  if (!level) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${BLOOM_COLORS[level] || 'bg-gray-100 text-gray-600'}`}>
      {level}
    </span>
  );
}

function DiffBadge({ diff }: { diff?: string }) {
  if (!diff) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${DIFF_COLORS[diff] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {diff}
    </span>
  );
}

function QuestionCard({
  question, isTeacher, exId, chapterId, onUpdated,
}: {
  question: ExerciseQuestion;
  isTeacher: boolean;
  exId: number;
  chapterId: number;
  onUpdated: () => void;
}) {
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [answer, setAnswer] = useState(question.model_answer || '');
  const [saving, setSaving] = useState(false);

  const validateAnswer = async (validated: boolean) => {
    setSaving(true);
    try {
      await chapterPipelineApi.updateQuestion(chapterId, exId, question.id, {
        answer_validated: validated,
        model_answer: answer,
      });
      toast.success(validated ? 'Réponse validée ✓' : 'Réponse rejetée');
      onUpdated();
    } catch {
      toast.error('Erreur de mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const saveAnswer = async () => {
    setSaving(true);
    try {
      await chapterPipelineApi.updateQuestion(chapterId, exId, question.id, {
        model_answer: answer,
      });
      setEditingAnswer(false);
      toast.success('Réponse sauvegardée');
      onUpdated();
    } catch {
      toast.error('Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-white space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-muted-foreground mt-0.5 min-w-[1.5rem]">
          Q{question.order}.
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium"><LatexText text={question.question_text} /></p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <BloomBadge level={question.bloom_level} />
            <DiffBadge diff={question.difficulty} />
            {question.aa_codes?.map(aa => (
              <span key={aa} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 border border-indigo-200">
                {aa}
              </span>
            ))}
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-slate-50 text-slate-600">
              <Award className="h-3 w-3" /> {question.points} pt{question.points > 1 ? 's' : ''}
            </span>
            {question.estimated_duration_min && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-slate-50 text-slate-600">
                <Clock className="h-3 w-3" /> {question.estimated_duration_min} min
              </span>
            )}
            {question.answer_validated && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700">
                <CheckCircle2 className="h-3 w-3" /> Validée
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Model answer */}
      {(question.model_answer || isTeacher) && (
        <div className="ml-6 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Réponse modèle</p>
          {editingAnswer ? (
            <div className="space-y-2">
              <Textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveAnswer} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sauvegarder'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingAnswer(false); setAnswer(question.model_answer || ''); }}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-2 bg-slate-50 rounded text-sm">
              <div className="flex-1 whitespace-pre-wrap">
                {question.model_answer
                  ? <LatexText text={question.model_answer} block />
                  : <span className="italic text-muted-foreground">Aucune réponse générée</span>}
              </div>
              {isTeacher && (
                <Button size="sm" variant="ghost" className="shrink-0 h-7 w-7 p-0" onClick={() => setEditingAnswer(true)}>
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}

          {/* Correction criteria */}
          {question.correction_criteria && question.correction_criteria.length > 0 && (
            <div className="mt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Critères de correction</p>
              <ul className="space-y-0.5">
                {question.correction_criteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <ChevronRight className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Scoring */}
          {question.scoring_detail && (
            <p className="text-xs text-muted-foreground italic p-1.5 border rounded bg-amber-50">
              📊 {question.scoring_detail}
            </p>
          )}

          {/* Validate/Reject buttons */}
          {isTeacher && !question.answer_validated && (
            <div className="flex gap-2 mt-1">
              <Button size="sm" variant="outline" className="gap-1 text-green-600 border-green-200 hover:bg-green-50" onClick={() => validateAnswer(true)} disabled={saving}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Valider
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => validateAnswer(false)} disabled={saving}>
                <XCircle className="h-3.5 w-3.5" /> Rejeter
              </Button>
            </div>
          )}
          {isTeacher && question.answer_validated && (
            <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground text-xs" onClick={() => validateAnswer(false)} disabled={saving}>
              Annuler validation
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({
  exercise, isTeacher, chapterId, onUpdated,
}: {
  exercise: ChapterExercise;
  isTeacher: boolean;
  chapterId: number;
  onUpdated: () => void;
}) {
  const [publishing, setPublishing] = useState(false);

  const publish = async () => {
    setPublishing(true);
    try {
      await chapterPipelineApi.publishExercise(chapterId, exercise.id);
      toast.success(`"${exercise.title}" publié ✓`);
      onUpdated();
    } catch {
      toast.error('Erreur de publication');
    } finally {
      setPublishing(false);
    }
  };

  const statusColor = {
    draft: 'bg-gray-100 text-gray-600',
    validated: 'bg-blue-100 text-blue-700',
    published: 'bg-green-100 text-green-700',
  }[exercise.status] || 'bg-gray-100 text-gray-600';

  return (
    <AccordionItem value={String(exercise.id)} className="border rounded-lg mb-3 bg-white">
      {/* Header row: trigger + publish button side by side (no button nested inside button) */}
      <div className="flex items-center pr-2">
        <AccordionTrigger className="flex-1 px-4 py-3 hover:no-underline [&>svg]:ml-2 [&>svg]:shrink-0">
          <div className="flex items-center gap-3 text-left w-full">
            <BookOpen className="h-4 w-4 text-indigo-500 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm">{exercise.title}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor}`}>
                  {exercise.status === 'draft' ? 'Brouillon' : exercise.status === 'validated' ? 'Validé' : 'Publié'}
                </span>
                {exercise.questions && (
                  <span className="text-xs text-muted-foreground">
                    {exercise.questions.length} question{exercise.questions.length !== 1 ? 's' : ''}
                  </span>
                )}
                {exercise.total_points && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Award className="h-3 w-3" /> {exercise.total_points} pts
                  </span>
                )}
                {exercise.estimated_duration_min && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-3 w-3" /> {exercise.estimated_duration_min} min
                  </span>
                )}
                {exercise.aa_codes?.map(aa => (
                  <span key={aa} className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    {aa}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </AccordionTrigger>
        {isTeacher && exercise.status !== 'published' && (
          <Button
            size="sm"
            className="gap-1.5 shrink-0 ml-2"
            onClick={publish}
            disabled={publishing}
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            Publier
          </Button>
        )}
      </div>
      <AccordionContent className="px-4 pb-4">
        {exercise.description && (
          <p className="text-sm text-muted-foreground mb-3">{exercise.description}</p>
        )}
        <div className="space-y-2">
          {exercise.questions?.map(q => (
            <QuestionCard
              key={q.id}
              question={q}
              isTeacher={isTeacher}
              exId={exercise.id}
              chapterId={chapterId}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function ConsolidationTab({ chapterId, isTeacher = false }: Props) {
  const [exercises, setExercises] = useState<ChapterExercise[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExercises = useCallback(async () => {
    setLoading(true);
    try {
      const data = await chapterPipelineApi.listExercises(chapterId, 'consolidation');
      setExercises(data);
    } catch {
      toast.error('Erreur de chargement des exercices');
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">Aucun exercice de consolidation</p>
        <p className="text-sm text-muted-foreground mt-1">
          Lancez le pipeline IA ci-dessus pour détecter automatiquement les exercices dans les documents du chapitre.
        </p>
      </div>
    );
  }

  const published = exercises.filter(e => e.status === 'published').length;
  const totalQuestions = exercises.reduce((s, e) => s + (e.questions?.length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Exercices', value: exercises.length, icon: BookOpen },
          { label: 'Questions', value: totalQuestions, icon: Target },
          { label: 'Publiés', value: published, icon: Globe },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="border rounded-lg p-3 bg-white text-center">
            <Icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Exercises list */}
      <Accordion type="multiple" className="space-y-0">
        {exercises.map(ex => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            isTeacher={isTeacher}
            chapterId={chapterId}
            onUpdated={loadExercises}
          />
        ))}
      </Accordion>
    </div>
  );
}
