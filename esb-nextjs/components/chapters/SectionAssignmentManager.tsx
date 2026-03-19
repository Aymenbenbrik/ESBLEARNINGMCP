'use client';

import { useState } from 'react';
import {
  useAssignment,
  useCreateAssignment,
  useUpdateAssignment,
  useDeleteAssignment,
  useAssignmentSubmissions,
  useGradeAssignment,
} from '@/lib/hooks/useReferences';
import { AssignmentSubmission, AssignmentFile } from '@/lib/types/references';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  Users,
  Clock,
  Pencil,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface SectionAssignmentManagerProps {
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

// ─── Assignment Form ──────────────────────────────────────────────────────────

interface AssignmentFormData {
  title: string;
  description: string;
  deliverables: string;
  deadline: string;
  allow_late: boolean;
  max_attempts: number;
}

function AssignmentForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial?: Partial<AssignmentFormData>;
  onSubmit: (data: AssignmentFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<AssignmentFormData>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    deliverables: initial?.deliverables ?? '',
    deadline: initial?.deadline ? initial.deadline.slice(0, 16) : '',
    allow_late: initial?.allow_late ?? false,
    max_attempts: initial?.max_attempts ?? 1,
  });

  const set = (key: keyof AssignmentFormData, value: string | boolean | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-bolt-line bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="assign-title" className="mb-1 block text-xs font-medium">
            Titre <span className="text-red-500">*</span>
          </Label>
          <Input
            id="assign-title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Titre du devoir"
            className="h-8 text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="assign-desc" className="mb-1 block text-xs font-medium">
            Description
          </Label>
          <Textarea
            id="assign-desc"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Description du devoir..."
            rows={3}
            className="text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="assign-deliv" className="mb-1 block text-xs font-medium">
            Livrables attendus
          </Label>
          <Textarea
            id="assign-deliv"
            value={form.deliverables}
            onChange={(e) => set('deliverables', e.target.value)}
            placeholder="Ex : rapport PDF + code source zippé..."
            rows={2}
            className="text-sm"
          />
        </div>

        <div>
          <Label htmlFor="assign-deadline" className="mb-1 block text-xs font-medium">
            Date limite
          </Label>
          <Input
            id="assign-deadline"
            type="datetime-local"
            value={form.deadline}
            onChange={(e) => set('deadline', e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div>
          <Label htmlFor="assign-attempts" className="mb-1 block text-xs font-medium">
            Tentatives max
          </Label>
          <Input
            id="assign-attempts"
            type="number"
            min={1}
            value={form.max_attempts}
            onChange={(e) => set('max_attempts', Number(e.target.value))}
            className="h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="assign-late"
            type="checkbox"
            checked={form.allow_late}
            onChange={(e) => set('allow_late', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="assign-late" className="cursor-pointer text-xs font-medium">
            Autoriser les soumissions en retard
          </Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onCancel} className="h-8 text-xs">
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit(form)}
          disabled={!form.title.trim() || isLoading}
          className="h-8 text-xs"
        >
          {isLoading ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}

// ─── Submission Row ───────────────────────────────────────────────────────────

function SubmissionRow({ sub, sectionId }: { sub: AssignmentSubmission; sectionId: number }) {
  const [grade, setGrade] = useState(sub.grade?.toString() ?? '');
  const [feedback, setFeedback] = useState(sub.feedback ?? '');
  const [expanded, setExpanded] = useState(false);
  const gradeMutation = useGradeAssignment(sectionId);

  return (
    <div className="rounded-xl border border-bolt-line bg-white shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {sub.student_name ?? sub.student_email ?? `Étudiant #${sub.student_id}`}
          </span>
          <Badge variant="outline" className="text-[10px]">
            Tentative #{sub.attempt_number}
          </Badge>
          {sub.is_late && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">En retard</Badge>
          )}
          {sub.status === 'graded' ? (
            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
              <CheckCircle className="mr-1 h-3 w-3" />
              Noté {sub.grade}/20
            </Badge>
          ) : (
            <Badge className="bg-blue-100 text-blue-700 text-[10px]">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Soumis
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {formatDate(sub.submitted_at)}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-bolt-line px-4 pb-4 pt-3 space-y-3">
          {/* Files */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Fichiers soumis
            </p>
            <div className="space-y-1">
              {sub.files.map((file: AssignmentFile, i: number) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-xs">{file.original_name}</span>
                  <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
                </div>
              ))}
              {sub.files.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun fichier</p>
              )}
            </div>
          </div>

          {/* Grading */}
          {sub.status === 'graded' ? (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-emerald-700">
                Note : {sub.grade}/20
              </p>
              {sub.feedback && (
                <p className="text-xs text-emerald-600">{sub.feedback}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Notation
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Note /20</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="h-7 w-24 text-sm"
                />
              </div>
              <Textarea
                placeholder="Commentaire / feedback..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={grade === '' || gradeMutation.isPending}
                onClick={() =>
                  gradeMutation.mutate({
                    subId: sub.id,
                    grade: Number(grade),
                    feedback,
                  })
                }
              >
                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                {gradeMutation.isPending ? 'Validation...' : 'Valider'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SectionAssignmentManager({ sectionId }: SectionAssignmentManagerProps) {
  const { data: assignment, isLoading } = useAssignment(sectionId);
  const { data: submissions = [], isLoading: subsLoading } = useAssignmentSubmissions(sectionId);
  const createMutation = useCreateAssignment(sectionId);
  const updateMutation = useUpdateAssignment(sectionId);
  const deleteMutation = useDeleteAssignment(sectionId);

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(false);

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;

  const handleCreate = (data: {
    title: string;
    description: string;
    deliverables: string;
    deadline: string;
    allow_late: boolean;
    max_attempts: number;
  }) => {
    createMutation.mutate(
      {
        title: data.title,
        description: data.description || null,
        deliverables: data.deliverables || null,
        deadline: data.deadline || null,
        allow_late: data.allow_late,
        max_attempts: data.max_attempts,
      },
      { onSuccess: () => setCreating(false) }
    );
  };

  const handleUpdate = (data: {
    title: string;
    description: string;
    deliverables: string;
    deadline: string;
    allow_late: boolean;
    max_attempts: number;
  }) => {
    updateMutation.mutate(
      {
        title: data.title,
        description: data.description || null,
        deliverables: data.deliverables || null,
        deadline: data.deadline || null,
        allow_late: data.allow_late,
        max_attempts: data.max_attempts,
      },
      { onSuccess: () => setEditing(false) }
    );
  };

  // No assignment yet
  if (!assignment) {
    return (
      <div className="mt-3">
        {creating ? (
          <AssignmentForm
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
            isLoading={createMutation.isPending}
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-bolt-line py-4 text-sm text-muted-foreground hover:border-bolt-accent hover:text-bolt-accent transition-colors"
          >
            <Plus className="h-4 w-4" />
            Créer un devoir
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Assignment card */}
      <div className="rounded-xl border border-bolt-line bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-bolt-accent" />
            <h3 className="text-sm font-semibold">{assignment.title}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => { setEditing(true); setConfirmDelete(false); }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-600">Confirmer ?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-2 text-xs"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  Oui
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  Non
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {assignment.description && (
          <p className="mt-2 text-xs text-muted-foreground">{assignment.description}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {assignment.deadline && (
            <div className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(assignment.deadline)}
            </div>
          )}
          <div className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-muted-foreground">
            Tentatives max : {assignment.max_attempts}
          </div>
          {assignment.allow_late && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">Retard autorisé</Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            <Users className="mr-1 h-3 w-3" />
            {assignment.submission_count ?? 0} soumission(s)
          </Badge>
        </div>

        {assignment.deliverables && (
          <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-blue-700 mb-0.5">Livrables attendus</p>
            <p className="text-xs text-blue-600">{assignment.deliverables}</p>
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <AssignmentForm
          initial={{
            title: assignment.title,
            description: assignment.description ?? '',
            deliverables: assignment.deliverables ?? '',
            deadline: assignment.deadline ?? '',
            allow_late: assignment.allow_late,
            max_attempts: assignment.max_attempts,
          }}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
          isLoading={updateMutation.isPending}
        />
      )}

      {/* Submissions section */}
      <div className="rounded-xl border border-bolt-line bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setShowSubmissions((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-bolt-accent" />
            Soumissions ({assignment.submission_count ?? 0})
          </div>
          {showSubmissions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showSubmissions && (
          <div className="border-t border-bolt-line px-4 pb-4 pt-3 space-y-2">
            {subsLoading ? (
              <Skeleton className="h-12 rounded-xl" />
            ) : submissions.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">
                Aucune soumission pour l'instant.
              </p>
            ) : (
              submissions.map((sub) => (
                <SubmissionRow key={sub.id} sub={sub} sectionId={sectionId} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
