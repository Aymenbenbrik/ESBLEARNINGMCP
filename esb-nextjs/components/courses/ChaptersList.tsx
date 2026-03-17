import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chapter } from '@/lib/types/course';
import { ChevronRight, FileText, Plus, CheckCircle, MessageSquare, Upload } from 'lucide-react';
import { EmptyState } from '../shared/EmptyState';

interface ChaptersListProps {
  chapters: Chapter[];
  courseId: number;
  canEdit: boolean;
}

export function ChaptersList({ chapters, courseId, canEdit }: ChaptersListProps) {
  if (chapters.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            title="No chapters yet"
            description="This course doesn't have any chapters. Add your first chapter to get started."
            icon={<FileText className="h-12 w-12" />}
            action={
              canEdit ? (
                <Button asChild>
                  <Link href={`/courses/${courseId}/chapters/new`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Chapter
                  </Link>
                </Button>
              ) : null
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Chapters</h2>
          <p className="text-sm text-muted-foreground">Sous-sections ouvrables comme des chapitres, avec accès direct aux fichiers et au chat.</p>
        </div>
        {canEdit && (
          <Button asChild size="sm" className="rounded-full">
            <Link href={`/courses/${courseId}/chapters/new`}>
              <Plus className="h-4 w-4 mr-2" />
              Add Chapter
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {chapters.map((chapter) => (
          <details key={chapter.id} className="group rounded-[24px] border border-bolt-line bg-white shadow-sm open:shadow-md">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5 rounded-full px-3">{chapter.order}</Badge>
                <div>
                  <p className="text-lg font-semibold">{chapter.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {chapter.documents_count} document{chapter.documents_count !== 1 ? 's' : ''}
                    </span>
                    {chapter.has_summary ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Summary available
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>

            <div className="border-t border-bolt-line px-5 pb-5 pt-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Button asChild variant="outline" className="justify-between rounded-2xl">
                  <Link href={`/courses/${courseId}/chapters/${chapter.id}`}>
                    Ouvrir le chapitre
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-between rounded-2xl">
                  <Link href={`/courses/${courseId}/chapters/${chapter.id}/chat`}>
                    Chat du chapitre
                    <MessageSquare className="h-4 w-4" />
                  </Link>
                </Button>
                {canEdit ? (
                  <Button asChild variant="outline" className="justify-between rounded-2xl">
                    <Link href={`/courses/${courseId}/chapters/${chapter.id}/documents/new`}>
                      Ajouter un fichier
                      <Upload className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
