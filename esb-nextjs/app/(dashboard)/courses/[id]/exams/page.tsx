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
  DialogFooter,
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
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { TnExamDocument } from '@/lib/types/course';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title || file.name.replace(/\.[^.]+$/, ''));
    fd.append('exam_type', examType);
    fd.append('weight', weight);
    if (selectedAAIds.length > 0) {
      fd.append('target_aa_ids', selectedAAIds.join(','));
    }
    await uploadMutation.mutateAsync(fd);
    setDialogOpen(false);
    setTitle('');
    setFile(null);
    setExamType('ds');
    setWeight('1');
    setSelectedAAIds([]);
  };

  const isLoading = courseLoading || examsLoading;

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
                <TableHead className="text-center">Barème</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => {
                const meta = (exam.analysis_results as any)?.exam_metadata ?? {};
                const examTypeKey =
                  meta.exam_type ??
                  (exam.analysis_results as any)?.exam_type ??
                  'ds';
                const totalPts =
                  (exam.analysis_results as any)?.total_max_points ?? '—';
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
                    <TableCell className="text-center">
                      {exam.total_questions ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {totalPts !== '—' ? `${totalPts} pts` : '—'}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une épreuve</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Titre (optionnel)</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : DS Algèbre — Janvier 2025"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Type d'épreuve</label>
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
              <label className="text-sm font-medium">Pondération (coefficient)</label>
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
            {courseData?.tn_aa_distribution && courseData.tn_aa_distribution.length > 0 && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Acquis d&apos;Apprentissage ciblés</label>
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
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <p className="text-sm font-medium text-primary">{file.name}</p>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={!file || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? 'Envoi...' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
