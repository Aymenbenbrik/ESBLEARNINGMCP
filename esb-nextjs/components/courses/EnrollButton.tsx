import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

interface EnrollButtonProps {
  courseId: number;
  isEnrolled: boolean;
  onEnroll: () => void;
  isLoading?: boolean;
}

export function EnrollButton({ courseId, isEnrolled, onEnroll, isLoading }: EnrollButtonProps) {
  if (isEnrolled) {
    return (
      <Button disabled variant="outline" className="gap-2">
        <CheckCircle className="h-4 w-4" />
        Already Enrolled
      </Button>
    );
  }

  return (
    <Button onClick={onEnroll} disabled={isLoading}>
      {isLoading ? 'Enrolling...' : 'Enroll in Course'}
    </Button>
  );
}
