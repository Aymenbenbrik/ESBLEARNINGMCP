'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { QuestionFilters } from '@/components/question-bank/QuestionFilters';
import { QuestionList } from '@/components/question-bank/QuestionList';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCourses } from '@/lib/hooks/useCourses';
import { useQuestionBank, useApproveQuestions } from '@/lib/hooks/useQuestionBank';
import { useExams, useCreateExam, useUpdateExam, useGenerateAnswers } from '@/lib/hooks/useExamBank';
import { useAuth } from '@/lib/hooks/useAuth';
import { QuestionBankFilters } from '@/lib/types/question-bank';
import type { ValidatedExam, CreateExamData } from '@/lib/types/exam-bank';
import { questionBankApi } from '@/lib/api/question-bank';
import {
  AlertCircle, CheckCircle, XCircle, Loader2, Plus, Zap, ToggleLeft, ToggleRight,
  Clock, BookOpen, FileText, ChevronDown, ChevronUp, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

// ── ExamCard component ────────────────────────────────────────────────────────

interface ExamCardProps {
  exam: ValidatedExam;
  isTeacher: boolean;
  onToggleAvailable: (exam: ValidatedExam) => void;
  onGenerateAnswers: (examId: number) => void;
  onEdit: (exam: ValidatedExam) => void;
  isGenerating: boolean;
}

function ExamCard({ exam, isTeacher, onToggleAvailable, onGenerateAnswers, onEdit, isGenerating }: ExamCardProps) {
  const statusColors: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    active: 'bg-green-100 text-green-700 border-green-200',
    archived: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  const statusLabel: Record<string, string> = {
    draft: 'Brouillon',
    active: 'Actif',
    archived: 'Archivé',
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{exam.title}</h3>
            {exam.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{exam.description}</p>
            )}
          </div>
          <Badge className={`text-xs border flex-shrink-0 ${statusColors[exam.status]}`}>
            {statusLabel[exam.status] || exam.status}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />{exam.duration_minutes} min
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="h-3 w-3" />{exam.question_count} questions
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />{exam.total_points} pts
          </span>
        </div>

        {/* Safe exam badges */}
        <div className="flex flex-wrap gap-1">
          {exam.safe_exam_enabled && <Badge variant="outline" className="text-xs">Safe Exam</Badge>}
          {exam.face_id_required && <Badge variant="outline" className="text-xs">FaceID</Badge>}
          {exam.camera_monitoring && <Badge variant="outline" className="text-xs">Caméra</Badge>}
          {exam.fullscreen_required && <Badge variant="outline" className="text-xs">Plein écran</Badge>}
        </div>

        {isTeacher && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            {/* Toggle available */}
            <div className="flex items-center gap-2">
              <Switch
                checked={exam.is_available}
                onCheckedChange={() => onToggleAvailable(exam)}
                className="scale-75"
              />
              <span className="text-xs text-muted-foreground">
                {exam.is_available ? 'Disponible' : 'Non disponible'}
              </span>
            </div>

            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onEdit(exam)}
              >
                <Settings className="h-3 w-3 mr-1" />
                Modifier
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onGenerateAnswers(exam.id)}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3 mr-1" />
                )}
                Générer réponses
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ExamFormDialog ────────────────────────────────────────────────────────────

interface ExamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam?: ValidatedExam | null;
  courseId: number;
  onSave: (data: CreateExamData | Partial<ValidatedExam>) => void;
  isSaving: boolean;
}

function ExamFormDialog({ open, onOpenChange, exam, courseId, onSave, isSaving }: ExamFormDialogProps) {
  const [title, setTitle] = useState(exam?.title || '');
  const [description, setDescription] = useState(exam?.description || '');
  const [duration, setDuration] = useState(exam?.duration_minutes?.toString() || '60');
  const [totalPoints, setTotalPoints] = useState(exam?.total_points?.toString() || '20');
  const [maxAttempts, setMaxAttempts] = useState(exam?.max_attempts?.toString() || '1');
  const [allowRetake, setAllowRetake] = useState(exam?.allow_retake ?? false);
  const [safeExam, setSafeExam] = useState(exam?.safe_exam_enabled ?? false);
  const [fullscreen, setFullscreen] = useState(exam?.fullscreen_required ?? false);
  const [disableCopyPaste, setDisableCopyPaste] = useState(exam?.disable_copy_paste ?? false);
  const [faceId, setFaceId] = useState(exam?.face_id_required ?? false);
  const [cameraMonitoring, setCameraMonitoring] = useState(exam?.camera_monitoring ?? false);

  useEffect(() => {
    if (exam) {
      setTitle(exam.title);
      setDescription(exam.description || '');
      setDuration(exam.duration_minutes.toString());
      setTotalPoints(exam.total_points.toString());
      setMaxAttempts(exam.max_attempts.toString());
      setAllowRetake(exam.allow_retake);
      setSafeExam(exam.safe_exam_enabled);
      setFullscreen(exam.fullscreen_required);
      setDisableCopyPaste(exam.disable_copy_paste);
      setFaceId(exam.face_id_required);
      setCameraMonitoring(exam.camera_monitoring);
    } else {
      setTitle(''); setDescription(''); setDuration('60'); setTotalPoints('20');
      setMaxAttempts('1'); setAllowRetake(false); setSafeExam(false);
      setFullscreen(false); setDisableCopyPaste(false); setFaceId(false); setCameraMonitoring(false);
    }
  }, [exam, open]);

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Le titre est obligatoire'); return; }
    onSave({
      course_id: courseId,
      title: title.trim(),
      description: description.trim() || undefined,
      duration_minutes: parseInt(duration) || 60,
      total_points: parseInt(totalPoints) || 20,
      max_attempts: parseInt(maxAttempts) || 1,
      allow_retake: allowRetake,
      safe_exam_enabled: safeExam,
      fullscreen_required: fullscreen,
      disable_copy_paste: disableCopyPaste,
      face_id_required: faceId,
      camera_monitoring: cameraMonitoring,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{exam ? "Modifier l'épreuve" : "Nouvelle épreuve"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Titre *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de l'épreuve" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description optionnelle" rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Durée (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} min={5} />
            </div>
            <div className="space-y-1">
              <Label>Points total</Label>
              <Input type="number" value={totalPoints} onChange={e => setTotalPoints(e.target.value)} min={1} />
            </div>
            <div className="space-y-1">
              <Label>Tentatives max</Label>
              <Input type="number" value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)} min={1} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Autoriser les reprises</Label>
            <Switch checked={allowRetake} onCheckedChange={setAllowRetake} />
          </div>

          {/* Safe Exam Settings */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Safe Exam</Label>
              <Switch checked={safeExam} onCheckedChange={setSafeExam} />
            </div>
            {safeExam && (
              <div className="space-y-2 pl-2">
                {[
                  ['Plein écran obligatoire', fullscreen, setFullscreen],
                  ['Désactiver Copier/Coller', disableCopyPaste, setDisableCopyPaste],
                  ['Vérification FaceID', faceId, setFaceId],
                  ['Surveillance caméra continue', cameraMonitoring, setCameraMonitoring],
                ].map(([label, value, setter]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <Label className="text-sm font-normal">{label as string}</Label>
                    <Switch checked={value as boolean} onCheckedChange={setter as (v: boolean) => void} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {exam ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── EpreuvesTab ───────────────────────────────────────────────────────────────

interface EpreuvesTabProps {
  courseId: number | null;
  isTeacher: boolean;
  courses: any[];
  onCourseChange: (courseId: number) => void;
}

function EpreuvesTab({ courseId, isTeacher, courses, onCourseChange }: EpreuvesTabProps) {
  const { data: exams, isLoading } = useExams(courseId || 0);
  const createExam = useCreateExam();
  const [editingExam, setEditingExam] = useState<ValidatedExam | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const updateExamMutation = useUpdateExam(editingExam?.id || 0);

  const handleToggleAvailable = async (exam: ValidatedExam) => {
    try {
      await updateExamMutation.mutateAsync({ is_available: !exam.is_available });
      toast.success(exam.is_available ? "Épreuve désactivée" : "Épreuve disponible");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleGenerateAnswers = async (examId: number) => {
    setGeneratingId(examId);
    try {
      const { useGenerateAnswers: genHook } = await import('@/lib/hooks/useExamBank');
      // Call the API directly
      const { examBankApi } = await import('@/lib/api/exam-bank');
      const result = await examBankApi.generateAnswers(examId);
      toast.success(`${result.data.generated_count} réponses générées sur ${result.data.total_questions} questions`);
    } catch {
      toast.error("Erreur lors de la génération des réponses");
    } finally {
      setGeneratingId(null);
    }
  };

  const handleSave = async (data: CreateExamData | Partial<ValidatedExam>) => {
    try {
      if (editingExam) {
        await updateExamMutation.mutateAsync(data as Partial<ValidatedExam>);
        toast.success("Épreuve modifiée");
      } else {
        await createExam.mutateAsync(data as CreateExamData);
        toast.success("Épreuve créée");
      }
      setShowDialog(false);
      setEditingExam(null);
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  return (
    <div className="space-y-4">
      {/* Course selector + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <Select
            value={courseId?.toString() || ''}
            onValueChange={(v) => onCourseChange(parseInt(v))}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Sélectionner un cours..." />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c: any) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isTeacher && courseId && (
          <Button
            size="sm"
            onClick={() => { setEditingExam(null); setShowDialog(true); }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nouvelle épreuve
          </Button>
        )}
      </div>

      {/* Exam list */}
      {!courseId ? (
        <Card>
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold">Sélectionner un cours</h3>
            <p className="text-muted-foreground text-sm mt-1">Choisissez un cours pour voir ses épreuves</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !exams || exams.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold">Aucune épreuve</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {isTeacher ? "Créez la première épreuve pour ce cours." : "Aucune épreuve disponible pour ce cours."}
            </p>
            {isTeacher && (
              <Button className="mt-4" onClick={() => { setEditingExam(null); setShowDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" />
                Créer une épreuve
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {exams.map(exam => (
            <ExamCard
              key={exam.id}
              exam={exam}
              isTeacher={isTeacher}
              onToggleAvailable={handleToggleAvailable}
              onGenerateAnswers={handleGenerateAnswers}
              onEdit={(e) => { setEditingExam(e); setShowDialog(true); }}
              isGenerating={generatingId === exam.id}
            />
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      {showDialog && (
        <ExamFormDialog
          open={showDialog}
          onOpenChange={(open) => { setShowDialog(open); if (!open) setEditingExam(null); }}
          exam={editingExam}
          courseId={courseId || 0}
          onSave={handleSave}
          isSaving={createExam.isPending || updateExamMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Main QuestionBankContent ──────────────────────────────────────────────────

function QuestionBankContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [activeMainTab, setActiveMainTab] = useState<'questions' | 'epreuves'>('questions');
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    migrated: number;
    skipped: number;
    errors: number;
  } | null>(null);

  // Parse filters from URL
  const courseId = searchParams.get('course_id');
  const chapterIds = searchParams.get('chapter_id');
  const aaCodes = searchParams.get('AA');
  const bloomLevel = searchParams.get('bloom_level');
  const difficulty = searchParams.get('difficulty');
  const approved = searchParams.get('approved');
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const limit = 50;

  const { data: coursesData, isLoading: coursesLoading, error: coursesError } = useCourses();
  const isTeacher = user?.is_teacher || user?.is_superuser;

  const filters: QuestionBankFilters = {
    course_id: courseId ? parseInt(courseId, 10) : 0,
    chapter_id: chapterIds || undefined,
    aaa: aaCodes || undefined,
    bloom_level: bloomLevel || undefined,
    difficulty: difficulty || undefined,
    approved: (approved as 'true' | 'false' | 'all') || undefined,
    limit,
    offset,
  };

  const {
    data: questionsData,
    isLoading: questionsLoading,
    error: questionsError,
    refetch: refetchQuestions,
  } = useQuestionBank(filters);

  const approveQuestions = useApproveQuestions();

  const handleCourseChange = (newCourseId: number) => {
    const params = new URLSearchParams();
    params.set('course_id', newCourseId.toString());
    router.push(`${pathname}?${params.toString()}`);
    setSelectedQuestions([]);
  };

  const handlePageChange = (newOffset: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('offset', newOffset.toString());
    router.push(`${pathname}?${params.toString()}`);
    setSelectedQuestions([]);
  };

  const handleBulkApprove = async () => {
    if (selectedQuestions.length === 0 || !courseId) return;
    await approveQuestions.mutateAsync({
      course_id: parseInt(courseId, 10),
      question_ids: selectedQuestions,
      action: 'approve',
    });
    setSelectedQuestions([]);
  };

  const handleBulkReject = async () => {
    if (selectedQuestions.length === 0 || !courseId) return;
    await approveQuestions.mutateAsync({
      course_id: parseInt(courseId, 10),
      question_ids: selectedQuestions,
      action: 'reject',
    });
    setSelectedQuestions([]);
  };

  const handleMigration = async () => {
    if (!courseId) { toast.error('Please select a course first'); return; }
    setIsMigrating(true);
    setMigrationResult(null);
    try {
      const result = await questionBankApi.migrate({ course_id: parseInt(courseId, 10) });
      setMigrationResult(result);
      toast.success(`Migrated ${result.migrated} questions to question bank`);
      refetchQuestions();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Migration failed.';
      toast.error(errorMessage);
    } finally {
      setIsMigrating(false);
    }
  };

  useEffect(() => {
    setSelectedQuestions([]);
    setMigrationResult(null);
  }, [courseId]);

  const showDebugInfo = isTeacher && process.env.NODE_ENV === 'development';

  if (coursesError) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load courses</AlertDescription>
        </Alert>
      </div>
    );
  }

  const courses = coursesData?.enrolled_courses || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Banque de Questions & Épreuves</h1>
        <p className="text-muted-foreground">
          {isTeacher
            ? 'Gérez vos questions et créez des épreuves sécurisées pour vos cours'
            : 'Consultez les questions et épreuves disponibles'}
        </p>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'questions', label: '📚 Questions' },
          { id: 'epreuves', label: '🎯 Épreuves Validées' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveMainTab(tab.id as 'questions' | 'epreuves')}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeMainTab === tab.id
                ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                : 'text-muted-foreground hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Questions Tab */}
      {activeMainTab === 'questions' && (
        <>
          {/* Debug Info Panel */}
          {showDebugInfo && courseId && (
            <Card className="border-yellow-500">
              <CardHeader>
                <CardTitle className="text-sm">🔍 Debug Info (Dev Only)</CardTitle>
              </CardHeader>
              <CardContent className="text-xs font-mono space-y-1">
                <div>Course ID: {courseId}</div>
                <div>Loading: {questionsLoading ? 'Yes' : 'No'}</div>
                <div>Questions Fetched: {questionsData?.questions?.length || 0}</div>
                <div>Total in DB: {questionsData?.total || 0}</div>
                <Button
                  onClick={async () => {
                    try {
                      const stats = await questionBankApi.getDebugStats(parseInt(courseId, 10));
                      console.log('📊 Database Stats:', stats);
                      const statsMessage = `📊 Stats Course ${stats.course_id}\n\nTotal: ${stats.total_questions}\n✅ Approved: ${stats.approved_questions}\n⏳ Unapproved: ${stats.unapproved_questions}`;
                      alert(statsMessage);
                      toast.info('Stats logged to console');
                    } catch (err) {
                      toast.error('Failed to fetch database stats');
                    }
                  }}
                  className="mt-2 w-full"
                  variant="outline"
                  size="sm"
                >
                  Check Database Stats
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filters Sidebar */}
            <div className="lg:col-span-1">
              <QuestionFilters
                courses={courses}
                selectedCourseId={courseId ? parseInt(courseId, 10) : undefined}
                onCourseChange={handleCourseChange}
              />
            </div>

            {/* Questions List */}
            <div className="lg:col-span-3 space-y-4">
              {isTeacher && courseId && selectedQuestions.length > 0 && (
                <Card className="border-primary/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-medium">
                        {selectedQuestions.length} question{selectedQuestions.length !== 1 ? 's' : ''} selected
                      </span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleBulkApprove} disabled={approveQuestions.isPending}>
                          {approveQuestions.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                          Approve
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleBulkReject} disabled={approveQuestions.isPending}>
                          {approveQuestions.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {questionsError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Failed to load questions</AlertDescription>
                </Alert>
              )}

              {!courseId && !coursesLoading && (
                <Card>
                  <CardContent className="p-12">
                    <div className="text-center space-y-2">
                      <h3 className="text-lg font-semibold">Select a Course</h3>
                      <p className="text-muted-foreground">Choose a course from the filters to view questions</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {courseId && (
                <QuestionList
                  questions={questionsData?.questions || []}
                  total={questionsData?.total || 0}
                  totalUnfiltered={questionsData?.total_unfiltered}
                  limit={limit}
                  offset={offset}
                  isLoading={questionsLoading}
                  onPageChange={handlePageChange}
                  showSelection={isTeacher}
                  selectedQuestions={selectedQuestions}
                  onSelectionChange={setSelectedQuestions}
                  courseId={parseInt(courseId, 10)}
                  onMigrate={isTeacher ? handleMigration : undefined}
                  isMigrating={isMigrating}
                  migrationResult={migrationResult}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Épreuves Tab */}
      {activeMainTab === 'epreuves' && (
        <EpreuvesTab
          courseId={courseId ? parseInt(courseId, 10) : null}
          isTeacher={!!isTeacher}
          courses={courses}
          onCourseChange={handleCourseChange}
        />
      )}
    </div>
  );
}

export default function QuestionBankPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Banque de Questions & Épreuves</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <QuestionBankContent />
    </Suspense>
  );
}