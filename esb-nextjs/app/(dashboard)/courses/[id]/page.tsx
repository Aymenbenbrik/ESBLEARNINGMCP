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
import { BarChart3, BookOpen } from 'lucide-react';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { safeNumber, safePercent } from '@/lib/format';

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const { data, isLoading, error } = useCourse(courseId);
  const deleteMutation = useDeleteCourse();
  const { data: dashboardData } = useCourseDashboard(courseId);
  const uploadModuleMutation = useUploadModule();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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

        {course.can_edit && dashboardData?.stats ? (
          <div className="mb-6 rounded-[24px] border border-bolt-line bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Home KPI</h2>
                <p className="text-sm text-muted-foreground">Résumé rapide du dashboard directement dans la home du module.</p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href={`/courses/${courseId}/dashboard`}>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Ouvrir dashboard
                </Link>
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ['Students', safeNumber(dashboardData?.stats?.total_students)],
                ['Quizzes', safeNumber(dashboardData?.stats?.total_quizzes)],
                ['Questions', safeNumber(dashboardData?.stats?.total_questions)],
                ['Avg score', safePercent(dashboardData?.stats?.avg_score)],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-bolt-line bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Syllabus */}
            <SyllabusViewer
              syllabus={syllabus}
              syllabusType={syllabus?.syllabus_type as 'BGA' | 'TN' | null}
              courseId={courseId}
              canEdit={course.can_edit}
            />

            {/* TN Norms Distribution (AAA) */}
            {isTN && (data as any).tn_aa_distribution ? (
              <TNNormsDistributionCard aa={(data as any).tn_aa_distribution} />
            ) : null}

            {/* Course Quizzes */}
            {course_quizzes && course_quizzes.length > 0 && (
              <CourseQuizzesList
                quizzes={course_quizzes}
                courseId={courseId}
                canEdit={course.can_edit}
                chapters={chapters}
              />
            )}

            {/* Chapters */}
            <ChaptersList
              chapters={chapters}
              courseId={courseId}
              canEdit={course.can_edit}
            />

            {/* Module Attachments */}
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

          <div className="space-y-6">
            {/* Student Progress */}
            {isStudent && student_progress && (
              <StudentProgressCard progress={student_progress} />
            )}
          </div>
        </div>
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
