'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useDocument } from '@/lib/hooks/useDocuments';
import { useAuth } from '@/lib/hooks/useAuth';
import DocumentViewer from '@/components/documents/DocumentViewer';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DocumentPage() {
  const params = useParams();
  const documentId = parseInt(params.docId as string);
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);

  const { user, isLoading: authLoading } = useAuth();
  const { data: document, isLoading: documentLoading, error } = useDocument(documentId);

  // Combined loading state
  if (authLoading || documentLoading) {
    return <DocumentPageSkeleton />;
  }

  // Error states
  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load document';

    // Check for specific error codes
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return <DocumentNotFound courseId={courseId} chapterId={chapterId} />;
    }

    if (errorMessage.includes('403') || errorMessage.includes('not enrolled')) {
      return <DocumentAccessDenied courseId={courseId} />;
    }

    return <DocumentError error={errorMessage} />;
  }

  if (!document) {
    return <DocumentNotFound courseId={courseId} chapterId={chapterId} />;
  }

  if (!user) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
        <p className="text-gray-600 mb-4">Please log in to view this document.</p>
        <Button asChild>
          <Link href="/login">Log In</Link>
        </Button>
      </Card>
    );
  }

  return (
    <DocumentViewer
      document={document}
      courseId={courseId}
      chapterId={chapterId}
      isTeacher={user.is_teacher || false}
    />
  );
}

// Loading Skeleton Component
function DocumentPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs skeleton */}
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Header skeleton */}
      <div>
        <Skeleton className="h-10 w-3/4 mb-3" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      {/* Summary skeleton */}
      <Card className="p-4">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-20 w-full" />
      </Card>

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <Card className="p-4">
            <Skeleton className="h-96 w-full" />
          </Card>
        </div>
        <div className="lg:col-span-4">
          <Card className="p-4">
            <Skeleton className="h-6 w-32 mb-4" />
            <Skeleton className="h-64 w-full" />
          </Card>
        </div>
      </div>
    </div>
  );
}

// Not Found Component
function DocumentNotFound({ courseId, chapterId }: { courseId: number; chapterId: number }) {
  return (
    <Card className="p-8 text-center">
      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold mb-2">Document Not Found</h2>
      <p className="text-gray-600 mb-6">
        The document you&apos;re looking for doesn&apos;t exist or has been removed.
      </p>
      <div className="flex justify-center gap-3">
        <Button asChild variant="outline">
          <Link href={`/courses/${courseId}/chapters/${chapterId}`}>
            Back to Chapter
          </Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </Card>
  );
}

// Access Denied Component
function DocumentAccessDenied({ courseId }: { courseId: number }) {
  return (
    <Card className="p-8 text-center">
      <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
      <p className="text-gray-600 mb-6">
        You don&apos;t have permission to view this document. Please enroll in the course first.
      </p>
      <div className="flex justify-center gap-3">
        <Button asChild variant="outline">
          <Link href={`/courses/${courseId}`}>View Course</Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </Card>
  );
}

// Generic Error Component
function DocumentError({ error }: { error: string }) {
  return (
    <Card className="p-8 text-center">
      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold mb-2">Error Loading Document</h2>
      <p className="text-gray-600 mb-2">Something went wrong while loading the document.</p>
      <p className="text-sm text-gray-500 mb-6">{error}</p>
      <Button onClick={() => window.location.reload()}>Try Again</Button>
    </Card>
  );
}
