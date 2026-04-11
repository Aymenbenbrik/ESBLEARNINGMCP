'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { GraduationCap, Wand2, CheckCircle2, Pencil, Save, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGenerateCorrection,
  useTnExamCorrections,
  useUpdateCorrection,
  useExamTags,
  useSyncQuestionTags,
} from '@/lib/hooks/useCourses';
import type { TnExamDocument, TnExamCorrection } from '@/lib/types/course';

const BLOOM_LEVELS_FALLBACK = ['Mémoriser', 'Comprendre', 'Appliquer', 'Analyser', 'Évaluer', 'Créer'];
const DIFFICULTY_LEVELS_FALLBACK = ['Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile'];

interface CorrectionTabProps {
  exam: TnExamDocument;
  courseId: number;
  examId: number;
}

export function CorrectionTab({ exam, courseId, examId }: CorrectionTabProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editPointsDetail, setEditPointsDetail] = useState('');
  const [editBloom, setEditBloom] = useState('');
  const [editDifficulty, setEditDifficulty] = useState('');

  const { data: corrections = [], isLoading } = useTnExamCorrections(courseId, examId);
  const generateMutation = useGenerateCorrection(courseId, examId);
  const updateMutation = useUpdateCorrection(courseId, examId);
  const { data: tagConstants } = useExamTags();
  const syncTagsMutation = useSyncQuestionTags(courseId, examId);

  const ar = exam.analysis_results as Record<string, unknown> | null | undefined;
  const rawQuestions = (ar?.extracted_questions ?? ar?.questions ?? []) as Array<Record<string, unknown>>;
  const validatedQuestions = rawQuestions.filter((q) => q.validated);

  function handleGenerate() {
    if (validatedQuestions.length === 0) {
      toast.error('Aucune question validée. Validez des questions dans l\'onglet Questions d\'abord.');
      return;
    }
    generateMutation.mutate(undefined, {
      onSuccess: () => toast.success('Corrections générées avec succès'),
      onError: () => toast.error('Erreur lors de la génération'),
    });
  }

  function startEdit(c: TnExamCorrection) {
    setEditingIndex(c.index);
    setEditText(c.correction);
    setEditPointsDetail(c.points_detail);
    setEditBloom(c.bloom_level || '');
    setEditDifficulty(c.difficulty || '');
  }

  function saveEdit(c: TnExamCorrection) {
    updateMutation.mutate(
      {
        index: c.index,
        data: {
          correction: editText,
          points_detail: editPointsDetail,
          bloom_level: editBloom || c.bloom_level,
          difficulty: editDifficulty || c.difficulty,
        },
      },
      {
        onSuccess: () => { toast.success('Correction mise à jour'); setEditingIndex(null); },
        onError: () => toast.error('Erreur lors de la sauvegarde'),
      }
    );
  }

  function toggleValidate(c: TnExamCorrection) {
    updateMutation.mutate(
      { index: c.index, data: { validated: !c.validated } },
      { onSuccess: () => toast.success(c.validated ? 'Correction invalidée' : 'Correction validée ✓') }
    );
  }

  const validatedCount = corrections.filter((c) => c.validated).length;
  const exerciseGroups = Array.from(new Set(corrections.map((c) => c.exercise_number)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            Correction de l&apos;épreuve
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {validatedQuestions.length} question(s) validée(s) disponibles
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generateMutation.isPending || validatedQuestions.length === 0} className="gap-2">
          {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Générer la correction
        </Button>
      </div>

      {validatedQuestions.length === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 flex items-center gap-3 text-amber-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">Aucune question validée. Rendez-vous dans l&apos;onglet <strong>Questions</strong> pour valider des questions.</p>
          </CardContent>
        </Card>
      )}

      {corrections.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-indigo-600">{corrections.length}</div><div className="text-sm text-muted-foreground">Corrections générées</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-emerald-600">{validatedCount}</div><div className="text-sm text-muted-foreground">Validées</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-orange-500">{corrections.length - validatedCount}</div><div className="text-sm text-muted-foreground">En attente</div></CardContent></Card>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />Chargement...
        </div>
      )}

      {!isLoading && corrections.length === 0 && validatedQuestions.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucune correction générée</p>
            <p className="text-sm mt-1">Cliquez sur &quot;Générer la correction&quot; pour créer les corrections avec Gemini AI.</p>
          </CardContent>
        </Card>
      )}

      {corrections.length > 0 && (
        <Accordion type="multiple" defaultValue={exerciseGroups.map(n => `ex-${n}`)}>
          {exerciseGroups.map((exNum) => {
            const exCorrections = corrections.filter((c) => c.exercise_number === exNum);
            const exTitle = exCorrections[0]?.exercise_title || `Exercice ${exNum}`;
            const exValidated = exCorrections.filter((c) => c.validated).length;
            return (
              <AccordionItem key={`ex-${exNum}`} value={`ex-${exNum}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{exTitle}</span>
                    <Badge variant="outline" className="text-xs">{exCorrections.length} question(s)</Badge>
                    {exValidated === exCorrections.length && exCorrections.length > 0 && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Toutes validées</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {exCorrections.map((c) => (
                      <Card key={c.index} className={c.validated ? 'border-emerald-200 bg-emerald-50/30' : ''}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <CardTitle className="text-sm font-medium text-gray-700">Q{c.index + 1}. {c.question_text}</CardTitle>
                              <div className="flex gap-2 mt-1 flex-wrap items-center">
                                <Badge variant="outline" className="text-xs">{c.question_type}</Badge>
                                {editingIndex === c.index ? (
                                  <select
                                    value={editBloom}
                                    onChange={(e) => setEditBloom(e.target.value)}
                                    className="text-xs border rounded px-1 py-0.5"
                                  >
                                    <option value="">—</option>
                                    {(tagConstants?.bloom_levels || BLOOM_LEVELS_FALLBACK).map(level => (
                                      <option key={level} value={level}>{level}</option>
                                    ))}
                                  </select>
                                ) : (
                                  c.bloom_level && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                      style={{
                                        backgroundColor: (tagConstants?.bloom_colors?.[c.bloom_level] || '') + '20',
                                        color: tagConstants?.bloom_colors?.[c.bloom_level] || undefined,
                                      }}
                                    >
                                      {c.bloom_level}
                                    </Badge>
                                  )
                                )}
                                {editingIndex === c.index ? (
                                  <select
                                    value={editDifficulty}
                                    onChange={(e) => setEditDifficulty(e.target.value)}
                                    className="text-xs border rounded px-1 py-0.5"
                                  >
                                    <option value="">—</option>
                                    {(tagConstants?.difficulty_levels || DIFFICULTY_LEVELS_FALLBACK).map(level => (
                                      <option key={level} value={level}>{level}</option>
                                    ))}
                                  </select>
                                ) : (
                                  c.difficulty && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                      style={{
                                        backgroundColor: (tagConstants?.difficulty_colors?.[c.difficulty] || '') + '20',
                                        color: tagConstants?.difficulty_colors?.[c.difficulty] || undefined,
                                      }}
                                    >
                                      {c.difficulty}
                                    </Badge>
                                  )
                                )}
                                <Badge className="text-xs bg-blue-100 text-blue-700">{c.points} pts</Badge>
                                {editingIndex !== c.index && (
                                  <button
                                    onClick={() => syncTagsMutation.mutate(c.index)}
                                    title="Synchroniser les tags"
                                    className="text-xs text-muted-foreground hover:text-foreground ml-1"
                                    disabled={syncTagsMutation.isPending}
                                  >
                                    {syncTagsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              {!editingIndex || editingIndex !== c.index ? (
                                <Button size="sm" variant="ghost" onClick={() => startEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                              ) : null}
                              <Button size="sm" variant={c.validated ? 'default' : 'outline'}
                                className={c.validated ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                onClick={() => toggleValidate(c)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{c.validated ? 'Validée' : 'Valider'}
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {editingIndex === c.index ? (
                            <>
                              <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block">Correction modèle</label>
                                <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={5} className="text-sm" />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block">Décomposition des points</label>
                                <Textarea value={editPointsDetail} onChange={(e) => setEditPointsDetail(e.target.value)} rows={2} className="text-sm" />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveEdit(c)} disabled={updateMutation.isPending}>
                                  {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}Sauvegarder
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingIndex(null)}>Annuler</Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">Correction modèle :</p>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap bg-white rounded p-2 border">{c.correction || <span className="text-gray-400 italic">Non générée</span>}</p>
                              </div>
                              {c.points_detail && (
                                <div>
                                  <p className="text-xs font-medium text-gray-600 mb-1">Points :</p>
                                  <p className="text-sm text-gray-700 bg-blue-50 rounded p-2">{c.points_detail}</p>
                                </div>
                              )}
                              {c.criteres && c.criteres.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-gray-600 mb-1">Critères :</p>
                                  <ul className="space-y-1">
                                    {c.criteres.map((cr, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 flex-shrink-0" />{cr}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}