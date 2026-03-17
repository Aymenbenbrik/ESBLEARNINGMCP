import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Document } from '@/lib/types/course';
import { FileText, Download, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface DocumentCardProps {
  document: Document;
  canEdit: boolean;
  onDelete?: () => void;
}

export function DocumentCard({ document, canEdit, onDelete }: DocumentCardProps) {
  const getDownloadUrl = () => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return `${API_URL}/api/v1/documents/${document.id}/download`;
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{document.title}</p>
              <p className="text-sm text-muted-foreground">
                {document.file_type?.toUpperCase()} • {format(new Date(document.created_at), 'MMM d, yyyy')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-4">
            <Button size="sm" variant="outline" asChild>
              <a href={getDownloadUrl()} download>
                <Download className="h-4 w-4" />
              </a>
            </Button>

            {canEdit && onDelete && (
              <Button size="sm" variant="ghost" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
