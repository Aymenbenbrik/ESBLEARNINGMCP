'use client';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ProgramCourse } from '@/lib/types/admin';
import { Trash2, BookOpen, Users } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ProgramCoursesListProps {
  courses: ProgramCourse[];
  onRemove: (courseId: number) => void;
  isRemoving?: boolean;
}

export function ProgramCoursesList({ courses, onRemove, isRemoving }: ProgramCoursesListProps) {
  if (courses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No courses added to this program yet.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Course Title</TableHead>
          <TableHead>Teacher</TableHead>
          <TableHead className="text-center">Chapters</TableHead>
          <TableHead className="text-center">Students</TableHead>
          <TableHead className="w-[80px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.map((course) => (
          <TableRow key={course.id}>
            <TableCell>
              <div>
                <div className="font-medium">{course.title}</div>
                {course.description && (
                  <div className="text-sm text-muted-foreground line-clamp-1">
                    {course.description}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell>
              {course.teacher ? (
                <span>{course.teacher.username}</span>
              ) : (
                <Badge variant="outline">No teacher</Badge>
              )}
            </TableCell>
            <TableCell className="text-center">
              <Badge variant="secondary">{course.chapters_count}</Badge>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Users className="h-3 w-3" />
                <span>{course.students_count}</span>
              </div>
            </TableCell>
            <TableCell>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRemoving}
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Course from Program?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove "{course.title}" from the program. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onRemove(course.id)}>
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
