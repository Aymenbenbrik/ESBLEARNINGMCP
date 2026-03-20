'use client';

import { useRef, useState } from 'react';
import { Upload, Trash2, Brain, FileText, CheckCircle, XCircle, Lightbulb, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseExam, useUploadExam, useAnalyzeExam, useDeleteExam, useTnExams } from '@/lib/hooks/useCourses';
import { BloomDistribution, AAAlignment, ExamEvaluation } from '@/lib/types/course';
import { ExamMCPPanel } from './ExamMCPPanel';

interface Props {
  courseId: number;
  canEdit: boolean;
}

const BLOOM_LABELS: Record<keyof BloomDistribution, string> = {
  remembering: 'Mémorisation',
  understanding: 'Compréhension',
  applying: 'Application',
  analyzing: 'Analyse',
  evaluating: 'Évaluation',
  creating: 'Création',
};

const BLOOM_COLORS: Record<keyof BloomDistribution, string> = {
  remembering: 'bg-blue-400',
  understanding: 'bg-green-400',
  applying: 'bg-yellow-400',
  analyzing: 'bg-orange-400',
  evaluating: 'bg-red-400',
  creating: 'bg-purple-400',
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
            <div key={k} className={`${BLOOM_COLORS[k]} transition-all`} style={{ width: `${pct}%` }} title={`${BLOOM_LABELS[k]}: ${pct.toFixed(0)}%`} />
          ) : null;
        })}
      </div>
      <div className="grid gap-1 grid-cols-2 sm:grid-cols-3">
        {keys.map(k => {
          const pct = total > 0 ? ((dist[k] ?? 0) / total) * 100 : 0;
          return (
            <div key={k} className="flex items-center gap-1.5 text-xs">
              <span className={`inline-block w-2 h-2 rounded-full ${BLOOM_COLORS[k]}`} />
              <span className="text-muted-foreground">{BLOOM_LABELS[k]}</span>
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
      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {[
          { label: 'Questions', value: ev.questions_count },
          { label: 'Durée estimée', value: ev.estimated_duration },
          { label: 'Difficulté', value: ev.avg_difficulty },
          { label: 'Score global', value: `${ev.overall_score}/10` },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-xl font-bold mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Overview */}
      {ev.overview && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
          <h4 className="text-sm font-semibold mb-2">Vue d&apos;ensemble</h4>
          <p className="text-sm text-muted-foreground">{ev.overview}</p>
        </div>
      )}

      {/* Bloom */}
      {ev.bloom_distribution && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
          <h4 className="text-sm font-semibold mb-3">Taxonomie de Bloom</h4>
          <BloomBar dist={ev.bloom_distribution} />
        </div>
      )}

      {/* AA Alignment */}
      {ev.aa_alignment && ev.aa_alignment.length > 0 && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
          <h4 className="text-sm font-semibold mb-3">Alignement aux Acquis d&apos;Apprentissage</h4>
          <div className="space-y-2">
            {ev.aa_alignment.map((aa: AAAlignment, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {aa.covered ? (
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                )}
                <div>
                  <span className="font-medium">{aa.aa}</span>
                  {aa.comment && <p className="text-xs text-muted-foreground mt-0.5">{aa.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths, Feedback, Suggestions */}
      <div className="grid gap-4 md:grid-cols-3">
        {ev.strengths && ev.strengths.length > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <h4 className="text-sm font-semibold text-green-800 mb-2">✅ Points forts</h4>
            <ul className="space-y-1">
              {ev.strengths.map((s: string, i: number) => (
                <li key={i} className="text-xs text-green-700 flex gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ev.feedback && ev.feedback.length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h4 className="text-sm font-semibold text-blue-800 mb-2">ℹ️ Observations</h4>
            <ul className="space-y-1">
              {ev.feedback.map((f: string, i: number) => (
                <li key={i} className="text-xs text-blue-700 flex gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ev.suggestions && ev.suggestions.length > 0 && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <h4 className="text-sm font-semibold text-yellow-800 mb-2">💡 Suggestions</h4>
            <ul className="space-y-1">
              {ev.suggestions.map((s: string, i: number) => (
                <li key={i} className="text-xs text-yellow-700 flex gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function ExamTab({ courseId, canEdit }: Props) {
  const { data: exam, isLoading } = useCourseExam(courseId);
  const { data: tnExams } = useTnExams(courseId);
  const uploadExam = useUploadExam(courseId);
  const analyzeExam = useAnalyzeExam(courseId);
  const deleteExam = useDeleteExam(courseId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) return <Skeleton className="h-48" />;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadExam.mutate(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-5">
      {/* Upload Section */}
      <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 md:p-6">
        <h3 className="text-base font-semibold mb-4">📄 Fichier d&apos;examen</h3>

        {!exam ? (
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadExam.isPending}
              className="w-full border-2 border-dashed border-bolt-line rounded-xl p-8 text-center hover:border-bolt-accent hover:bg-muted/10 transition-colors disabled:opacity-50"
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Cliquez pour uploader un fichier</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOCX ou TXT</p>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploadExam.isPending && (
              <p className="text-sm text-muted-foreground mt-2 text-center">Upload en cours...</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium text-sm">{exam.original_name ?? 'Examen'}</p>
                <p className="text-xs text-muted-foreground">
                  Uploadé le {new Date(exam.created_at).toLocaleDateString('fr-FR')}
                </p>
                <div className="mt-1">
                  {exam.status === 'uploaded' && <Badge variant="secondary">En attente d&apos;analyse</Badge>}
                  {exam.status === 'analyzing' && <Badge className="bg-blue-100 text-blue-800">Analyse en cours...</Badge>}
                  {exam.status === 'done' && <Badge className="bg-green-100 text-green-800">Analysé ✓</Badge>}
                  {exam.status === 'error' && <Badge variant="destructive">Erreur</Badge>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {exam.status === 'uploaded' && canEdit && (
                <Button
                  size="sm"
                  onClick={() => analyzeExam.mutate(exam.id)}
                  disabled={analyzeExam.isPending}
                >
                  <Brain className="h-4 w-4 mr-1" />
                  {analyzeExam.isPending ? "Analyse..." : "Analyser avec l'IA"}
                </Button>
              )}
              {exam.status === 'analyzing' && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                  Analyse en cours...
                </div>
              )}
              {canEdit && (
                confirmDelete ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { deleteExam.mutate(exam.id); setConfirmDelete(false); }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Confirmer
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted-foreground hover:underline">
                      Annuler
                    </button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI Evaluation Dashboard */}
      {exam?.status === 'done' && exam.ai_evaluation && (
        <div>
          <h3 className="text-base font-semibold mb-4">🤖 Évaluation IA</h3>
          <EvalDashboard ev={exam.ai_evaluation} />
        </div>
      )}

      {/* MCP Analyse Approfondie — for TN Exam Documents */}
      {tnExams && tnExams.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold">📋 Examens TN uploadés</h3>
          {tnExams.map(doc => (
            <div key={doc.id} className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span className="font-medium text-gray-800">{doc.title || 'Examen sans titre'}</span>
                {doc.has_analysis && <Badge className="bg-green-100 text-green-800 border-0 text-xs">Analysé ✓</Badge>}
              </div>
              <ExamMCPPanel
                courseId={courseId}
                documentId={doc.id}
                documentTitle={doc.title || 'Examen'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
