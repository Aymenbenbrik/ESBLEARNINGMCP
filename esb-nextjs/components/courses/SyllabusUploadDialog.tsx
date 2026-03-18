'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUploadSyllabus,
  useTriggerExtraction,
  useTriggerClassification
} from '@/lib/hooks/useSyllabus';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/shared/FileUpload';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

type SyllabusType = 'bga' | 'tn';
type Stage = 'idle' | 'uploading' | 'extracting' | 'classifying' | 'complete';

interface SyllabusUploadDialogProps {
  courseId: number;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function SyllabusUploadDialog({
  courseId,
  trigger,
  onSuccess
}: SyllabusUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [syllabusType, setSyllabusType] = useState<SyllabusType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');

  const queryClient = useQueryClient();
  const upload = useUploadSyllabus();
  const extract = useTriggerExtraction();
  const classify = useTriggerClassification();

  const handleUpload = async () => {
    if (!file || !syllabusType) return;

    try {
      // Stage 1: Upload file
      setStage('uploading');
      await upload.mutateAsync({
        courseId,
        data: { file, syllabus_type: syllabusType }
      });

      // Stage 2: Extract content
      setStage('extracting');
      const extractResult = await extract.mutateAsync(courseId);

      // Stage 3: Classify (TN only)
      if (syllabusType === 'tn') {
        setStage('classifying');
        await classify.mutateAsync(courseId);
      }

      // Stage 4: Refresh data
      setStage('complete');
      await queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      await queryClient.invalidateQueries({ queryKey: ['chapters', courseId] });
      await queryClient.invalidateQueries({ queryKey: ['syllabus', 'detail', courseId] });

      toast.success('Syllabus uploaded and processed successfully!');

      // Reset and close
      setTimeout(() => {
        setOpen(false);
        resetForm();
        onSuccess?.();
      }, 1000);

    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Upload failed';
      toast.error(`Failed at ${getStageLabel(stage)}: ${errorMessage}`);
      setStage('idle');
    }
  };

  const resetForm = () => {
    setSyllabusType(null);
    setFile(null);
    setStage('idle');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && stage !== 'idle' && stage !== 'complete') {
      // Prevent closing during processing
      toast.warning('Please wait for the upload to complete');
      return;
    }
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  const isProcessing = stage !== 'idle' && stage !== 'complete';
  const canSubmit = file && syllabusType && stage === 'idle';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Upload Syllabus
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Syllabus</DialogTitle>
          <DialogDescription>
            Upload your course syllabus to automatically generate chapters and extract learning outcomes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Syllabus Type Selection */}
          <div className="space-y-2">
            <Label>Syllabus Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSyllabusType('bga')}
                disabled={isProcessing}
                className={`
                  relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all
                  hover:bg-accent
                  ${syllabusType === 'bga'
                    ? 'border-primary bg-accent'
                    : 'border-border'
                  }
                  ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="font-medium">BGA</div>
                <div className="text-xs text-muted-foreground">
                  Weekly Plan, CLO, PLO
                </div>
                {syllabusType === 'bga' && (
                  <CheckCircle className="absolute top-2 right-2 h-4 w-4 text-primary" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSyllabusType('tn')}
                disabled={isProcessing}
                className={`
                  relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all
                  hover:bg-accent
                  ${syllabusType === 'tn'
                    ? 'border-primary bg-accent'
                    : 'border-border'
                  }
                  ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="font-medium">TN Norm</div>
                <div className="text-xs text-muted-foreground">
                  AA, AAP, Chapters
                </div>
                {syllabusType === 'tn' && (
                  <CheckCircle className="absolute top-2 right-2 h-4 w-4 text-primary" />
                )}
              </button>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Syllabus File</Label>
            <FileUpload
              accept=".pdf,.docx,.doc,.xlsx"
              onChange={setFile}
              value={file}
              disabled={isProcessing}
            />
          </div>

          {/* Progress Indicator */}
          {isProcessing && (
            <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{getStageMessage(stage)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getStageDescription(stage)}
                  </p>
                </div>
              </div>

              {/* Progress Steps */}
              <div className="flex items-center gap-2 text-xs">
                <StageIndicator
                  label="Upload"
                  completed={stage === 'extracting' || stage === 'classifying'}
                  active={stage === 'uploading'}
                />
                <div className="flex-1 border-t" />
                <StageIndicator
                  label="Extract"
                  completed={stage === 'classifying'}
                  active={stage === 'extracting'}
                />
                {syllabusType === 'tn' && (
                  <>
                    <div className="flex-1 border-t" />
                    <StageIndicator
                      label="Classify"
                      completed={false}
                      active={stage === 'classifying'}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {stage === 'complete' && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              <span>Upload complete! Chapters have been created.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Cancel'}
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!canSubmit || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Syllabus
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageIndicator({
  label,
  completed,
  active
}: {
  label: string;
  completed: boolean;
  active: boolean;
}) {
  return (
    <div className={`
      flex items-center gap-1.5 px-2 py-1 rounded-md
      ${active ? 'bg-primary/10 text-primary font-medium' : ''}
      ${completed && !active ? 'text-green-600 dark:text-green-400' : ''}
      ${!completed && !active ? 'text-muted-foreground' : ''}
    `}>
      {completed && !active ? (
        <CheckCircle className="h-3 w-3" />
      ) : active ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <div className="h-3 w-3 rounded-full border-2" />
      )}
      <span>{label}</span>
    </div>
  );
}

function getStageMessage(stage: Stage): string {
  switch (stage) {
    case 'uploading':
      return 'Uploading syllabus file...';
    case 'extracting':
      return 'Extracting content...';
    case 'classifying':
      return 'Classifying chapters...';
    case 'complete':
      return 'Complete!';
    default:
      return '';
  }
}

function getStageDescription(stage: Stage): string {
  switch (stage) {
    case 'uploading':
      return 'Uploading your syllabus file to the server';
    case 'extracting':
      return 'Parsing CLO, PLO, weekly plan, and creating chapters';
    case 'classifying':
      return 'Mapping TN chapters to learning outcomes (AA)';
    case 'complete':
      return 'Your syllabus has been processed successfully';
    default:
      return '';
  }
}

function getStageLabel(stage: Stage): string {
  switch (stage) {
    case 'uploading':
      return 'upload stage';
    case 'extracting':
      return 'extraction stage';
    case 'classifying':
      return 'classification stage';
    default:
      return 'processing';
  }
}
