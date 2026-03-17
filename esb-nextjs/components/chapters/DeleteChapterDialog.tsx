import { ConfirmDialog } from '../shared/ConfirmDialog';

interface DeleteChapterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterId: number;
  chapterName: string;
  onDelete: () => void;
}

export function DeleteChapterDialog({
  open,
  onOpenChange,
  chapterId,
  chapterName,
  onDelete,
}: DeleteChapterDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Chapter"
      description={`Are you sure you want to delete "${chapterName}"? This will permanently delete the chapter and all its documents. This action cannot be undone.`}
      onConfirm={onDelete}
      confirmText="Delete Chapter"
      cancelText="Cancel"
      variant="destructive"
    />
  );
}
