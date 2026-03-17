'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useChapter } from '@/lib/hooks/useChapters';
import { useUploadDocument } from '@/lib/hooks/useChapters';
import { DocumentUploadForm } from '@/components/chapters/DocumentUploadForm';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';

export default function UploadDocumentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chapterId = parseInt(params.chapterId as string);
  const courseId = parseInt(params.id as string);
  const { data, isLoading } = useChapter(chapterId);
  const uploadMutation = useUploadDocument();

  const handleUpload = async (uploadData: { title: string; file: File }) => {
    const formData = new FormData();
    formData.append('title', uploadData.title);
    formData.append('file', uploadData.file);

    uploadMutation.mutate(
      { chapterId, data: formData },
      {
        onSuccess: () => {
          router.push(`/courses/${courseId}/chapters/${chapterId}`);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { chapter, course } = data;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: course.title, href: `/courses/${courseId}` },
          { label: chapter.title, href: `/courses/${courseId}/chapters/${chapterId}` },
          { label: 'Upload Document' },
        ]}
      />

      <DocumentUploadForm
        chapterId={chapterId}
        initialTitle={searchParams.get('title') || ''}
        onUpload={handleUpload}
        isUploading={uploadMutation.isPending}
      />
    </div>
  );
}
