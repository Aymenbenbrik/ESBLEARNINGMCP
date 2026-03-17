'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { FileText, FolderOpen, ChevronDown, Check } from 'lucide-react';
import { Document } from '@/lib/types/course';

interface DocumentSelectorProps {
  documents: Document[];
  selectedDocumentId: number | null;
  onDocumentChange: (documentId: number | null) => void;
  chapterId: number;
  courseId: number;
}

/**
 * Dropdown selector for switching between documents
 * Includes "All Chapter Documents" option for chapter-level chat
 */
export function DocumentSelector({
  documents,
  selectedDocumentId,
  onDocumentChange,
  chapterId,
  courseId,
}: DocumentSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = (documentId: number | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (documentId === null) {
      // Chapter-level chat
      params.delete('doc');
      onDocumentChange(null);
    } else {
      // Document-specific chat
      params.set('doc', documentId.toString());
      onDocumentChange(documentId);
    }

    router.replace(`/courses/${courseId}/chapters/${chapterId}/chat?${params.toString()}`, {
      scroll: false,
    });
  };

  // Get selected document for display
  const selectedDocument = selectedDocumentId
    ? documents.find(doc => doc.id === selectedDocumentId)
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-[280px] justify-between">
          <div className="flex items-center gap-2 truncate">
            {selectedDocument ? (
              <>
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{selectedDocument.title}</span>
              </>
            ) : (
              <>
                <FolderOpen className="h-4 w-4 text-primary" />
                <span>All Chapter Documents</span>
              </>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 ml-2 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        <DropdownMenuItem onClick={() => handleSelect(null)}>
          <div className="flex items-center gap-2 w-full">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span className="font-medium flex-1">All Chapter Documents</span>
            {selectedDocumentId === null && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </div>
        </DropdownMenuItem>

        {documents.length > 0 && <DropdownMenuSeparator />}

        {documents.map((doc) => (
          <DropdownMenuItem key={doc.id} onClick={() => handleSelect(doc.id)}>
            <div className="flex items-center gap-2 w-full">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-medium truncate">{doc.title}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(doc.created_at).toLocaleDateString()}
                </span>
              </div>
              {selectedDocumentId === doc.id && (
                <Check className="h-4 w-4 text-primary flex-shrink-0" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
