'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Users, ChevronRight, Target, FileText } from 'lucide-react';
import { Program } from '@/lib/types/admin';

interface ProgramCardProps {
  program: Program;
}

export function ProgramCard({ program }: ProgramCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg font-semibold">{program.name}</CardTitle>
            {program.code && (
              <Badge variant="outline" className="text-xs font-mono">
                {program.code}
              </Badge>
            )}
            {program.program_type && (
              <Badge variant="secondary" className="text-xs">
                {program.program_type}
              </Badge>
            )}
          </div>
          {program.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {program.description}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              <span>{program.courses_count} {program.courses_count === 1 ? 'Module' : 'Modules'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{program.classes_count} {program.classes_count === 1 ? 'Classe' : 'Classes'}</span>
            </div>
            {(program.aaps_count != null && program.aaps_count > 0) && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Target className="h-4 w-4" />
                <span>{program.aaps_count} AAP</span>
              </div>
            )}
            {(program.competences_count != null && program.competences_count > 0) && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{program.competences_count} Comp.</span>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/programs/${program.id}`}>
              Détails
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
