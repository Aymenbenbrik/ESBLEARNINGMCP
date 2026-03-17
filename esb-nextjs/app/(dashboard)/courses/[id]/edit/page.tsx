'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCourse, useUpdateCourse } from '@/lib/hooks/useCourses';
import { CourseForm } from '@/components/courses/CourseForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UpdateCourseData } from '@/lib/types/course';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditCoursePage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const { data, isLoading } = useCourse(courseId);
  const updateMutation = useUpdateCourse();

  const handleSubmit = async (formData: UpdateCourseData) => {
    updateMutation.mutate(
      { id: courseId, data: formData },
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

  const { course } = data;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: course.title, href: `/courses/${courseId}` },
          { label: 'Edit' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Edit Course</CardTitle>
          <CardDescription>
            Update your course information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseForm
            initialData={{
              id: course.id,
              title: course.title,
              description: course.description || '',
              teacher_id: course.teacher_id,
              created_at: course.created_at,
              updated_at: course.updated_at,
              chapters_count: 0,
            }}
            onSubmit={handleSubmit}
            isLoading={updateMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
