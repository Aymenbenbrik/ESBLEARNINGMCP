'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Users, ChevronRight } from 'lucide-react';
import { Program } from '@/lib/types/admin';

interface ProgramCardProps {
  program: Program;
}

export function ProgramCard({ program }: ProgramCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1">
          <CardTitle className="text-lg font-semibold">{program.name}</CardTitle>
          {program.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {program.description}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              <span>{program.courses_count} {program.courses_count === 1 ? 'Course' : 'Courses'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{program.classes_count} {program.classes_count === 1 ? 'Class' : 'Classes'}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/programs/${program.id}`}>
              View Details
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
