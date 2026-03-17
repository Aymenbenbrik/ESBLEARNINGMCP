import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chapter } from '@/lib/types/course';
import { FileText, Pencil, Trash2 } from 'lucide-react';

interface ChapterCardProps {
  chapter: Chapter;
  courseId: number;
  canEdit: boolean;
  onDelete?: () => void;
}

export function ChapterCard({ chapter, courseId, canEdit, onDelete }: ChapterCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <Badge variant="outline" className="mt-1">{chapter.order}</Badge>
            <CardTitle className="text-lg">
              <Link
                href={`/courses/${courseId}/chapters/${chapter.id}`}
                className="hover:underline"
              >
                {chapter.title}
              </Link>
            </CardTitle>
          </div>

          {canEdit && (
            <div className="flex gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/courses/${courseId}/chapters/${chapter.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              {onDelete && (
                <Button variant="ghost" size="sm" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{chapter.documents_count} document{chapter.documents_count !== 1 ? 's' : ''}</span>
        </div>
      </CardContent>
    </Card>
  );
}
