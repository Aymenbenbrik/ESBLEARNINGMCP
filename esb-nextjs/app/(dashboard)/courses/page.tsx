'use client';

import { useCourses, useEnrollCourse } from '@/lib/hooks/useCourses';
import { CourseCard } from '@/components/courses/CourseCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { BookOpen, Plus } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

export default function CoursesPage() {
  const { data, isLoading, error } = useCourses();
  const enrollMutation = useEnrollCourse();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Error loading courses"
          description="There was an error loading your courses. Please try again."
          icon={<BookOpen className="h-12 w-12" />}
        />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { enrolled_courses, available_courses, user_role } = data;
  const isTeacher = user_role === 'teacher';
  const isStudent = user_role === 'student';

  const handleEnroll = (courseId: number) => {
    enrollMutation.mutate(courseId);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">
          {isTeacher ? 'My Courses' : 'Courses'}
        </h1>
        {isTeacher && (
          <Button asChild>
            <Link href="/courses/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Course
            </Link>
          </Button>
        )}
      </div>

      {/* Enrolled Courses */}
      <div className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">
          {isTeacher ? 'Your Courses' : 'Enrolled Courses'}
        </h2>

        {enrolled_courses.length === 0 ? (
          <EmptyState
            title={isTeacher ? 'No courses created' : 'Not enrolled in any courses'}
            description={
              isTeacher
                ? 'Create your first course to get started.'
                : 'Browse available courses below to enroll.'
            }
            icon={<BookOpen className="h-12 w-12" />}
            action={
              isTeacher ? (
                <Button asChild>
                  <Link href="/courses/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Course
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrolled_courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                userRole={user_role}
              />
            ))}
          </div>
        )}
      </div>

      {/* Available Courses (Students Only) */}
      {isStudent && available_courses && available_courses.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Available Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {available_courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                userRole={user_role}
                onEnroll={handleEnroll}
                isEnrolling={enrollMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
