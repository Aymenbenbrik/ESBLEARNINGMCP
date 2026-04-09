import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Course } from '@/lib/types/course';
import { BookOpen, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { CourseProgressBar } from './CourseProgressBar';

interface CourseCardProps {
  course: Course;
  userRole: 'teacher' | 'student';
  onEnroll?: (courseId: number) => void;
  isEnrolling?: boolean;
  progress?: number;
}

export function CourseCard({ course, userRole, onEnroll, isEnrolling, progress }: CourseCardProps) {
  const isTeacher = userRole === 'teacher';
  const isStudent = userRole === 'student';

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2">
              <Link
                href={`/courses/${course.id}`}
                className="hover:underline"
              >
                {course.title}
              </Link>
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {course.description || 'No description provided'}
            </CardDescription>
          </div>
          {course.enrolled_at && (
            <Badge variant="secondary" className="ml-2">Enrolled</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>{course.chapters_count} chapter{course.chapters_count !== 1 ? 's' : ''}</span>
          </div>

          {course.teacher && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{course.teacher.username}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Created {format(new Date(course.created_at), 'MMM d, yyyy')}</span>
          </div>
        </div>

        {/* Progress bar for enrolled students */}
        {isStudent && course.enrolled_at && progress !== undefined && (
          <div className="mt-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">Progression</p>
            <CourseProgressBar progress={progress} size="md" />
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button asChild className="flex-1">
          <Link href={`/courses/${course.id}`}>
            View Course
          </Link>
        </Button>

        {isTeacher && (
          <Button asChild variant="outline">
            <Link href={`/courses/${course.id}/edit`}>
              Edit
            </Link>
          </Button>
        )}

        {isStudent && !course.enrolled_at && onEnroll && (
          <Button
            variant="default"
            onClick={() => onEnroll(course.id)}
            disabled={isEnrolling}
          >
            {isEnrolling ? 'Enrolling...' : 'Enroll'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
