'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCourse, useCourseDashboard, useDeleteCourse, useUploadModule } from '@/lib/hooks/useCourses';
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
import { BarChart3, BookOpen, Database, FileText } from 'lucide-react';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { safeNumber, safePercent } from '@/lib/format';
import { useAuth } from '@/lib/contexts/AuthContext';
import { AttendanceTab } from '@/components/courses/AttendanceTab';
import { GradesTab } from '@/components/courses/GradesTab';
import { ExamTab } from '@/components/courses/ExamTab';

type TabId = 'description' | 'contenu' | 'dashboard' | 'presence' | 'notes' | 'examen' | 'epreuves';

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const { data, isLoading, error } = useCourse(courseId);
  const deleteMutation = useDeleteCourse();
  const { data: dashboardData } = useCourseDashboard(courseId);
  const uploadModuleMutation = useUploadModule();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('description');
  const { user } = useAuth();
  const isTeacher = !!(user?.is_teacher || user?.is_superuser);

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
    ...(course.can_edit && isTN ? [{ id: 'epreuves' as TabId, label: '📝 Épreuves' }] : []),
    ...(course.can_edit && !isTN ? [{ id: 'examen' as TabId, label: '📝 Examen' }] : []),
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

      <DeleteCourseDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        courseId={courseId}
        courseName={course.title}
        onDelete={handleDelete}
      />
    </>
  );
}
