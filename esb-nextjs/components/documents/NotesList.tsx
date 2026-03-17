'use client';

import React, { useState } from 'react';
import { useDocumentNotes, useDeleteNote } from '@/lib/hooks/useNotes';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { notesApi } from '@/lib/api/notes';

interface NotesListProps {
  documentId: number;
}

export default function NotesList({ documentId }: NotesListProps) {
  const { data, isLoading, error } = useDocumentNotes(documentId);
  const deleteNoteMutation = useDeleteNote();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<number | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const notes = data?.notes || [];

  const handleDeleteClick = (noteId: number) => {
    setNoteToDelete(noteId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (noteToDelete) {
      try {
        await deleteNoteMutation.mutateAsync(noteToDelete);
        toast.success('Note deleted successfully');
        setDeleteDialogOpen(false);
        setNoteToDelete(null);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete note';
        toast.error(errorMessage);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const openImageModal = (imagePath: string) => {
    setSelectedImage(notesApi.getImageUrl(imagePath));
    setImageModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-red-500">Failed to load notes</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="notes-list-container"
        style={{
          maxHeight: '400px',
          overflowY: 'auto',
          paddingRight: '0.5rem',
        }}
      >
        <style jsx>{`
          .notes-list-container::-webkit-scrollbar {
            width: 6px;
          }
          .notes-list-container::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
          }
          .notes-list-container::-webkit-scrollbar-thumb {
            background: #dc3545;
            border-radius: 3px;
          }
          .notes-list-container::-webkit-scrollbar-thumb:hover {
            background: #c82333;
          }
        `}</style>

        {notes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>You haven&apos;t added any notes yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes
              .sort((a, b) => {
                // Sort by created_at descending (newest first)
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })
              .map((note) => (
                <Card key={note.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-2">
                        {formatDate(note.created_at)}
                      </p>

                      {note.content && (
                        <p className="text-sm whitespace-pre-wrap break-words mb-2">
                          {note.content}
                        </p>
                      )}

                      {note.image_path && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={notesApi.getImageUrl(note.image_path)}
                          alt="Note attachment"
                          className="max-w-full h-auto rounded cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ maxHeight: '200px' }}
                          onClick={() => openImageModal(note.image_path!)}
                          loading="lazy"
                        />
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(note.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Modal */}
      {imageModalOpen && selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4"
          onClick={() => setImageModalOpen(false)}
        >
          <div className="relative max-w-4xl max-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-screen object-contain"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImageModalOpen(false)}
              className="absolute top-2 right-2"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
