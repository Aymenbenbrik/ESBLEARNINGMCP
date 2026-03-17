'use client';

import { useParams } from 'next/navigation';
import {
  useClassDetail,
  useClassStudents,
  useAssignTeachers,
  useUpdateClassStudents,
} from '@/lib/hooks/useAdmin';
import { TeacherAssignmentTable } from '@/components/admin/TeacherAssignmentTable';
import { ClassStudentsList } from '@/components/admin/ClassStudentsList';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, ArrowLeft, UserCheck, Users, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { AssignTeachersData, UpdateClassStudentsData } from '@/lib/types/admin';

export default function ClassDetailPage() {
  const params = useParams();
  const classId = parseInt(params.id as string);

  const { data: classData, isLoading: isClassLoading, error: classError } = useClassDetail(classId);
  const {
    data: studentsData,
    isLoading: isStudentsLoading,
    error: studentsError,
  } = useClassStudents(classId);
  const assignTeachers = useAssignTeachers();
  const updateStudents = useUpdateClassStudents();

  const handleAssignTeachers = (assignments: { course_id: number; teacher_id: number | null }[]) => {
    const data: AssignTeachersData = { assignments };
    assignTeachers.mutate({ classId, data });
  };

  const handleUpdateStudents = (studentIds: number[]) => {
    const data: UpdateClassStudentsData = { student_ids: studentIds };
    updateStudents.mutate({ classId, data });
  };

  if (classError || studentsError) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(classError as any)?.response?.data?.error ||
              (studentsError as any)?.response?.data?.error ||
              'Failed to load class details'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isClassLoading || isStudentsLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  const classDetail = classData?.class;
  if (!classDetail) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Class not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/admin/programs/${classDetail.program_id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Program
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/classes/${classId}/dashboard`}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </Link>
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">{classDetail.name}</h1>
          <Badge variant="outline">{classDetail.program_name}</Badge>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{classDetail.students_count} students enrolled</span>
          <span>{classData?.assignments?.length || 0} course assignments</span>
        </div>
      </div>

      <Tabs defaultValue="teachers" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="teachers">
            <UserCheck className="h-4 w-4 mr-2" />
            Teacher Assignments
          </TabsTrigger>
          <TabsTrigger value="students">
            <Users className="h-4 w-4 mr-2" />
            Student Roster
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teachers" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Assign Teachers to Courses</CardTitle>
              <CardDescription>
                Select a teacher for each course in this class. Teachers can manage course content and
                grade student work.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {classData && (
                <TeacherAssignmentTable
                  assignments={classData.assignments}
                  availableTeachers={classData.available_teachers}
                  onSave={handleAssignTeachers}
                  isLoading={assignTeachers.isPending}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Manage Student Roster</CardTitle>
              <CardDescription>
                Select students to enroll in this class. Students will gain access to all assigned
                courses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {studentsData && (
                <ClassStudentsList
                  data={studentsData}
                  onSave={handleUpdateStudents}
                  isLoading={updateStudents.isPending}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
