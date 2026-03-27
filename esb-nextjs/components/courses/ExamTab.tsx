'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Brain, FileText, CheckCircle, XCircle, Lightbulb, Info, ChevronDown, ChevronUp, FlaskConical, BookOpen, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseExams, useUploadExam, useAnalyzeExam, useDeleteExam, useTnExams } from '@/lib/hooks/useCourses';
import {
  BloomDistribution, AAAlignment, ExamEvaluation, CourseExam,
  TNAADistribution, EXAM_TYPE_LABELS, EXAM_TYPE_COLORS,
} from '@/lib/types/course';
import { ExamUploadConfig } from '@/lib/api/courses';
import { ExamMCPPanel } from './ExamMCPPanel';
import { ExamAnalyticsDashboard } from './ExamAnalyticsDashboard';
import { ExamConfigForm } from './ExamConfigForm';
import { ExamImprovementSection } from './ExamImprovementSection';
import { ExamLatexEditor } from './ExamLatexEditor';

interface Props {
  courseId: number;
  canEdit: boolean;
  courseAAs?: TNAADistribution[];
}

const BLOOM_COLORS: Record<keyof BloomDistribution, string> = {
  remembering: 'bg-blue-400', understanding: 'bg-green-400',
  applying: 'bg-yellow-400', analyzing: 'bg-orange-400',
  evaluating: 'bg-red-400', creating: 'bg-purple-400',
};
const BLOOM_LABELS_MAP: Record<keyof BloomDistribution, string> = {
  remembering: 'Memorisation', understanding: 'Comprehension',
  applying: 'Application', analyzing: 'Analyse',
  evaluating: 'Evaluation', creating: 'Creation',
};

function BloomBar({ dist }: { dist: BloomDistribution }) {
  const keys = Object.keys(dist) as (keyof BloomDistribution)[];
  const total = keys.reduce((s, k) => s + (dist[k] ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex rounded-full overflow-hidden h-4">
        {keys.map(k => {
          const pct = total > 0 ? ((dist[k] ?? 0) / total) * 100 : 0;
          return pct > 0 ? (
            <div key={k} className={`${BLOOM_COLORS[k]} transition-all`}
              style={{ width: `${pct}%` }} title={`${BLOOM_LABELS_MAP[k]}: ${pct.toFixed(0)}%`} />
          ) : null;
        })}
      </div>
      <div className="grid gap-1 grid-cols-2 sm:grid-cols-3">
        {keys.map(k => {
          const pct = total > 0 ? ((dist[k] ?? 0) / total) * 100 : 0;
          return (
            <div key={k} className="flex items-center gap-1.5 text-xs">
              <span className={`inline-block w-2 h-2 rounded-full ${BLOOM_COLORS[k]}`} />
              <span className="text-muted-foreground">{BLOOM_LABELS_MAP[k]}</span>
              <span className="font-medium">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvalDashboard({ ev }: { ev: ExamEvaluation }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {[
          { label: 'Questions', value: ev.questions_count },
          { label: 'Duree estimee', value: ev.estimated_duration },
          { label: 'Difficulte', value: ev.avg_difficulty },
          { label: 'Score global', value: `${ev.overall_score}/10` },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-xl font-bold mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      {typeof ev.has_practical_questions !== 'undefined' && (
        <div className={`rounded-xl border p-3 flex items-center gap-3 ${
          ev.has_practical_questions ? 'border-orange-200 bg-orange-50' : 'border-bolt-line bg-white'
        }`}>
          <FlaskConical className={`h-4 w-4 shrink-0 ${ev.has_practical_questions ? 'text-orange-500' : 'text-muted-foreground'}`} />
          <p className="text-sm">
            {ev.has_practical_questions
              ? <><span className="font-semibold text-orange-700">Questions pratiques detectees</span>{' — '}{ev.practical_questions_count ?? 0} sur {ev.questions_count} questions</>
              : <span className="text-muted-foreground">Aucune question pratique - epreuve theorique</span>
            }
          </p>
        </div>
      )}

      {ev.overview && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
          <h4 className="text-sm font-semibold mb-2">Vue d&apos;ensemble</h4>
          <p className="text-sm text-muted-foreground">{ev.overview}</p>
        </div>
      )}

      {ev.bloom_distribution && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
          <h4 className="text-sm font-semibold mb-3">Taxonomie de Bloom</h4>
          <BloomBar dist={ev.bloom_distribution} />
        </div>
      )}

      {ev.aa_alignment && ev.aa_alignment.length > 0 && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
          <h4 className="text-sm font-semibold mb-3">Alignement aux Acquis d&apos;Apprentissage</h4>
          <div className="space-y-2">
            {ev.aa_alignment.map((aa: AAAlignment, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {aa.covered
                  ? <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                <div>
                  <span className="font-medium">{aa.aa}</span>
                  {aa.comment && <p className="text-xs text-muted-foreground mt-0.5">{aa.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {ev.strengths && ev.strengths.length > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <h4 className="text-sm font-semibold text-green-800 mb-2">Points forts</h4>
            <ul className="space-y-1">
              {ev.strengths.map((s: string, i: number) => (
                <li key={i} className="text-xs text-green-700 flex gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ev.feedback && ev.feedback.length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h4 className="text-sm font-semibold text-blue-800 mb-2">Observations</h4>
            <ul className="space-y-1">
              {ev.feedback.map((f: string, i: number) => (
                <li key={i} className="text-xs text-blue-700 flex gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />{f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ev.suggestions && ev.suggestions.length > 0 && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <h4 className="text-sm font-semibold text-yellow-800 mb-2">Suggestions</h4>
            <ul className="space-y-1">
              {ev.suggestions.map((s: string, i: number) => (
                <li key={i} className="text-xs text-yellow-700 flex gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />{s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function EvalCard({ exam, courseId, canEdit, defaultOpen = false }: {
  exam: CourseExam; courseId: number; canEdit: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLatexEditor, setShowLatexEditor] = useState(false);
  const analyzeExam = useAnalyzeExam(courseId);
  const deleteExam = useDeleteExam(courseId);

  const typeLabel = EXAM_TYPE_LABELS[exam.exam_type] ?? exam.exam_type;
  const typeColor = EXAM_TYPE_COLORS[exam.exam_type] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  const errorDetail = exam.status === 'error'
    ? (exam.ai_evaluation as any)?.error ?? (exam.ai_evaluation as any)?.error_detail
    : null;

  return (
    <div className="rounded-xl border border-bolt-line bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 p-4 md:p-5 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <p className="font-semibold text-sm truncate">{exam.original_name ?? 'Epreuve'}</p>
              <Badge className={`text-xs shrink-0 border ${typeColor}`}>{typeLabel}</Badge>
              <Badge variant="outline" className="text-xs shrink-0">{exam.weight ?? 30}%</Badge>
              {exam.has_practical_target && (
                <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200 shrink-0">
                  <FlaskConical className="h-2.5 w-2.5 mr-1" />Pratique
                </Badge>
              )}
              {exam.target_aa_ids && exam.target_aa_ids.length > 0 && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {exam.target_aa_ids.length} AA cible{exam.target_aa_ids.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Ajoute le {new Date(exam.created_at).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {exam.status === 'uploaded' && <Badge variant="secondary">En attente</Badge>}
          {exam.status === 'analyzing' && (
            <Badge className="bg-blue-100 text-blue-800 flex items-center gap-1">
              <div className="animate-spin h-2.5 w-2.5 border border-blue-600 border-t-transparent rounded-full" />
              En cours...
            </Badge>
          )}
          {exam.status === 'done' && <Badge className="bg-green-100 text-green-800">Analyse</Badge>}
          {exam.status === 'error' && <Badge variant="destructive">Erreur</Badge>}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-bolt-line p-4 md:p-5 space-y-5">
          {canEdit && (
            <div className="flex items-center gap-2 flex-wrap">
              {exam.status === 'uploaded' && (
                <Button size="sm" onClick={() => analyzeExam.mutate(exam.id)} disabled={analyzeExam.isPending}>
                  <Brain className="h-4 w-4 mr-1" />
                  {analyzeExam.isPending ? 'Analyse...' : "Analyser avec l'IA"}
                </Button>
              )}
              {exam.status === 'analyzing' && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                  Analyse en cours — resultats dans quelques instants...
                </div>
              )}
              {exam.status === 'error' && (
                <Button size="sm" onClick={() => analyzeExam.mutate(exam.id)} disabled={analyzeExam.isPending}>
                  <Brain className="h-4 w-4 mr-1" />
                  Reessayer l&apos;analyse
                </Button>
              )}
              {exam.status === 'done' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowLatexEditor(v => !v)}
                  className="gap-1.5"
                >
                  <Code2 className="h-4 w-4 text-violet-600" />
                  {showLatexEditor ? "Masquer l'editeur LaTeX" : 'Editeur LaTeX & PDF'}
                </Button>
              )}
              {confirmDelete ? (
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => { deleteExam.mutate(exam.id); setConfirmDelete(false); }}
                    className="text-xs text-red-600 hover:underline">Confirmer</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted-foreground hover:underline">Annuler</button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>
          )}

          {exam.status === 'done' && exam.ai_evaluation && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-bolt-accent" />
                  Evaluation IA
                </h3>
                <EvalDashboard ev={exam.ai_evaluation} />
              </div>
              <div className="rounded-xl border border-bolt-line bg-muted/20 p-4 md:p-5">
                <ExamAnalyticsDashboard ev={exam.ai_evaluation} />
              </div>
              {exam.ai_evaluation.improvement_proposals && exam.ai_evaluation.improvement_proposals.length > 0 && (
                <div className="rounded-xl border border-violet-100 bg-violet-50/30 p-4 md:p-5">
                  <ExamImprovementSection proposals={exam.ai_evaluation.improvement_proposals} courseId={courseId} examId={exam.id} />
                </div>
              )}

              {showLatexEditor && (
                <div className="rounded-xl border-2 border-violet-200 bg-white p-4 md:p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-violet-600" />
                    Editeur LaTeX - Nouvelle proposition d&apos;epreuve
                  </h3>
                  <ExamLatexEditor courseId={courseId} examId={exam.id} />
                </div>
              )}
            </>
          )}

          {exam.status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 space-y-2">
              <p className="font-semibold">Erreur lors de l&apos;analyse</p>
              {errorDetail && (
                <p className="text-xs font-mono bg-red-100 rounded p-2 whitespace-pre-wrap break-all">
                  {String(errorDetail).substring(0, 400)}
                </p>
              )}
              <p className="text-xs text-red-500">Cliquez sur Reessayer l&apos;analyse ci-dessus ou verifiez votre cle API Gemini.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExamTab({ courseId, canEdit, courseAAs = [] }: Props) {
  const { data: exams, isLoading, refetch } = useCourseExams(courseId);
  const { data: tnExams } = useTnExams(courseId);
  const uploadExam = useUploadExam(courseId);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (!exams) return;
    const hasAnalyzing = exams.some(e => e.status === 'analyzing');
    if (!hasAnalyzing) return;
    const timer = setInterval(() => { refetch(); }, 5000);
    return () => clearInterval(timer);
  }, [exams, refetch]);

  if (isLoading) return <Skeleton className="h-48" />;

  const handleUpload = (file: File, config: ExamUploadConfig) => {
    uploadExam.mutate({ file, config }, { onSuccess: () => setShowAddForm(false) });
  };

  const examList = exams ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Evaluations du cours</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gerez vos examens, DS et epreuves pratiques</p>
        </div>
        {canEdit && !showAddForm && (
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Ajouter une epreuve
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="rounded-xl border-2 border-bolt-accent/30 bg-white shadow-sm p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Nouvelle epreuve</h3>
            <button type="button" onClick={() => setShowAddForm(false)}
              className="text-xs text-muted-foreground hover:underline">Annuler</button>
          </div>
          <ExamConfigForm onConfirm={handleUpload} isLoading={uploadExam.isPending} courseAAs={courseAAs} />
        </div>
      )}

      {examList.length === 0 && !showAddForm ? (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-10 text-center">
          <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-muted-foreground">Aucune epreuve ajoutee</p>
          <p className="text-xs text-muted-foreground mt-1">Cliquez sur Ajouter une epreuve pour commencer</p>
        </div>
      ) : (
        <div className="space-y-3">
          {examList.map((exam, idx) => (
            <EvalCard key={exam.id} exam={exam} courseId={courseId} canEdit={canEdit} defaultOpen={idx === 0} />
          ))}
        </div>
      )}

      {tnExams && tnExams.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold">Examens TN uploades</h3>
          {tnExams.map(doc => (
            <div key={doc.id} className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span className="font-medium text-gray-800">{doc.title || 'Examen sans titre'}</span>
                {doc.has_analysis && <Badge className="bg-green-100 text-green-800 border-0 text-xs">Analyse</Badge>}
              </div>
              <ExamMCPPanel courseId={courseId} documentId={doc.id} documentTitle={doc.title || 'Examen'} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
