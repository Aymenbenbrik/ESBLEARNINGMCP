'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useRef } from 'react';

import { useTnExams, useUploadTnExam } from '@/lib/hooks/useCourses';
import { useCourse } from '@/lib/hooks/useCourses';
import { MultiSelect } from '@/components/shared/MultiSelect';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PlusCircle,
  FileText,
  CheckCircle2,
  Clock,
  ChevronRight,
  Upload,
  ArrowLeft,
  BookOpen,
  Zap,
  Play,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { TnExamDocument } from '@/lib/types/course';
import { toast } from 'sonner';

const EXAM_TYPE_LABELS: Record<string, string> = {
  examen: 'Examen final',
  ds: 'Devoir Surveillé',
  test: 'Test',
  pratique: 'Épreuve pratique',
  rattrapage: 'Rattrapage',
};

const EXAM_TYPE_COLORS: Record<string, string> = {
  examen: 'bg-purple-100 text-purple-800 border-purple-200',
  ds: 'bg-blue-100 text-blue-800 border-blue-200',
  test: 'bg-teal-100 text-teal-800 border-teal-200',
  pratique: 'bg-orange-100 text-orange-800 border-orange-200',
  rattrapage: 'bg-red-100 text-red-800 border-red-200',
};

function StatusBadge({ exam }: { exam: TnExamDocument }) {
  if (exam.has_analysis) {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Analysé
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      <Clock className="h-3 w-3" />
      Non analysé
    </Badge>
  );
}

export default function ExamsPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);

  const { data: courseData, isLoading: courseLoading } = useCourse(courseId);
  const { data: exams, isLoading: examsLoading } = useTnExams(courseId);
  const uploadMutation = useUploadTnExam(courseId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [examType, setExamType] = useState('ds');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [weight, setWeight] = useState('1');
  const [selectedAAIds, setSelectedAAIds] = useState<(string | number)[]>([]);

  const course = courseData?.course;

  const resetForm = () => {
    setTitle('');
    setFile(null);
    setExamType('ds');
    setWeight('1');
    setSelectedAAIds([]);
  };

  const buildFormData = () => {
    if (!file) return null;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title || file.name.replace(/\.[^.]+$/, ''));
    fd.append('exam_type', examType);
    fd.append('weight', weight);
    if (selectedAAIds.length > 0) {
      fd.append('target_aa_ids', selectedAAIds.join(','));
    }
    return fd;
  };

  // Upload only → redirect, auto-extraction will trigger on the exam page
  const handleLaunchAnalysis = async () => {
    const fd = buildFormData();
    if (!fd) return;
    try {
      const res = await uploadMutation.mutateAsync(fd);
      const examId = (res as any)?.data?.exam?.id;
      setDialogOpen(false);
      resetForm();
      if (examId) {
        toast.info('Redirection vers l\'épreuve — l\'analyse démarrera automatiquement…');
        router.push(`/courses/${courseId}/exams/${examId}`);
      }
    } catch {
      // error handled by mutation
    }
  };

  // Upload only → stay on list, no auto-analysis
  const handleWithoutAnalysis = async () => {
    const fd = buildFormData();
    if (!fd) return;
    try {
      await uploadMutation.mutateAsync(fd);
      setDialogOpen(false);
      resetForm();
    } catch {
      // error handled by mutation
    }
  };

  const isLoading = courseLoading || examsLoading;
  const isSubmitting = uploadMutation.isPending;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-5 w-40 mb-8" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/courses/${courseId}`)}
          className="gap-1 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au module
        </Button>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Épreuves</h1>
          </div>
          <p className="text-muted-foreground">{course?.title ?? `Module #${courseId}`}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Ajouter une épreuve
        </Button>
      </div>

      {/* Table */}
      {!exams || exams.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-muted/30">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-lg font-medium mb-1">Aucune épreuve</p>
          <p className="text-sm text-muted-foreground mb-4">
            Commencez par ajouter une épreuve à analyser.
          </p>
          <Button onClick={() => setDialogOpen(true)} variant="outline" className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Ajouter une épreuve
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Titre</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Questions</TableHead>
                <TableHead className="text-center">Exercices</TableHead>
                <TableHead className="text-center">Barème</TableHead>
                <TableHead className="text-center">Couverture</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => {
                const ar = exam.analysis_results as any;
                const examTypeKey = exam.exam_type ?? ar?.exam_header?.exam_type ?? ar?.exam_metadata?.exam_type ?? 'ds';
                const totalPts = ar?.total_max_points ?? '—';
                const nbQ = exam.total_questions ?? ar?.extracted_questions?.length ?? null;
                const nbEx = exam.nb_exercises ?? null;
                const coverage = exam.chapter_coverage_rate ?? ar?.chapter_coverage_rate ?? null;
                return (
                  <TableRow
                    key={exam.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => router.push(`/courses/${courseId}/exams/${exam.id}`)}
                  >
                    <TableCell className="font-medium">
                      {exam.title ?? '(sans titre)'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={EXAM_TYPE_COLORS[examTypeKey] ?? ''}
                      >
                        {EXAM_TYPE_LABELS[examTypeKey] ?? examTypeKey}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {exam.created_at
                        ? format(new Date(exam.created_at), 'dd MMM yyyy', { locale: fr })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      {nbQ != null ? nbQ : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {nbEx != null ? nbEx : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {totalPts !== '—' ? `${totalPts} pts` : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {coverage != null ? (
                        <Badge className={`text-xs ${coverage >= 70 ? 'bg-green-100 text-green-700' : coverage >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {Math.round(coverage)}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge exam={exam} />
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Ajouter une épreuve
            </DialogTitle>
            <DialogDescription>
              Renseignez les informations de l&apos;épreuve puis choisissez de lancer l&apos;analyse automatique ou de procéder manuellement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Titre (optionnel)</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : DS Algèbre — Janvier 2025"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Type d&apos;épreuve</label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXAM_TYPE_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Coefficient</label>
                <Input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="1"
                  min="0"
                  step="0.5"
                  className="h-9"
                />
              </div>
            </div>

            {courseData?.tn_aa_distribution && courseData.tn_aa_distribution.length > 0 && (
              <div className="space-y-1">
                <label className="text-sm font-medium">AA ciblés</label>
                <MultiSelect
                  options={courseData.tn_aa_distribution.map((aa) => ({
                    value: aa.number,
                    label: `AA${aa.number} — ${aa.label}`,
                  }))}
                  selected={selectedAAIds}
                  onChange={setSelectedAAIds}
                  placeholder="Sélectionner les AA ciblés…"
                  searchable
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">Fichier (PDF, DOC, DOCX)</label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  file ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <p className="text-sm font-medium text-primary">{file.name}</p>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Cliquez pour choisir un fichier
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={!file || isSubmitting}
                onClick={handleLaunchAnalysis}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-primary bg-primary/5 p-4 text-center hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                ) : (
                  <Zap className="h-7 w-7 text-primary" />
                )}
                <span className="text-sm font-semibold text-primary">Lancer l&apos;analyse</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  Upload + extraction + Bloom + corrections automatiques
                </span>
              </button>

              <button
                type="button"
                disabled={!file || isSubmitting}
                onClick={handleWithoutAnalysis}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 p-4 text-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="h-7 w-7 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Sans analyse</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  Ajouter uniquement — lancer l&apos;analyse plus tard manuellement
                </span>
              </button>
            </div>

            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setDialogOpen(false); resetForm(); }}
              >
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
