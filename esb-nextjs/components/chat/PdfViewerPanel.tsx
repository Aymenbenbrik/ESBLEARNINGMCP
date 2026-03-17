'use client';

import { useDocument } from '@/lib/hooks/useDocuments';
import { documentsApi } from '@/lib/api/documents';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PdfViewer from '@/components/documents/PdfViewer';

interface PdfViewerPanelProps {
  documentId: number | null;
  courseId: number;
}

/**
 * Wrapper around PdfViewer with loading/error states
 * Shows empty state when no document is selected
 */
export function PdfViewerPanel({ documentId, courseId }: PdfViewerPanelProps) {
  // Fetch document details if a specific document is selected
  const { data: document, isLoading, error } = useDocument(documentId || 0);

  // Empty state: No document selected
  if (!documentId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Document Selected</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Select a specific document from the dropdown above to view its content, or continue
          chatting about all chapter documents.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <Skeleton className="h-6 w-3/4" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading document...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !document) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <AlertCircle className="h-16 w-16 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Document</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          {error ? 'An error occurred while loading the document.' : 'Document not found.'}
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  // Always use the backend API endpoint for file serving
  const fileUrl = documentsApi.getFileUrl(documentId);

  // Success state: Display PDF
  return (
    <div className="flex flex-col h-full">
      {/* Header with document title */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">{document.title}</h3>
            <p className="text-xs text-muted-foreground">
              Uploaded {new Date(document.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden">
        <PdfViewer
          documentId={documentId}
          fileUrl={fileUrl}
          initialZoom={0.8}
        />
      </div>
    </div>
  );
}
