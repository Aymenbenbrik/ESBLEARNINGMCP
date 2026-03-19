'use client';

import { useState, useRef } from 'react';
import { useAssignment, useSubmitAssignment } from '@/lib/hooks/useReferences';
import { AssignmentFile, AssignmentSubmission } from '@/lib/types/references';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  Upload,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface SectionAssignmentTakerProps {
  sectionId: number;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const isOverdue = dl < now;
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        isOverdue
          ? 'bg-red-100 text-red-700'
          : 'bg-emerald-100 text-emerald-700'
      }`}
    >
      <Clock className="h-3.5 w-3.5" />
      {isOverdue ? 'Expiré le' : 'Date limite :'} {formatDate(deadline)}
    </div>
  );
}

function PreviousSubmission({ sub }: { sub: AssignmentSubmission }) {
  return (
    <div className="rounded-xl border border-bolt-line bg-white p-3 shadow-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">Tentative #{sub.attempt_number}</span>
        <span className="text-[11px] text-muted-foreground">{formatDate(sub.submitted_at)}</span>
        {sub.is_late && (
          <Badge className="bg-amber-100 text-amber-700 text-[10px]">
            <AlertTriangle className="mr-1 h-3 w-3" />
            En retard
          </Badge>
        )}
        {sub.status === 'graded' ? (
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
            <CheckCircle className="mr-1 h-3 w-3" />
            Noté
          </Badge>
        ) : (
          <Badge className="bg-blue-100 text-blue-700 text-[10px]">Soumis</Badge>
        )}
      </div>

      {/* Files */}
      <div className="space-y-1">
        {sub.files.map((file: AssignmentFile, i: number) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 text-xs">{file.original_name}</span>
            <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
          </div>
        ))}
      </div>

      {/* Grade & feedback */}
      {sub.status === 'graded' && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 space-y-0.5">
          <p className="text-xs font-semibold text-emerald-700">Note : {sub.grade}/20</p>
          {sub.feedback && <p className="text-xs text-emerald-600">{sub.feedback}</p>}
        </div>
      )}
    </div>
  );
}

export function SectionAssignmentTaker({ sectionId }: SectionAssignmentTakerProps) {
  const { data: assignment, isLoading } = useAssignment(sectionId);
  const submitMutation = useSubmitAssignment(sectionId);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) return <Skeleton className="h-32 rounded-xl" />;
  if (!assignment) return null;

  const attemptsUsed = assignment.attempts_used ?? 0;
  const attemptsLeft = assignment.max_attempts - attemptsUsed;
  const isOverdue = assignment.deadline ? new Date(assignment.deadline) < new Date() : false;
  const canSubmit =
    selectedFiles.length > 0 &&
    attemptsLeft > 0 &&
    !submitMutation.isPending &&
    (!isOverdue || assignment.allow_late);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    submitMutation.mutate(selectedFiles, {
      onSuccess: () => setSelectedFiles([]),
    });
  };

  return (
    <div className="mt-3 space-y-3">
      {/* Assignment info */}
      <div className="rounded-xl border border-bolt-line bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 text-bolt-accent" />
          <h3 className="text-sm font-semibold">{assignment.title}</h3>
        </div>

        {assignment.description && (
          <p className="text-xs text-muted-foreground">{assignment.description}</p>
        )}

        {assignment.deliverables && (
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-blue-700 mb-0.5">Livrables attendus</p>
            <p className="text-xs text-blue-600">{assignment.deliverables}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <DeadlineBadge deadline={assignment.deadline} />
          <div
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              attemptsLeft > 0 ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {attemptsLeft > 0
              ? `${attemptsLeft} tentative(s) restante(s)`
              : 'Aucune tentative restante'}
          </div>
          {isOverdue && !assignment.allow_late && (
            <Badge className="bg-red-100 text-red-700 text-[10px]">
              <XCircle className="mr-1 h-3 w-3" />
              Soumission fermée
            </Badge>
          )}
        </div>
      </div>

      {/* Upload area */}
      {attemptsLeft > 0 && (!isOverdue || assignment.allow_late) && (
        <div className="rounded-xl border border-bolt-line bg-white p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Nouvelle soumission
          </p>

          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors ${
              dragging
                ? 'border-bolt-accent bg-bolt-accent/5'
                : 'border-bolt-line hover:border-bolt-accent hover:bg-gray-50'
            }`}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Glissez-déposez vos fichiers ou{' '}
              <span className="font-medium text-bolt-accent">cliquez pour parcourir</span>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1">
              {selectedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-xs truncate">{file.name}</span>
                  <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-8 text-xs"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {submitMutation.isPending ? 'Soumission en cours...' : 'Soumettre'}
          </Button>
        </div>
      )}

      {/* Previous submissions */}
      {(assignment.my_submissions ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Mes soumissions précédentes
          </p>
          {(assignment.my_submissions ?? []).map((sub) => (
            <PreviousSubmission key={sub.id} sub={sub} />
          ))}
        </div>
      )}
    </div>
  );
}
