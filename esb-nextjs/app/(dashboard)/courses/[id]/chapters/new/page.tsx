'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCourse } from '@/lib/hooks/useCourses';
import { useCreateChapter } from '@/lib/hooks/useChapters';
import { ChapterForm } from '@/components/chapters/ChapterForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateChapterData } from '@/lib/types/course';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewChapterPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const { data, isLoading } = useCourse(courseId);
  const createMutation = useCreateChapter();

  const handleSubmit = async (formData: CreateChapterData) => {
    createMutation.mutate(
      { courseId, data: formData },
      {
        onSuccess: () => {
          router.push(`/courses/${courseId}`);
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

  const { course, chapters } = data;
  const nextOrder = chapters.length + 1;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: course.title, href: `/courses/${courseId}` },
          { label: 'New Chapter' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Add Chapter</CardTitle>
          <CardDescription>
            Create a new chapter for {course.title}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChapterForm
            onSubmit={handleSubmit}
            isLoading={createMutation.isPending}
            defaultOrder={nextOrder}
          />
        </CardContent>
      </Card>
    </div>
  );
}
