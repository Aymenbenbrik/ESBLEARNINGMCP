import { redirect } from 'next/navigation';
export default function OldExamRedirect({ params }: { params: { id: string; examId: string } }) {
  redirect(`/courses/${params.id}/exams/${params.examId}/take`);
}