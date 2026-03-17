import { redirect } from 'next/navigation';

/**
 * Backwards-compatible route used by older links (e.g. Question Bank empty state).
 *
 * We redirect to the existing course-level quiz generator.
 * If a Question Bank chapter filter is present, we forward it so the generator can pre-select chapters.
 */
export default function QuizGenerateRedirectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const courseId = params.id;
  const chapterParam = searchParams?.chapter_id;

  // Normalize chapter_id (can be string or string[])
  const chapterId = Array.isArray(chapterParam) ? chapterParam.join(',') : chapterParam;

  if (chapterId && chapterId.trim().length > 0) {
    redirect(`/courses/${courseId}/chapters/quiz?chapter_id=${encodeURIComponent(chapterId)}`);
  }

  redirect(`/courses/${courseId}/chapters/quiz`);
}
