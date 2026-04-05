'use client';

import { useState, useEffect, useMemo } from 'react';
import { useGenerateFromTn, useUpdateExam, usePublishExam, useUnpublishExam } from '@/lib/hooks/useExamBank';
import type { TnExamDocument, TnExamQuestion, ExtractedQuestion } from '@/lib/types/course';
import type { ValidatedExam } from '@/lib/types/exam-bank';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  FileText, Lock, Clock, Trophy, CheckCircle2,
  ChevronDown, ChevronUp, Loader2, Eye, EyeOff,
  Globe, BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

interface EditableQuestion {
  originalId?: number;
  exercise_number: number;
  exercise_title: string;
  text: string;
  points: number;
  bloom_level?: string;
  difficulty?: string;
  question_type?: string;
  estimated_time_min?: number | null;
}

interface ExerciseGroup {
  number: number;
  title: string;
  questions: EditableQuestion[];
  totalPoints: number;
}

interface GenerateExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tnExam: TnExamDocument;
  courseId: number;
  existingExam?: ValidatedExam;
  onSuccess?: (exam: ValidatedExam) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractQuestions(tnExam: TnExamDocument): EditableQuestion[] {
  const ar = tnExam.analysis_results;
  if (!ar) return [];

  // Prefer extracted_questions (Gemini Vision) over questions
  const extracted = (ar as any).extracted_questions as ExtractedQuestion[] | undefined;
  if (extracted && extracted.length > 0) {
    return extracted.map((q, i) => ({
      originalId: q.id,
      exercise_number: q.exercise_number ?? 1,
      exercise_title: q.exercise_title ?? `Exercice ${q.exercise_number ?? 1}`,
      text: q.text ?? '',
      points: q.points ?? 1,
      bloom_level: q.bloom_level,
      difficulty: q.difficulty,
      question_type: q.question_type,
      estimated_time_min: q.estimated_time_min,
    }));
  }

  const raw = (ar.questions as TnExamQuestion[]) ?? [];
  return raw.map((q, i) => ({
    originalId: q.id,
    exercise_number: (q as any).exercise_number ?? 1,
    exercise_title: (q as any).exercise_title ?? `Exercice ${(q as any).exercise_number ?? 1}`,
    text: q.text ?? q.question_text ?? `Question ${i + 1}`,
    points: q.points ?? 1,
    bloom_level: q.Bloom_Level,
    difficulty: q.Difficulty,
    question_type: q.Type,
    estimated_time_min: q.estimated_time_min,
  }));
}

function groupByExercise(questions: EditableQuestion[]): ExerciseGroup[] {
  const map = new Map<number, ExerciseGroup>();
  for (const q of questions) {
    if (!map.has(q.exercise_number)) {
      map.set(q.exercise_number, {
        number: q.exercise_number,
        title: q.exercise_title,
        questions: [],
        totalPoints: 0,
      });
    }
    const group = map.get(q.exercise_number)!;
    group.questions.push(q);
    group.totalPoints += q.points;
  }
  return Array.from(map.values()).sort((a, b) => a.number - b.number);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GenerateExamDialog({
  open, onOpenChange, tnExam, courseId, existingExam, onSuccess,
}: GenerateExamDialogProps) {
  const ar = tnExam.analysis_results;
  const meta = (ar?.exam_metadata as any) ?? {};
  const header = (ar as any)?.extracted_header ?? {};

  // ── Header fields ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [module_, setModule] = useState('');
  const [niveau, setNiveau] = useState('');
  const [specialite, setSpecialite] = useState('');
  const [semestre, setSemestre] = useState('');
  const [enseignant, setEnseignant] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examType, setExamType] = useState('');

  // ── Exam config ────────────────────────────────────────────────────────────
  const [duration, setDuration] = useState('60');
  const [totalPoints, setTotalPoints] = useState('20');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [safeExam, setSafeExam] = useState(true);
  const [fullscreen, setFullscreen] = useState(true);
  const [disableCopyPaste, setDisableCopyPaste] = useState(true);

  // ── Questions ──────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [expandedExercises, setExpandedExercises] = useState<Set<number>>(new Set([1]));

  // ── UI state ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'config' | 'done'>('config');
  const [createdExam, setCreatedExam] = useState<ValidatedExam | null>(null);

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const generateMutation = useGenerateFromTn(courseId);
  const updateMutation = useUpdateExam(existingExam?.id ?? 0);
  const publishMutation = usePublishExam(courseId);

  const exercises = useMemo(() => groupByExercise(questions), [questions]);
  const computedTotal = useMemo(
    () => questions.reduce((s, q) => s + q.points, 0),
    [questions]
  );

  // ── Sync on open ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStep('config');
    setCreatedExam(null);

    const extracted = extractQuestions(tnExam);
    setQuestions(extracted);
    setExpandedExercises(new Set([...new Set(extracted.map(q => q.exercise_number))]));

    if (existingExam) {
      setTitle(existingExam.title);
      setDuration(String(existingExam.duration_minutes));
      setTotalPoints(String(existingExam.total_points));
      setPassword('');
      setSafeExam(existingExam.safe_exam_enabled);
      setFullscreen(existingExam.fullscreen_required);
      setDisableCopyPaste(existingExam.disable_copy_paste);
    } else {
      // Import header from TN exam
      setTitle(tnExam.title ?? meta.exam_name ?? `Épreuve #${tnExam.id}`);
      setModule(meta.module ?? header.class_name ?? '');
      setNiveau(meta.niveau ?? '');
      setSpecialite(meta.specialite ?? header.department ?? '');
      setSemestre(meta.semestre ?? '');
      setEnseignant(meta.enseignant ?? (header.instructors?.[0] ?? ''));
      setExamDate(meta.date ?? header.exam_date ?? '');
      setExamType(meta.exam_type ?? '');
      const dur = meta.declared_duration_min ?? ar?.declared_duration_min ?? header.declared_duration_min ?? 60;
      setDuration(String(dur));
      const rawPts = ((ar as any)?.total_max_points ?? extracted.reduce((s, q) => s + (q.points ?? 0), 0)) || 20;
      setTotalPoints(String(rawPts));
      setPassword('');
      setSafeExam(true);
      setFullscreen(true);
      setDisableCopyPaste(true);
    }
  }, [open]);

  // ── Question edits ─────────────────────────────────────────────────────────
  const updateQuestionText = (exerciseNum: number, qIdx: number, text: string) => {
    setQuestions(prev => {
      let globalIdx = 0;
      for (const q of prev) {
        if (q.exercise_number === exerciseNum) {
          if (qIdx === 0) break;
          qIdx--;
        }
        globalIdx++;
      }
      return prev.map((q, i) => {
        if (q.exercise_number === exerciseNum) {
          // find the right one
        }
        return q;
      });
    });
    // simpler approach:
    setQuestions(prev => {
      let counter = -1;
      return prev.map(q => {
        if (q.exercise_number === exerciseNum) {
          counter++;
          if (counter === qIdx) return { ...q, text };
        }
        return q;
      });
    });
  };

  const updateQuestionPoints = (exerciseNum: number, qIdx: number, pts: string) => {
    let counter = -1;
    setQuestions(prev => prev.map(q => {
      if (q.exercise_number === exerciseNum) {
        counter++;
        if (counter === qIdx) return { ...q, points: parseFloat(pts) || 0 };
      }
      return q;
    }));
  };

  const toggleExercise = (num: number) => {
    setExpandedExercises(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  // ── Build description from header ──────────────────────────────────────────
  const buildDescription = () => {
    const parts: string[] = [];
    if (module_)    parts.push(`Module : ${module_}`);
    if (niveau)     parts.push(`Niveau : ${niveau}`);
    if (specialite) parts.push(`Spécialité : ${specialite}`);
    if (semestre)   parts.push(`Semestre : ${semestre}`);
    if (enseignant) parts.push(`Enseignant : ${enseignant}`);
    if (examDate)   parts.push(`Date : ${examDate}`);
    if (examType)   parts.push(`Type : ${examType}`);
    return parts.join('\n');
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) { toast.error('Le titre est requis.'); return; }

    const payload = {
      title: title.trim(),
      description: buildDescription() || undefined,
      duration_minutes: parseInt(duration) || 60,
      total_points: parseFloat(totalPoints) || computedTotal || 20,
      exam_password: password.trim() || undefined,
      safe_exam_enabled: safeExam,
      fullscreen_required: fullscreen,
      disable_copy_paste: disableCopyPaste,
      questions: questions.map(q => ({
        text: q.text,
        Text: q.text,
        points: q.points,
        Bloom_Level: q.bloom_level,
        Difficulty: q.difficulty,
        Type: q.question_type,
        exercise_number: q.exercise_number,
        exercise_title: q.exercise_title,
      })),
    };

    try {
      let result: ValidatedExam;
      if (existingExam) {
        result = await updateMutation.mutateAsync({
          title: payload.title,
          description: payload.description,
          duration_minutes: payload.duration_minutes,
          total_points: payload.total_points,
          exam_password: payload.exam_password,
          safe_exam_enabled: payload.safe_exam_enabled,
          fullscreen_required: payload.fullscreen_required,
          disable_copy_paste: payload.disable_copy_paste,
        });
        toast.success(`Épreuve #${result.id} mise à jour !`);
        onSuccess?.(result);
        onOpenChange(false);
      } else {
        result = await generateMutation.mutateAsync({
          tn_exam_id: tnExam.id,
          course_id: courseId,
          ...payload,
        });
        setCreatedExam(result);
        setStep('done');
        toast.success(`Épreuve générée — ID #${result.id}`);
        onSuccess?.(result);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Erreur lors de la génération");
    }
  };

  const handlePublish = async () => {
    const id = createdExam?.id ?? existingExam?.id;
    if (!id) return;
    try {
      await publishMutation.mutateAsync(id);
      toast.success('Épreuve publiée — visible aux étudiants !');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur lors de la publication');
    }
  };

  const isSaving = generateMutation.isPending || updateMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === 'done' && createdExam) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              Examen généré avec succès
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-1">
              <p className="font-semibold">{createdExam.title}</p>
              <p className="text-sm text-muted-foreground font-mono">ID #{createdExam.id}</p>
              <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{createdExam.duration_minutes} min</span>
                <span className="flex items-center gap-1"><Trophy className="h-3 w-3" />{createdExam.total_points} pts</span>
                <span>{createdExam.question_count} questions</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              L&apos;épreuve est en mode <strong>brouillon</strong>. Publiez-la pour la rendre visible aux étudiants.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Plus tard
            </Button>
            <Button
              onClick={handlePublish}
              disabled={publishMutation.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {publishMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Globe className="h-4 w-4" />}
              Publier maintenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {existingExam ? `Modifier l'épreuve #${existingExam.id}` : 'Générer un examen en ligne'}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Source : <span className="font-medium">{tnExam.title ?? `Épreuve TN #${tnExam.id}`}</span>
          </p>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* ── Titre ────────────────────────────────────────────────────── */}
          <div className="space-y-1">
            <Label htmlFor="g-title">Titre de l&apos;épreuve *</Label>
            <Input id="g-title" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Ex : DS Algèbre — Janvier 2025" />
          </div>

          {/* ── En-tête importé ───────────────────────────────────────────── */}
          <section className="space-y-3 rounded-lg border border-bolt-line bg-muted/20 p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              En-tête de l&apos;épreuve <span className="text-xs font-normal text-muted-foreground">(importé automatiquement)</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Module / Matière</Label>
                <Input value={module_} onChange={e => setModule(e.target.value)} placeholder="Ex : Algèbre 1" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type d&apos;épreuve</Label>
                <Input value={examType} onChange={e => setExamType(e.target.value)} placeholder="DS, Examen final…" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Niveau / Classe</Label>
                <Input value={niveau} onChange={e => setNiveau(e.target.value)} placeholder="Ex : L2" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Spécialité / Filière</Label>
                <Input value={specialite} onChange={e => setSpecialite(e.target.value)} placeholder="Ex : Informatique" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Semestre</Label>
                <Input value={semestre} onChange={e => setSemestre(e.target.value)} placeholder="Ex : S3" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Enseignant</Label>
                <Input value={enseignant} onChange={e => setEnseignant(e.target.value)} placeholder="Nom de l'enseignant" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input value={examDate} onChange={e => setExamDate(e.target.value)} placeholder="Ex : 15/01/2025" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" />Durée (min)</Label>
                <Input type="number" min="1" value={duration} onChange={e => setDuration(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Questions par exercice ────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Questions par exercice
                <Badge variant="outline" className="text-xs">{questions.length} questions</Badge>
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Total :
                <Input
                  type="number" min="0" step="0.5"
                  value={totalPoints}
                  onChange={e => setTotalPoints(e.target.value)}
                  className="h-7 w-20 text-xs inline-block"
                />
                pts
              </div>
            </div>

            {exercises.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                Aucune question extraite. Analysez l&apos;épreuve TN d&apos;abord.
              </div>
            ) : (
              <div className="space-y-2">
                {exercises.map((ex) => (
                  <div key={ex.number} className="rounded-lg border border-bolt-line overflow-hidden">
                    {/* Exercise header */}
                    <button
                      type="button"
                      onClick={() => toggleExercise(ex.number)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 text-sm font-medium">
                        <span className="text-primary font-semibold">Exercice {ex.number}</span>
                        {ex.title && ex.title !== `Exercice ${ex.number}` && (
                          <span className="text-muted-foreground">— {ex.title}</span>
                        )}
                        <Badge variant="secondary" className="text-xs">{ex.questions.length} Q</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-muted-foreground">{ex.totalPoints.toFixed(1)} pts</span>
                        {expandedExercises.has(ex.number)
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Questions */}
                    {expandedExercises.has(ex.number) && (
                      <div className="divide-y divide-bolt-line">
                        {ex.questions.map((q, qi) => (
                          <div key={qi} className="px-4 py-3 space-y-2 bg-white">
                            <div className="flex items-start gap-3">
                              <span className="text-xs font-mono text-muted-foreground mt-2 shrink-0 w-5">
                                {qi + 1}.
                              </span>
                              <Textarea
                                value={q.text}
                                onChange={e => updateQuestionText(ex.number, qi, e.target.value)}
                                rows={2}
                                className="text-sm resize-none flex-1"
                              />
                              <div className="shrink-0 w-16 space-y-0.5">
                                <span className="text-xs text-muted-foreground">Pts</span>
                                <Input
                                  type="number" min="0" step="0.5"
                                  value={q.points}
                                  onChange={e => updateQuestionPoints(ex.number, qi, e.target.value)}
                                  className="h-8 text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex gap-1 ml-8 flex-wrap">
                              {q.bloom_level && <Badge variant="outline" className="text-xs bg-blue-50">{q.bloom_level}</Badge>}
                              {q.difficulty && <Badge variant="outline" className="text-xs bg-orange-50">{q.difficulty}</Badge>}
                              {q.question_type && <Badge variant="outline" className="text-xs">{q.question_type}</Badge>}
                              {q.estimated_time_min && (
                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />{q.estimated_time_min} min
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* ── Sécurité ──────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Sécurité & accès
            </h3>

            <div className="space-y-1">
              <Label htmlFor="g-pwd" className="flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" /> Mot de passe (optionnel)
              </Label>
              <div className="relative">
                <Input
                  id="g-pwd"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Laisser vide = pas de mot de passe"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { id: 'sw-safe', label: 'Safe Exam', val: safeExam, set: setSafeExam },
                { id: 'sw-fs', label: 'Plein écran', val: fullscreen, set: setFullscreen },
                { id: 'sw-cp', label: 'Bloquer copier', val: disableCopyPaste, set: setDisableCopyPaste },
              ].map(({ id, label, val, set }) => (
                <div key={id} className="flex items-center justify-between rounded-lg border border-bolt-line p-3 gap-2">
                  <Label htmlFor={id} className="text-sm cursor-pointer">{label}</Label>
                  <Switch id={id} checked={val} onCheckedChange={set} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CheckCircle2 className="h-4 w-4" />}
            {existingExam ? 'Sauvegarder' : 'Générer l\'examen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
