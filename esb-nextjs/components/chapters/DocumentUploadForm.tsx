'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { FileUpload } from '../shared/FileUpload';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const documentSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be at most 100 characters'),
});

interface DocumentUploadFormProps {
  chapterId: number;
  initialTitle?: string;
  onUpload: (data: { title: string; file: File }) => void;
  isUploading?: boolean;
}

export function DocumentUploadForm({ initialTitle = '', onUpload, isUploading }: DocumentUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>('');

  const form = useForm({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      title: initialTitle,
    },
  });

  const handleSubmit = (data: { title: string }) => {
    if (!file) {
      setFileError('Please select a file to upload');
      return;
    }

    // Validate file type
    const allowedTypes = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv'];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      setFileError('Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, and CSV files are allowed.');
      return;
    }

    setFileError('');
    onUpload({ title: data.title, file });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Document</CardTitle>
        <CardDescription>
          Upload a document to this chapter. PDFs will be automatically processed for AI chat and summary generation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Lecture Notes - Week 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>File</FormLabel>
              <FileUpload
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv"
                onChange={(f) => {
                  setFile(f);
                  setFileError('');
                }}
                value={file}
                disabled={isUploading}
              />
              {fileError && (
                <p className="text-sm text-destructive">{fileError}</p>
              )}
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                PDF documents will be automatically processed for RAG-based AI chat and summary generation.
                This may take a few moments after upload.
              </AlertDescription>
            </Alert>

            <Button type="submit" disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
