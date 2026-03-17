import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChapterDetails } from '@/lib/types/course';
import { Pencil, Trash2, Upload, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ChapterHeaderProps {
  chapter: ChapterDetails['chapter'];
  course: ChapterDetails['course'];
  onDelete?: () => void;
  onGenerateSummary?: () => void;
  isGeneratingSummary?: boolean;
}

export function ChapterHeader({ chapter, course, onDelete, onGenerateSummary, isGeneratingSummary }: ChapterHeaderProps) {
  return (
    <div className="border-b pb-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1">
          <Badge variant="outline" className="mt-1">{chapter.order}</Badge>
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{chapter.title}</h1>
            <p className="text-muted-foreground">
              Course: <Link href={`/courses/${course.id}`} className="hover:underline">{course.title}</Link>
            </p>
          </div>
        </div>

        {chapter.can_edit && (
          <div className="flex gap-2 ml-4">
            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${course.id}/chapters/${chapter.id}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>

            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${course.id}/chapters/${chapter.id}/documents/new`}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Link>
            </Button>

            {!chapter.has_summary && onGenerateSummary && (
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateSummary}
                disabled={isGeneratingSummary}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isGeneratingSummary ? 'Generating...' : 'Generate Summary'}
              </Button>
            )}

            {onDelete && (
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
