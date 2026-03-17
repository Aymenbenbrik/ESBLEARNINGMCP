import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Document } from '@/lib/types/course';
import { FileText, Download, Trash2 } from 'lucide-react';
import { EmptyState } from '../shared/EmptyState';
import { format } from 'date-fns';

interface DocumentsListProps {
  documents: Document[];
  chapterId: number;
  canEdit: boolean;
  onDelete?: (documentId: number) => void;
}

export function DocumentsList({ documents, chapterId, canEdit, onDelete }: DocumentsListProps) {
  const getDownloadUrl = (doc: Document) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return `${API_URL}/api/v1/documents/${doc.id}/download`;
  };

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            title="No documents"
            description="Upload PDF documents to this chapter to get started."
            icon={<FileText className="h-12 w-12" />}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.file_type?.toUpperCase()} • {format(new Date(doc.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" asChild>
                  <a href={getDownloadUrl(doc)} download>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>

                {canEdit && onDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(doc.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
