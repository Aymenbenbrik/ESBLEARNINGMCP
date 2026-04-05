import { redirect } from 'next/navigation';
export default function OldExamResultsRedirect({ params }: { params: { id: string; examId: string } }) {
  redirect(`/courses/${params.id}/exams/${params.examId}/results`);
}