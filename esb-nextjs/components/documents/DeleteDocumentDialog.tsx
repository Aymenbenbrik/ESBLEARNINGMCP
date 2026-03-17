import { ConfirmDialog } from '../shared/ConfirmDialog';

interface DeleteDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: number;
  documentName: string;
  onDelete: () => void;
}

export function DeleteDocumentDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  onDelete,
}: DeleteDocumentDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Document"
      description={`Are you sure you want to delete "${documentName}"? This will permanently delete the document file. This action cannot be undone.`}
      onConfirm={onDelete}
      confirmText="Delete Document"
      cancelText="Cancel"
      variant="destructive"
    />
  );
}
