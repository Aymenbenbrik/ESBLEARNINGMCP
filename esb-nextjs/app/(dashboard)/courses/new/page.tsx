'use client';

import { useRouter } from 'next/navigation';
import { useCreateCourse } from '@/lib/hooks/useCourses';
import { CourseForm } from '@/components/courses/CourseForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateCourseData } from '@/lib/types/course';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';

export default function NewCoursePage() {
  const router = useRouter();
  const createMutation = useCreateCourse();

  const handleSubmit = async (data: CreateCourseData) => {
    createMutation.mutate(data, {
      onSuccess: (course) => {
        router.push(`/courses/${course.id}`);
      },
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: 'New Course' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Create New Course</CardTitle>
          <CardDescription>
            Create a new course to organize your educational content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseForm
            onSubmit={handleSubmit}
            isLoading={createMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
