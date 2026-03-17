'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Document } from '@/lib/types/course';
import { FileText, Download, Upload, Plus } from 'lucide-react';
import { EmptyState } from '../shared/EmptyState';
import { format } from 'date-fns';
import { FileUpload } from '../shared/FileUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ModuleAttachmentsProps {
  modules: Document[];
  courseId: number;
  canUpload: boolean;
  onUpload?: (data: { title: string; file: File }) => void;
  isUploading?: boolean;
}

export function ModuleAttachments({ modules, courseId, canUpload, onUpload, isUploading }: ModuleAttachmentsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = () => {
    if (title && file && onUpload) {
      onUpload({ title, file });
      setIsDialogOpen(false);
      setTitle('');
      setFile(null);
    }
  };

  const getDownloadUrl = (module: Document) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return `${API_URL}/api/v1/documents/${module.id}/download`;
  };

  if (modules.length === 0 && !canUpload) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Module Attachments</CardTitle>
            {canUpload && (
              <Button size="sm" onClick={() => setIsDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {modules.length === 0 ? (
            <EmptyState
              title="No attachments"
              description="Upload course-level materials like syllabi, guides, or reference documents."
              icon={<FileText className="h-12 w-12" />}
            />
          ) : (
            <div className="space-y-2">
              {modules.map((module) => (
                <div
                  key={module.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{module.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {module.file_type?.toUpperCase()} • {format(new Date(module.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    asChild
                  >
                    <a href={getDownloadUrl(module)} download>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Module Attachment</DialogTitle>
            <DialogDescription>
              Upload a course-level document like a syllabus, guide, or reference material.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Course Syllabus"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>File</Label>
              <FileUpload
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,.mp4,.avi,.mov,.mkv,.webm,.flv"
                onChange={setFile}
                value={file}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!title || !file || isUploading}>
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
