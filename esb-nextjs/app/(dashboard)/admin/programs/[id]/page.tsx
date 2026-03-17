'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  useProgram,
  useAddCourseToProgram,
  useRemoveCourseFromProgram,
  useCreateClass,
} from '@/lib/hooks/usePrograms';
import { useCourses } from '@/lib/hooks/useCourses';
import { AddCourseForm } from '@/components/admin/AddCourseForm';
import { ProgramCoursesList } from '@/components/admin/ProgramCoursesList';
import { ProgramClassesList } from '@/components/admin/ProgramClassesList';
import { CreateClassForm } from '@/components/admin/CreateClassForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, ArrowLeft, BookOpen, GraduationCap, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { CreateClassData } from '@/lib/types/admin';

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const programId = parseInt(params.id as string);

  const { data: programData, isLoading: isProgramLoading, error } = useProgram(programId);
  const { data: coursesData } = useCourses();
  const addCourse = useAddCourseToProgram();
  const removeCourse = useRemoveCourseFromProgram();
  const createClass = useCreateClass();

  const handleAddCourse = (courseId: number) => {
    addCourse.mutate({
      programId,
      data: { course_id: courseId },
    });
  };

  const handleRemoveCourse = (courseId: number) => {
    removeCourse.mutate({ programId, courseId });
  };

  const handleCreateClass = (data: CreateClassData) => {
    createClass.mutate({ programId, data });
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as any)?.response?.data?.error || 'Failed to load program details'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isProgramLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  const program = programData?.program;
  if (!program) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Program not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/programs">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Programs
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/programs/${programId}/dashboard`}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold mb-2">{program.name}</h1>
        {program.description && (
          <p className="text-muted-foreground">{program.description}</p>
        )}
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span>{program.courses_count} courses</span>
          <span>{program.classes_count} classes</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Courses Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              <div>
                <CardTitle>Program Courses</CardTitle>
                <CardDescription>
                  Manage courses available in this program
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {coursesData && (
              <AddCourseForm
                availableCourses={coursesData.enrolled_courses}
                programCourses={program.courses}
                onAdd={handleAddCourse}
                isLoading={addCourse.isPending}
              />
            )}
            <Separator />
            <ProgramCoursesList
              courses={program.courses}
              onRemove={handleRemoveCourse}
              isRemoving={removeCourse.isPending}
            />
          </CardContent>
        </Card>

        {/* Classes Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              <div>
                <CardTitle>Program Classes</CardTitle>
                <CardDescription>
                  Create and manage class sections
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CreateClassForm
              onSubmit={handleCreateClass}
              isLoading={createClass.isPending}
            />
            <Separator />
            <ProgramClassesList classes={program.classes} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
