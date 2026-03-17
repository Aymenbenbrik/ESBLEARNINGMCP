'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProgramClass } from '@/lib/types/admin';
import { Users, BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import { format } from 'date-fns';

interface ProgramClassesListProps {
  classes: ProgramClass[];
}

export function ProgramClassesList({ classes }: ProgramClassesListProps) {
  if (classes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <GraduationCap className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No classes created for this program yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {classes.map((classItem) => (
        <Card key={classItem.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">{classItem.name}</h3>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    <span>{classItem.students_count} {classItem.students_count === 1 ? 'Student' : 'Students'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    <span>{classItem.courses_count} {classItem.courses_count === 1 ? 'Course' : 'Courses'}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Created {format(new Date(classItem.created_at), 'MMM d, yyyy')}
                </div>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/admin/classes/${classItem.id}`}>
                  Manage
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
