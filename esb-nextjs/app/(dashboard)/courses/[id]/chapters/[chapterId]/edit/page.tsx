'use client';

import { useParams, useRouter } from 'next/navigation';
import { useChapter, useUpdateChapter } from '@/lib/hooks/useChapters';
import { ChapterForm } from '@/components/chapters/ChapterForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UpdateChapterData } from '@/lib/types/course';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditChapterPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = parseInt(params.chapterId as string);
  const courseId = parseInt(params.id as string);
  const { data, isLoading } = useChapter(chapterId);
  const updateMutation = useUpdateChapter();

  const handleSubmit = async (formData: UpdateChapterData) => {
    updateMutation.mutate(
      { id: chapterId, data: formData },
      {
        onSuccess: () => {
          router.push(`/courses/${courseId}/chapters/${chapterId}`);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { chapter, course } = data;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: course.title, href: `/courses/${courseId}` },
          { label: chapter.title, href: `/courses/${courseId}/chapters/${chapterId}` },
          { label: 'Edit' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Edit Chapter</CardTitle>
          <CardDescription>
            Update the chapter information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChapterForm
            initialData={{
              id: chapter.id,
              title: chapter.title,
              order: chapter.order,
              course_id: chapter.course_id,
              created_at: chapter.created_at,
              updated_at: chapter.updated_at,
              documents_count: 0,
              has_summary: chapter.has_summary,
            }}
            onSubmit={handleSubmit}
            isLoading={updateMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
