import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CourseDetails } from '@/lib/types/course';
import { ClipboardList, Pencil, Trash2, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface CourseHeaderProps {
  course: CourseDetails['course'];
  onDelete?: () => void;
  syllabusType?: 'bga' | 'tn' | null;
}

export function CourseHeader({ course, onDelete, syllabusType }: CourseHeaderProps) {
  return (
    <div className="border-b pb-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2">{course.title}</h1>
          {course.description && (
            <p className="text-muted-foreground text-lg">{course.description}</p>
          )}
        </div>

        <div className="flex gap-2 ml-4">
          {/* Practice Quiz Button - Show ONLY for TN syllabus type and students */}
          {syllabusType === 'tn' && !course.can_edit && (
            <Button asChild variant="default" size="sm" className="bg-green-600 hover:bg-green-700">
              <Link href={`/courses/${course.id}/practice-quiz/setup`}>
                <ClipboardList className="h-4 w-4 mr-2" />
                Practice Quiz
              </Link>
            </Button>
          )}

          {/* Teacher-only buttons */}
          {course.can_edit && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/courses/${course.id}/edit`}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
              {onDelete && (
                <Button variant="destructive" size="sm" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span>{course.teacher.username}</span>
          {course.teacher.email && (
            <span className="text-xs">({course.teacher.email})</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>Created {format(new Date(course.created_at), 'MMM d, yyyy')}</span>
        </div>

        {course.can_edit && (
          <Badge variant="secondary">Teacher</Badge>
        )}
      </div>
    </div>
  );
}
