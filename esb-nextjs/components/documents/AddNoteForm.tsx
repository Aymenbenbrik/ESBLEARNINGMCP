'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { useAddNote } from '@/lib/hooks/useNotes';
import { toast } from 'sonner';

const noteSchema = z.object({
  content: z.string().optional(),
  image: z.any().optional(),
}).refine(
  (data) => {
    // At least one of content or image must be provided
    return (data.content && data.content.trim().length > 0) || data.image;
  },
  {
    message: 'Please provide either text content or an image',
    path: ['content'],
  }
);

type NoteFormData = z.infer<typeof noteSchema>;

interface AddNoteFormProps {
  documentId: number;
  onSuccess?: () => void;
}

export default function AddNoteForm({ documentId, onSuccess }: AddNoteFormProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
  });

  const addNoteMutation = useAddNote();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file (JPG, PNG, GIF)');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }

      setSelectedFile(file);
      setValue('image', file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setValue('image', undefined);
  };

  const onSubmit = async (data: NoteFormData) => {
    try {
      const noteData: { document_id: number; content?: string; image?: File } = {
        document_id: documentId,
      };

      if (data.content && data.content.trim()) {
        noteData.content = data.content.trim();
      }

      if (selectedFile) {
        noteData.image = selectedFile;
      }

      await addNoteMutation.mutateAsync(noteData);

      // Reset form
      reset();
      clearImage();
      toast.success('Note added successfully');

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add note';
      toast.error(errorMessage);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="note-content">Note Content</Label>
        <Textarea
          id="note-content"
          placeholder="Type your notes here..."
          rows={3}
          {...register('content')}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="note-image">Attach Image (Optional)</Label>
        <Input
          id="note-image"
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          className="mt-1"
        />
        {imagePreview && (
          <div className="mt-2 relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Preview"
              className="max-w-full h-32 object-contain rounded border"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={clearImage}
              className="absolute top-1 right-1"
            >
              Remove
            </Button>
          </div>
        )}
      </div>

      {errors.content && (
        <p className="text-sm text-red-500">{errors.content.message}</p>
      )}

      <Button
        type="submit"
        disabled={addNoteMutation.isPending}
        className="w-full"
      >
        {addNoteMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Adding Note...
          </>
        ) : (
          <>
            <ImageIcon className="mr-2 h-4 w-4" />
            Add Note
          </>
        )}
      </Button>
    </form>
  );
}
