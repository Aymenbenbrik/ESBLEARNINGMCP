'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FlaskConical, CheckCircle2, Edit3, Globe, Loader2, Clock,
  Award, ChevronRight, Code2, Target, BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { chapterPipelineApi, ChapterExercise, ExerciseQuestion } from '@/lib/api/chapter-pipeline';
import { LatexText } from '@/components/shared/LatexText';

interface Props {
  chapterId: number;
  isTeacher?: boolean;
}

const LANG_LABELS: Record<string, string> = {
  python: '🐍 Python', sql: '🗄️ SQL', java: '☕ Java',
  c: '⚙️ C', cpp: '⚙️ C++', javascript: '📜 JavaScript',
  r: '📊 R', bash: '💻 Bash',
};

function TPQuestionCard({ question, isTeacher, exId, chapterId, onUpdated }: {
  question: ExerciseQuestion;
  isTeacher: boolean;
  exId: number;
  chapterId: number;
  onUpdated: () => void;
}) {
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [answer, setAnswer] = useState(question.model_answer || '');
  const [saving, setSaving] = useState(false);

  const saveAnswer = async (validated?: boolean) => {
    setSaving(true);
    try {
      await chapterPipelineApi.updateQuestion(chapterId, exId, question.id, {
        model_answer: answer,
        ...(validated !== undefined ? { answer_validated: validated } : {}),
      });
      setEditingAnswer(false);
      toast.success(validated ? 'Correction validée ✓' : 'Correction sauvegardée');
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
        <span className="text-xs font-bold text-muted-foreground mt-0.5 min-w-[1.5rem]">Q{question.order}.</span>
        <div className="flex-1">
          <p className="text-sm font-medium"><LatexText text={question.question_text} /></p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {question.question_type === 'code' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                <Code2 className="h-3 w-3" /> Code
              </span>
            )}
            {question.bloom_level && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700">{question.bloom_level}</span>
            )}
            {question.difficulty && (
              <span className="px-1.5 py-0.5 rounded text-xs border bg-yellow-50 text-yellow-700 border-yellow-200">{question.difficulty}</span>
            )}
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
                <CheckCircle2 className="h-3 w-3" /> Corrigé
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Correction */}
      <div className="ml-6 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Correction proposée</p>
        {editingAnswer ? (
          <div className="space-y-2">
            <Textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={6}
              className="text-sm font-mono"
              placeholder="Correction modèle (code, explication, résultat attendu…)"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveAnswer(true)} disabled={saving} className="gap-1.5 bg-green-600 hover:bg-green-700">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Valider
              </Button>
              <Button size="sm" onClick={() => saveAnswer()} disabled={saving} variant="outline">
                Sauvegarder
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingAnswer(false); setAnswer(question.model_answer || ''); }}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-2 bg-slate-50 rounded text-sm">
            <div className="flex-1 whitespace-pre-wrap font-mono text-xs">
              {question.model_answer
                ? <LatexText text={question.model_answer} block />
                : <span className="italic text-muted-foreground not-italic font-sans text-sm">Aucune correction générée</span>}
            </div>
            {isTeacher && (
              <Button size="sm" variant="ghost" className="shrink-0 h-7 w-7 p-0" onClick={() => setEditingAnswer(true)}>
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}

        {/* Scoring detail */}
        {question.scoring_detail && (
          <p className="text-xs text-muted-foreground italic p-1.5 border rounded bg-amber-50">
            📊 {question.scoring_detail}
          </p>
        )}

        {/* Correction criteria */}
        {question.correction_criteria && question.correction_criteria.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-1 mb-0.5">Critères</p>
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

        {/* Quick validate button */}
        {isTeacher && !question.answer_validated && !editingAnswer && (
          <Button
            size="sm" variant="outline"
            className="gap-1 text-green-600 border-green-200 hover:bg-green-50 mt-1"
            onClick={() => saveAnswer(true)} disabled={saving}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Valider la correction
          </Button>
        )}
      </div>
    </div>
  );
}

function TPCard({ exercise, isTeacher, chapterId, onUpdated }: {
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

  const nature = exercise.tp_nature === 'sommative' ? 'Sommatif' : 'Formatif';
  const lang = exercise.programming_language ? LANG_LABELS[exercise.programming_language] || exercise.programming_language : null;

  return (
    <AccordionItem value={String(exercise.id)} className="border rounded-lg mb-3 bg-white">
      {/* Header row: trigger + publish button side by side (no button nested inside button) */}
      <div className="flex items-center pr-2">
        <AccordionTrigger className="flex-1 px-4 py-3 hover:no-underline [&>svg]:ml-2 [&>svg]:shrink-0">
          <div className="flex items-center gap-3 text-left w-full">
            <FlaskConical className="h-4 w-4 text-orange-500 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm">{exercise.title}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor}`}>
                  {exercise.status === 'draft' ? 'Brouillon' : exercise.status === 'validated' ? 'Validé' : 'Publié'}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">{nature}</span>
                {lang && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-50 text-slate-700">{lang}</span>}
                {exercise.questions && (
                  <span className="text-xs text-muted-foreground">
                    {exercise.questions.length} question{exercise.questions.length !== 1 ? 's' : ''}
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
            <TPQuestionCard
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

export function ActivitesPratiquesTab({ chapterId, isTeacher = false }: Props) {
  const [exercises, setExercises] = useState<ChapterExercise[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExercises = useCallback(async () => {
    setLoading(true);
    try {
      const data = await chapterPipelineApi.listExercises(chapterId, 'tp');
      setExercises(data);
    } catch {
      toast.error('Erreur de chargement des TPs');
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
        <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">Aucune activité pratique</p>
        <p className="text-sm text-muted-foreground mt-1">
          Lancez le pipeline IA pour détecter automatiquement les TPs dans les documents du chapitre.
        </p>
      </div>
    );
  }

  const published = exercises.filter(e => e.status === 'published').length;
  const totalQuestions = exercises.reduce((s, e) => s + (e.questions?.length || 0), 0);
  const formative = exercises.filter(e => e.tp_nature !== 'sommative').length;
  const sommative = exercises.filter(e => e.tp_nature === 'sommative').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'TPs', value: exercises.length, icon: FlaskConical },
          { label: 'Questions', value: totalQuestions, icon: Target },
          { label: 'Formatifs', value: formative, icon: BookOpen },
          { label: 'Publiés', value: published, icon: Globe },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="border rounded-lg p-3 bg-white text-center">
            <Icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* TP list */}
      <Accordion type="multiple" className="space-y-0">
        {exercises.map(ex => (
          <TPCard
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
