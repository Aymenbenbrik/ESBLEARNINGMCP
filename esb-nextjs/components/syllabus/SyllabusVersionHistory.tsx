'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  CheckCircle2, Clock, XCircle, GitBranch, Eye, Play,
  ThumbsUp, ThumbsDown, ChevronDown, ChevronRight,
  FileText, AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useSyllabusVersions,
  useSubmitSyllabusVersion,
  useValidateSyllabusVersion,
  useRejectSyllabusVersion,
  useApplySyllabusVersion,
} from '@/lib/hooks/useSyllabusVersions';
import type { SyllabusVersion, SyllabusVersionStatus } from '@/lib/types/syllabusVersions';
import { VersionDiffViewer } from './VersionDiffViewer';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SyllabusVersionStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  baseline:  { label: 'Version initiale', color: 'bg-blue-100 text-blue-800',     icon: GitBranch },
  draft:     { label: 'Brouillon',        color: 'bg-gray-100 text-gray-700',     icon: Clock },
  proposed:  { label: 'En attente',       color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  validated: { label: 'Validée',          color: 'bg-green-100 text-green-800',   icon: CheckCircle2 },
  rejected:  { label: 'Rejetée',          color: 'bg-red-100 text-red-800',       icon: XCircle },
};

function StatusBadge({ status }: { status: SyllabusVersionStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function DiffBadge({ version }: { version: SyllabusVersion }) {
  const diff = version.diff_summary;
  if (!diff || Object.keys(diff).length === 0) {
    return <span className="text-xs text-muted-foreground">Aucun changement</span>;
  }
  const counts: string[] = [];
  const chaps = diff.chapters;
  if (chaps) {
    const n = (chaps.added?.length ?? 0) + (chaps.removed?.length ?? 0) + (chaps.modified?.length ?? 0);
    if (n > 0) counts.push(`${n} chap.`);
  }
  const aa = diff.aa;
  if (aa) {
    const n = (aa.added?.length ?? 0) + (aa.removed?.length ?? 0) + (aa.modified?.length ?? 0);
    if (n > 0) counts.push(`${n} AA`);
  }
  const bib = diff.bibliography;
  if (bib) {
    const n = (bib.added?.length ?? 0) + (bib.removed?.length ?? 0) + (bib.modified?.length ?? 0);
    if (n > 0) counts.push(`${n} réf.`);
  }
  if (diff.admin) counts.push('admin');

  return (
    <span className="text-xs text-muted-foreground">
      Δ {counts.join(', ') || 'détails'}
    </span>
  );
}

// ─── Single version row in timeline ──────────────────────────────────────────

interface VersionRowProps {
  version: SyllabusVersion;
  isLast: boolean;
  canValidate: boolean;
  onViewDiff: (v: SyllabusVersion) => void;
  onSubmit: (id: number) => void;
  onValidate: (id: number) => void;
  onReject: (v: SyllabusVersion) => void;
  onApply: (id: number) => void;
}

function VersionRow({
  version, isLast, canValidate,
  onViewDiff, onSubmit, onValidate, onReject, onApply,
}: VersionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = STATUS_CONFIG[version.status]?.icon ?? Clock;

  return (
    <div className="relative">
      {!isLast && <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-border" />}

      <div className="flex gap-3">
        <div className="relative flex-shrink-0 w-10 h-10 rounded-full bg-background border-2 border-border flex items-center justify-center z-10">
          <StatusIcon className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="flex-1 pb-6">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  v{version.version_number} — {version.label || `Version ${version.version_number}`}
                </span>
                <StatusBadge status={version.status} />
                {version.applied_at && (
                  <Badge variant="outline" className="text-xs text-green-700 border-green-400">
                    Appliquée
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {version.created_by?.name ?? 'Système'}{' '}
                {version.created_at && (
                  <> · {format(new Date(version.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}</>
                )}
                {' · '}
                <DiffBadge version={version} />
              </div>
            </div>

            <div className="flex gap-1 flex-wrap">
              {!version.is_baseline && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onViewDiff(version)}>
                  <Eye className="h-3 w-3 mr-1" /> Diff
                </Button>
              )}
              {version.status === 'draft' && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onSubmit(version.id)}>
                  <Play className="h-3 w-3 mr-1" /> Soumettre
                </Button>
              )}
              {version.status === 'proposed' && canValidate && (
                <>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-700 border-green-400"
                    onClick={() => onValidate(version.id)}>
                    <ThumbsUp className="h-3 w-3 mr-1" /> Valider
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-400"
                    onClick={() => onReject(version)}>
                    <ThumbsDown className="h-3 w-3 mr-1" /> Rejeter
                  </Button>
                </>
              )}
              {version.status === 'validated' && !version.applied_at && (
                <Button size="sm" className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                  onClick={() => onApply(version.id)}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Appliquer
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => setExpanded(v => !v)}>
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm space-y-1">
              {version.notes && <p><span className="font-medium">Notes :</span> {version.notes}</p>}
              {version.rejection_notes && (
                <p className="text-red-600"><span className="font-medium">Motif de rejet :</span> {version.rejection_notes}</p>
              )}
              {version.validated_by && version.validated_at && (
                <p className="text-muted-foreground text-xs">
                  Validé par {version.validated_by.name} le{' '}
                  {format(new Date(version.validated_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                </p>
              )}
              {version.applied_at && (
                <p className="text-muted-foreground text-xs">
                  Appliqué le {format(new Date(version.applied_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                </p>
              )}
              {!version.notes && !version.rejection_notes && !version.validated_by && !version.applied_at && (
                <p className="text-muted-foreground italic">Aucune note.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SyllabusVersionHistoryProps {
  courseId: number;
  canEdit: boolean;
  canValidate: boolean;
}

export function SyllabusVersionHistory({ courseId, canEdit, canValidate }: SyllabusVersionHistoryProps) {
  const { data, isLoading } = useSyllabusVersions(courseId);

  const submit   = useSubmitSyllabusVersion(courseId);
  const validate = useValidateSyllabusVersion(courseId);
  const reject   = useRejectSyllabusVersion(courseId);
  const apply    = useApplySyllabusVersion(courseId);

  const [diffVersion,  setDiffVersion]  = useState<SyllabusVersion | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SyllabusVersion | null>(null);
  const [rejectNotes,  setRejectNotes]  = useState('');

  const versions = data?.versions ?? [];

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Chargement…</div>;
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
        <FileText className="h-8 w-8 opacity-40" />
        <p className="text-sm">Aucune version disponible.</p>
        <p className="text-xs">La version initiale est créée automatiquement lors de la première extraction du syllabus.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0 p-1">
        {versions.map((v, i) => (
          <VersionRow
            key={v.id}
            version={v}
            isLast={i === versions.length - 1}
            canValidate={canValidate}
            onViewDiff={setDiffVersion}
            onSubmit={(id) => submit.mutate(id)}
            onValidate={(id) => validate.mutate(id)}
            onReject={(v) => { setRejectTarget(v); setRejectNotes(''); }}
            onApply={(id) => {
              if (confirm('Appliquer cette version au syllabus live ? Le contenu actuel (chapitres, sections, bibliographie) sera mis à jour.')) {
                apply.mutate(id);
              }
            }}
          />
        ))}
      </div>

      {/* Diff viewer dialog */}
      <Dialog open={!!diffVersion} onOpenChange={(o) => !o && setDiffVersion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Différences — v{diffVersion?.version_number}: {diffVersion?.label}
            </DialogTitle>
            <DialogDescription>Comparaison avec la version précédente</DialogDescription>
          </DialogHeader>
          {diffVersion && (
            <VersionDiffViewer
              diff={diffVersion.diff_summary}
              fromLabel={`v${(diffVersion.version_number ?? 1) - 1}`}
              toLabel={`v${diffVersion.version_number}: ${diffVersion.label ?? ''}`}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Rejeter la version
            </DialogTitle>
            <DialogDescription>v{rejectTarget?.version_number}: {rejectTarget?.label}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="rejection-notes">Motif du rejet (optionnel)</Label>
              <Textarea
                id="rejection-notes"
                placeholder="Expliquez pourquoi cette version est rejetée…"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Annuler</Button>
              <Button
                variant="destructive"
                disabled={reject.isPending}
                onClick={() => {
                  if (!rejectTarget) return;
                  reject.mutate(
                    { versionId: rejectTarget.id, data: { rejection_notes: rejectNotes } },
                    { onSuccess: () => setRejectTarget(null) }
                  );
                }}
              >
                Confirmer le rejet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
