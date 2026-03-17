'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Document } from '@/lib/types/course';
import PdfViewer from './PdfViewer';
import NotesList from './NotesList';
import AddNoteForm from './AddNoteForm';
import DocumentActions from './DocumentActions';
import DocumentSummary from './DocumentSummary';
import { ChatDialog } from '@/components/chat/ChatDialog';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, FileText, Calendar } from 'lucide-react';

interface DocumentViewerProps {
  document: Document;
  courseId: number;
  chapterId: number;
  isTeacher: boolean;
}

export default function DocumentViewer({
  document,
  courseId,
  chapterId,
  isTeacher,
}: DocumentViewerProps) {
  const [showChatDialog, setShowChatDialog] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Construct file URL
  const API_URL = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000')
    : 'http://localhost:5000';
  const fileUrl = `${API_URL}/api/v1/documents/${document.id}/file`;

  return (
    <div className="document-viewer-page pb-24">
      {/* Breadcrumbs */}
      <nav className="mb-4" aria-label="breadcrumb">
        <ol className="flex items-center space-x-2 text-sm text-gray-600">
          <li>
            <Link href="/dashboard" className="hover:text-primary">
              Dashboard
            </Link>
          </li>
          <ChevronRight className="h-4 w-4" />
          <li>
            <Link href={`/courses/${courseId}`} className="hover:text-primary">
              Course
            </Link>
          </li>
          <ChevronRight className="h-4 w-4" />
          <li>
            <Link
              href={`/courses/${courseId}/chapters/${chapterId}`}
              className="hover:text-primary"
            >
              Chapter
            </Link>
          </li>
          <ChevronRight className="h-4 w-4" />
          <li className="text-gray-900 font-medium">Document</li>
        </ol>
      </nav>

      {/* Document Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{document.title}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Uploaded {formatDate(document.created_at)}</span>
              </div>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="bg-orange-100 text-orange-800 hover:bg-orange-200"
          >
            <FileText className="h-3 w-3 mr-1" />
            PDF
          </Badge>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Document Summary */}
      {document.summary && (
        <div className="mb-6">
          <DocumentSummary summary={document.summary} documentId={document.id} />
        </div>
      )}

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - PDF Viewer */}
        <div className="lg:col-span-8">
          <PdfViewer
            documentId={document.id}
            fileUrl={fileUrl}
            initialZoom={1.0}
          />
        </div>

        {/* Right Column - Notes Sidebar */}
        <div className="lg:col-span-4">
          <Card className="p-4 sticky top-4">
            <h2 className="text-xl font-semibold mb-4">My Notes</h2>

            {/* Notes List */}
            <div className="mb-6">
              <NotesList documentId={document.id} />
            </div>

            <Separator className="my-4" />

            {/* Add Note Form */}
            <div>
              <h3 className="text-lg font-medium mb-3">Add New Note</h3>
              <AddNoteForm documentId={document.id} />
            </div>
          </Card>
        </div>
      </div>

      {/* Sticky Action Bar at Bottom */}
      <DocumentActions
        documentId={document.id}
        courseId={courseId}
        chapterId={chapterId}
        isTeacher={isTeacher}
        onOpenChat={() => setShowChatDialog(true)}
      />

      {/* Chat Dialog */}
      <ChatDialog
        open={showChatDialog}
        onOpenChange={setShowChatDialog}
        mode="document"
        documentId={document.id}
        title={document.title}
      />
    </div>
  );
}
