import { redirect } from 'next/navigation';
export default function OldExamDashboardRedirect({ params }: { params: { id: string; examId: string } }) {
  redirect(`/courses/${params.id}/exams/${params.examId}/dashboard`);
}