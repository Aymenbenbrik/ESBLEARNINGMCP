import { ConfirmDialog } from '../shared/ConfirmDialog';

interface DeleteCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: number;
  courseName: string;
  onDelete: () => void;
}

export function DeleteCourseDialog({
  open,
  onOpenChange,
  courseId,
  courseName,
  onDelete,
}: DeleteCourseDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Course"
      description={`Are you sure you want to delete "${courseName}"? This will permanently delete the course and all its chapters, documents, and enrollments. This action cannot be undone.`}
      onConfirm={onDelete}
      confirmText="Delete Course"
      cancelText="Cancel"
      variant="destructive"
    />
  );
}
