'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MessageSquare, Download, FileQuestion } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentActionsProps {
  documentId: number;
  courseId: number;
  chapterId: number;
  isTeacher: boolean;
  onOpenChat?: () => void;
}

export default function DocumentActions({
  documentId,
  courseId,
  chapterId,
  isTeacher,
  onOpenChat,
}: DocumentActionsProps) {
  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/v1/documents/${documentId}/download`);

      if (!response.ok) {
        throw new Error('Failed to download document');
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `document_${documentId}.pdf`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Document downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download document');
    }
  };

  return (
    <div
      className="document-actions-bar"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderTop: '1px solid #dee2e6',
        padding: '1rem',
        zIndex: 100,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="container mx-auto">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {/* Ask AI Button - Available to all users */}
          {onOpenChat ? (
            <Button onClick={onOpenChat} variant="default">
              <MessageSquare className="mr-2 h-4 w-4" />
              Chatbot
            </Button>
          ) : (
            <Button asChild variant="default">
              <Link
                href={`/courses/${courseId}/chapters/${chapterId}/documents/${documentId}/chat`}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Ask AI
              </Link>
            </Button>
          )}

          {/* Download Button - Available to all users */}
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>

          {/* Take Quiz Button - Students only */}
          {!isTeacher && (
            <Button asChild variant="secondary">
              <Link
                href={`/courses/${courseId}/chapters/${chapterId}/documents/${documentId}/quiz`}
              >
                <FileQuestion className="mr-2 h-4 w-4" />
                Take Quiz
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
