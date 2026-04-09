'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCourse, useCourseDashboard, useDeleteCourse, useUploadModule, useTnExams } from '@/lib/hooks/useCourses';
import { useAAEvaluation, useCalculateAAScores } from '@/lib/hooks/useEvaluation';
import { AAHeatmap } from '@/components/evaluation/AAHeatmap';
import { AAStats } from '@/components/evaluation/AAStats';
import { RefreshCw, Target } from 'lucide-react';
import { CourseHeader } from '@/components/courses/CourseHeader';
import { ChaptersList } from '@/components/courses/ChaptersList';
import { ModuleAttachments } from '@/components/courses/ModuleAttachments';
import { SyllabusViewer } from '@/components/courses/SyllabusViewer';
import { TNNormsDistributionCard } from '@/components/courses/TNNormsDistributionCard';
import { CourseQuizzesList } from '@/components/courses/CourseQuizzesList';
import { StudentProgressCard } from '@/components/courses/StudentProgressCard';
import { DeleteCourseDialog } from '@/components/courses/DeleteCourseDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BarChart3, BookOpen, Database, FileText, CheckCircle2 } from 'lucide-react';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { safeNumber, safePercent } from '@/lib/format';
import { useAuth } from '@/lib/contexts/AuthContext';
import { AttendanceTab } from '@/components/courses/AttendanceTab';
import { GradesTab } from '@/components/courses/GradesTab';
import { ExamTab } from '@/components/courses/ExamTab';
import { StudentsTab } from '@/components/courses/StudentsTab';
import { useExams, usePublishExam, useUnpublishExam } from '@/lib/hooks/useExamBank';
import { Clock, Trophy, Play, Shield, Zap, Globe, EyeOff, BarChart2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GenerateExamDialog } from '@/components/courses/GenerateExamDialog';
import type { TnExamDocument } from '@/lib/types/course';
import type { ValidatedExam } from '@/lib/types/exam-bank';

type TabId = 'description' | 'contenu' | 'dashboard' | 'presence' | 'notes' | 'etudiants' | 'examen' | 'epreuves' | 'epreuve_exam' | 'evaluation_aa';

// ── ExamBankCard — teacher card with publish/unpublish + results ─────────────

function ExamBankCard({ exam, courseId }: { exam: ValidatedExam; courseId: number }) {
  const publishMutation = usePublishExam(courseId);
  const unpublishMutation = useUnpublishExam(courseId);
  const isPending = publishMutation.isPending || unpublishMutation.isPending;

  const handleToggle = () => {
    if (exam.is_available) {
      unpublishMutation.mutate(exam.id);
    } else {
      publishMutation.mutate(exam.id);
    }
  };

  return (
    <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-mono mb-0.5">ID #{exam.id}</p>
          <h3 className="font-semibold text-sm truncate">{exam.title}</h3>
          {exam.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{exam.description}</p>
          )}
        </div>
        <Badge
          variant={exam.is_available ? 'default' : 'secondary'}
          className={`text-xs flex-shrink-0 ${exam.is_available ? 'bg-green-100 text-green-800 border-green-200' : ''}`}
        >
          {exam.is_available ? '● Publié' : '○ Brouillon'}
        </Badge>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration_minutes} min</span>
        <span className="flex items-center gap-1"><Trophy className="h-3 w-3" />{exam.total_points} pts</span>
        <span>{exam.question_count} questions</span>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {exam.safe_exam_enabled && <Badge variant="outline" className="text-xs">Safe</Badge>}
          {exam.face_id_required && <Badge variant="outline" className="text-xs">FaceID</Badge>}
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/courses/${courseId}/exams/${exam.id}/dashboard`}>
              <BarChart2 className="h-3 w-3 mr-1" />
              Résultats
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/courses/${courseId}/exams/${exam.id}/take`}>
              <Play className="h-3 w-3 mr-1" />
              Voir
            </Link>
          </Button>
          <Button
            size="sm"
            variant={exam.is_available ? 'outline' : 'default'}
            className={exam.is_available ? 'text-red-600 border-red-200 hover:bg-red-50' : 'bg-green-600 hover:bg-green-700 text-white'}
            onClick={handleToggle}
            disabled={isPending}
          >
            {exam.is_available
              ? <><EyeOff className="h-3 w-3 mr-1" />Dépublier</>
              : <><Globe className="h-3 w-3 mr-1" />Publier</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const { data, isLoading, error } = useCourse(courseId);
  const deleteMutation = useDeleteCourse();
  const { data: dashboardData } = useCourseDashboard(courseId);
  const uploadModuleMutation = useUploadModule();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { data: availableExams, isLoading: examsLoading } = useExams(courseId);
  const { data: tnExams, isLoading: tnExamsLoading } = useTnExams(courseId);
  const [activeTab, setActiveTab] = useState<TabId>('description');
  const [generateDialogExam, setGenerateDialogExam] = useState<TnExamDocument | null>(null);
  const [editDialogExam, setEditDialogExam] = useState<{ tn: TnExamDocument; validated: ValidatedExam } | null>(null);
  const { user } = useAuth();
  const isTeacher = !!(user?.is_teacher || user?.is_superuser);
  const { data: aaEvalData, isLoading: aaEvalLoading } = useAAEvaluation(courseId, isTeacher && activeTab === 'evaluation_aa');
  const calculateAAMutation = useCalculateAAScores(courseId);

  const handleDelete = () => {
    deleteMutation.mutate(courseId, {
      onSuccess: () => {
        router.push('/courses');
      },
    });
  };

  const handleUploadModule = (uploadData: { title: string; file: File }) => {
    const formData = new FormData();
    formData.append('title', uploadData.title);
    formData.append('file', uploadData.file);

    uploadModuleMutation.mutate({ courseId, data: formData });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Course not found"
          description="The course you're looking for doesn't exist or you don't have access to it."
          icon={<BookOpen className="h-12 w-12" />}
        />
      </div>
    );
  }

  const { course, syllabus, chapters, module_attachments, student_progress, course_quizzes } = data;
  const isStudent = !course.can_edit;
  const isTN = (syllabus?.syllabus_type || '').toLowerCase() === 'tn';

  const tabs: { id: TabId; label: string }[] = [
    { id: 'description', label: 'Description du cours' },
    { id: 'contenu',     label: 'Contenu du module' },
    { id: 'dashboard',   label: isStudent ? 'Mon tableau de bord' : 'Dashboard classe' },
    { id: 'presence',    label: '📋 Présence' },
    { id: 'notes',       label: '📊 Notes' },
    ...(course.can_edit ? [{ id: 'etudiants' as TabId, label: '👥 Étudiants' }] : []),
    ...(course.can_edit && isTN ? [{ id: 'epreuves' as TabId, label: '📝 Préparer épreuve' }] : []),
    ...(course.can_edit && !isTN ? [{ id: 'examen' as TabId, label: '📝 Examen' }] : []),
    ...(course.can_edit ? [{ id: 'evaluation_aa' as TabId, label: '🎯 Évaluation AA' }] : []),
    { id: 'epreuve_exam' as TabId, label: '🎯 Passer une épreuve' },
  ];

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: 'Courses', href: '/courses' },
            { label: course.title },
          ]}
        />

        <CourseHeader
          course={course}
          onDelete={() => setShowDeleteDialog(true)}
          syllabusType={syllabus?.syllabus_type}
        />

        {/* Tab navigation */}
        <div className="flex gap-2 mb-6 border-b border-bolt-line pb-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                ${activeTab === tab.id
                  ? 'bg-white border border-b-white border-bolt-line text-bolt-accent -mb-px'
                  : 'text-muted-foreground hover:text-bolt-ink'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Description du cours */}
        {activeTab === 'description' && (
          <div className="space-y-6">
            {/* Course description/objectives if available */}
            {(course as any).description && (
              <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-5">
                <h2 className="text-lg font-semibold mb-2">Description</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{(course as any).description}</p>
              </div>
            )}

            <SyllabusViewer
              syllabus={syllabus}
              syllabusType={syllabus?.syllabus_type as 'BGA' | 'TN' | null}
              courseId={courseId}
              canEdit={course.can_edit}
            />

            {isTN && (data as any).tn_aa_distribution ? (
              <TNNormsDistributionCard aa={(data as any).tn_aa_distribution} />
            ) : null}

            {course_quizzes && course_quizzes.length > 0 && (
              <CourseQuizzesList
                quizzes={course_quizzes}
                courseId={courseId}
                canEdit={course.can_edit}
                chapters={chapters}
              />
            )}
          </div>
        )}

        {/* Tab 2: Contenu du module */}
        {activeTab === 'contenu' && (
          <div className="space-y-6">
            <ChaptersList
              chapters={chapters}
              courseId={courseId}
              canEdit={course.can_edit}
            />

            {(module_attachments.length > 0 || course.can_edit) && (
              <ModuleAttachments
                modules={module_attachments}
                courseId={courseId}
                canUpload={course.can_edit}
                onUpload={handleUploadModule}
                isUploading={uploadModuleMutation.isPending}
              />
            )}
          </div>
        )}

        {/* Tab 3: Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Teacher view */}
            {course.can_edit && (
              <>
                {dashboardData?.stats && (
                  <div className="rounded-[12px] border border-bolt-line bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">Home KPI</h2>
                        <p className="text-sm text-muted-foreground">Résumé rapide du dashboard de la classe.</p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      {[
                        ['Students', safeNumber(dashboardData.stats.total_students)],
                        ['Quizzes', safeNumber(dashboardData.stats.total_quizzes)],
                        ['Questions', safeNumber(dashboardData.stats.total_questions)],
                        ['Avg score', safePercent(dashboardData.stats.avg_score)],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-2xl border border-bolt-line bg-muted/20 p-4">
                          <p className="text-sm text-muted-foreground">{label}</p>
                          <p className="mt-2 text-2xl font-bold">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link href={`/courses/${courseId}/dashboard`}>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Ouvrir dashboard complet
                    </Link>
                  </Button>
                  {isTeacher && (
                    <Button asChild variant="outline" size="sm" className="rounded-full">
                      <Link href={`/courses/${courseId}/question-bank`}>
                        <Database className="mr-2 h-4 w-4" />
                        Banque de questions
                      </Link>
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* Student view */}
            {isStudent && (
              <>
                {student_progress ? (
                  <StudentProgressCard progress={student_progress} />
                ) : (
                  <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-8 text-center">
                    <p className="text-sm text-muted-foreground">Aucune donnée de progression pour le moment.</p>
                  </div>
                )}

                <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-5">
                  <h3 className="text-base font-semibold mb-2">Mes quizz</h3>
                  <p className="text-sm text-muted-foreground">
                    Consultez vos résultats dans chaque section du cours.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 4: Présence */}
        {activeTab === 'presence' && (
          <AttendanceTab courseId={courseId} canEdit={course.can_edit} />
        )}

        {/* Tab 5: Notes */}
        {activeTab === 'notes' && (
          <GradesTab courseId={courseId} canEdit={course.can_edit} />
        )}

        {/* Tab 6: Étudiants (teachers only) */}
        {activeTab === 'etudiants' && course.can_edit && (
          <StudentsTab courseId={courseId} />
        )}

        {/* Tab 6: Examen (teachers only, non-TN) */}
        {activeTab === 'examen' && course.can_edit && (
          <ExamTab courseId={courseId} canEdit={course.can_edit} courseAAs={(data as any).tn_aa_distribution ?? []} />
        )}

        {/* Tab: Épreuves TN (teachers only, TN syllabus) */}
        {activeTab === 'epreuves' && course.can_edit && isTN && (
          <div className="space-y-4">
            <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-8 flex flex-col items-center text-center gap-4">
              <FileText className="h-14 w-14 text-primary" />
              <div>
                <h2 className="text-xl font-semibold mb-1">Gestion des épreuves</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Ajoutez, analysez et validez les épreuves de ce module.
                  L&apos;analyse IA extrait les questions, barèmes, niveaux Bloom et les aligne avec les Acquis d&apos;Apprentissage.
                </p>
              </div>
              <Button asChild size="lg" className="rounded-full px-8">
                <Link href={`/courses/${courseId}/exams`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Ouvrir les épreuves
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>

        {/* Tab: Évaluation AA (teachers only) */}
        {activeTab === 'evaluation_aa' && course.can_edit && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Évaluation par Acquis d&apos;Apprentissage
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Visualisez les scores de chaque étudiant par AA pour ce cours.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-2"
                onClick={() => calculateAAMutation.mutate()}
                disabled={calculateAAMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 ${calculateAAMutation.isPending ? 'animate-spin' : ''}`} />
                Recalculer les scores AA
              </Button>
            </div>

            {aaEvalLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-[300px]" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-[200px]" />
                  <Skeleton className="h-[200px]" />
                </div>
              </div>
            ) : aaEvalData ? (
              <div className="space-y-6">
                <AAHeatmap data={aaEvalData} />
                <AAStats data={aaEvalData} />
              </div>
            ) : (
              <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-8 text-center">
                <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucune donnée d&apos;évaluation. Cliquez sur &quot;Recalculer les scores AA&quot; pour générer les scores.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Épreuve Exam — visible to all users */}
        {activeTab === 'epreuve_exam' && (
          <div className="space-y-6">
            {/* Teacher view */}
            {course.can_edit && (
              <div className="space-y-6">

                {/* Section: Épreuves TN (préparées) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Épreuves préparées</h2>
                      <p className="text-sm text-muted-foreground">Épreuves analysées et sauvegardées dans &quot;Préparer épreuve&quot;.</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/courses/${courseId}/exams`}>
                        <FileText className="mr-2 h-4 w-4" />
                        Gérer les épreuves
                      </Link>
                    </Button>
                  </div>
                  {tnExamsLoading ? (
                    <div className="flex justify-center py-4"><Skeleton className="h-24 w-full" /></div>
                  ) : !tnExams || tnExams.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-bolt-line bg-muted/20 p-6 text-center">
                      <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Aucune épreuve préparée. Utilisez l&apos;onglet &quot;Préparer épreuve&quot; pour en ajouter.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {tnExams.map(exam => {
                        const linkedExam = availableExams?.find(e => e.tn_exam_id === exam.id);
                        return (
                          <div key={exam.id} className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs text-muted-foreground font-mono mb-0.5">ID #{exam.id}</p>
                                <h3 className="font-semibold text-sm">{exam.title ?? `Épreuve #${exam.id}`}</h3>
                              </div>
                              <Badge
                                variant={exam.has_analysis ? 'default' : 'secondary'}
                                className={`text-xs flex-shrink-0 ${exam.has_analysis ? 'bg-green-100 text-green-800 border-green-200' : ''}`}
                              >
                                {exam.has_analysis ? '✓ Analysée' : 'Non analysée'}
                              </Badge>
                            </div>
                            {exam.total_questions && (
                              <div className="text-xs text-muted-foreground">
                                {exam.total_questions} question{exam.total_questions > 1 ? 's' : ''}
                              </div>
                            )}
                            {linkedExam && (
                              <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Examen en ligne généré — ID #{linkedExam.id}
                              </div>
                            )}
                            <div className="flex gap-2 justify-end">
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/courses/${courseId}/exams/${exam.id}`}>
                                  <Play className="h-3 w-3 mr-1" />
                                  Voir
                                </Link>
                              </Button>
                              {exam.has_analysis && (
                                <Button
                                  size="sm"
                                  className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                                  onClick={() => linkedExam
                                    ? setEditDialogExam({ tn: exam, validated: linkedExam })
                                    : setGenerateDialogExam(exam)
                                  }
                                >
                                  <Zap className="h-3 w-3" />
                                  {linkedExam ? 'Modifier examen' : 'Générer examen'}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section: Épreuves banque de questions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Épreuves en ligne (banque)</h2>
                      <p className="text-sm text-muted-foreground">Gérez les épreuves interactives disponibles pour ce cours.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/courses/${courseId}/course-review`}>
                          <BookOpen className="mr-2 h-4 w-4" />
                          Course Review
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/question-bank?course_id=${courseId}`}>
                          <Shield className="mr-2 h-4 w-4" />
                          Gérer dans la banque
                        </Link>
                      </Button>
                    </div>
                  </div>
                  {examsLoading ? (
                    <div className="flex justify-center py-8"><Skeleton className="h-32 w-full" /></div>
                  ) : !availableExams || availableExams.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-bolt-line bg-muted/20 p-6 text-center">
                      <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Aucune épreuve créée. Créez des épreuves depuis la banque de questions.</p>
                      <Button asChild className="mt-3" size="sm">
                        <Link href={`/question-bank?course_id=${courseId}`}>Créer une épreuve</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {availableExams.map(exam => (
                        <ExamBankCard
                          key={exam.id}
                          exam={exam}
                          courseId={courseId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Student view */}
            {!course.can_edit && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Épreuves disponibles</h2>
                  <p className="text-sm text-muted-foreground">Passez les épreuves assignées à ce cours.</p>
                </div>
                {examsLoading ? (
                  <div className="flex justify-center py-8"><Skeleton className="h-32 w-full" /></div>
                ) : !availableExams || availableExams.filter(e => e.is_available).length === 0 ? (
                  <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-8 text-center">
                    <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-semibold">Aucune épreuve disponible</p>
                    <p className="text-sm text-muted-foreground mt-1">Votre enseignant n&apos;a pas encore activé d&apos;épreuve pour ce cours.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {availableExams.filter(e => e.is_available).map(exam => (
                      <div key={exam.id} className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-5 space-y-4">
                        <div>
                          <h3 className="font-semibold">{exam.title}</h3>
                          {exam.description && <p className="text-sm text-muted-foreground mt-1">{exam.description}</p>}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-blue-50 rounded p-2">
                            <Clock className="h-4 w-4 text-blue-500 mx-auto mb-0.5" />
                            <p className="font-semibold">{exam.duration_minutes} min</p>
                          </div>
                          <div className="bg-purple-50 rounded p-2">
                            <p className="text-lg font-bold text-purple-600">{exam.question_count}</p>
                            <p className="text-muted-foreground">questions</p>
                          </div>
                          <div className="bg-green-50 rounded p-2">
                            <Trophy className="h-4 w-4 text-green-500 mx-auto mb-0.5" />
                            <p className="font-semibold">{exam.total_points} pts</p>
                          </div>
                        </div>
                        {exam.safe_exam_enabled && (
                          <div className="flex gap-1 flex-wrap">
                            <Badge variant="outline" className="text-xs"><Shield className="h-3 w-3 mr-1" />Safe Exam</Badge>
                            {exam.face_id_required && <Badge variant="outline" className="text-xs">FaceID requis</Badge>}
                          </div>
                        )}
                        <Button asChild className="w-full">
                          <Link href={`/courses/${courseId}/exams/${exam.id}/take`}>
                            <Play className="h-4 w-4 mr-2" />
                            Commencer l&apos;épreuve
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      <DeleteCourseDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        courseId={courseId}
        courseName={course.title}
        onDelete={handleDelete}
      />

      {/* Generate exam dialog */}
      {generateDialogExam && (
        <GenerateExamDialog
          open={!!generateDialogExam}
          onOpenChange={open => { if (!open) setGenerateDialogExam(null); }}
          tnExam={generateDialogExam}
          courseId={courseId}
        />
      )}

      {/* Edit generated exam dialog */}
      {editDialogExam && (
        <GenerateExamDialog
          open={!!editDialogExam}
          onOpenChange={open => { if (!open) setEditDialogExam(null); }}
          tnExam={editDialogExam.tn}
          courseId={courseId}
          existingExam={editDialogExam.validated}
        />
      )}
    </>
  );
}
