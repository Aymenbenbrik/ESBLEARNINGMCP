'use client';

import React from 'react';
import { Plus, Minus, Edit3, Info } from 'lucide-react';
import type { SyllabusDiff, ChapterChange, AAChange, BibChange } from '@/lib/types/syllabusVersions';

// ─── Diff row types ───────────────────────────────────────────────────────────

function AddedRow({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2 rounded px-2 py-1 bg-green-50 border border-green-100 text-sm">
      <Plus className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
      <span className="text-green-900">{label}</span>
    </div>
  );
}

function RemovedRow({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2 rounded px-2 py-1 bg-red-50 border border-red-100 text-sm">
      <Minus className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
      <span className="text-red-900 line-through">{label}</span>
    </div>
  );
}

function ModifiedRow({ label, from, to }: { label: string; from?: string; to?: string }) {
  return (
    <div className="flex items-start gap-2 rounded px-2 py-1 bg-yellow-50 border border-yellow-100 text-sm">
      <Edit3 className="h-4 w-4 text-yellow-700 flex-shrink-0 mt-0.5" />
      <div>
        <span className="font-medium text-yellow-900">{label}</span>
        {from !== undefined && (
          <div className="text-xs mt-0.5">
            <span className="text-red-600 line-through">{String(from)}</span>
            {' → '}
            <span className="text-green-700">{String(to)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section group ────────────────────────────────────────────────────────────

function DiffSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface VersionDiffViewerProps {
  diff: import('@/lib/types/syllabusVersions').SyllabusDiff | null | undefined;
  fromLabel?: string;
  toLabel?: string;
}

export function VersionDiffViewer({ diff, fromLabel = 'Précédente', toLabel = 'Actuelle' }: VersionDiffViewerProps) {
  if (!diff || Object.keys(diff).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <Info className="h-6 w-6 opacity-40" />
        <p className="text-sm">Aucune différence détectée entre ces deux versions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
        <span className="flex items-center gap-1">
          <Minus className="h-3 w-3 text-red-500" /> {fromLabel}
        </span>
        <span className="flex items-center gap-1">
          <Plus className="h-3 w-3 text-green-500" /> {toLabel}
        </span>
      </div>

      {/* Admin */}
      {diff.admin && Object.keys(diff.admin).length > 0 && (
        <DiffSection title="Informations administratives">
          {Object.entries(diff.admin).map(([key, change]) => (
            <ModifiedRow
              key={key}
              label={key}
              from={change.from !== null && change.from !== undefined ? String(change.from) : '—'}
              to={change.to !== null && change.to !== undefined ? String(change.to) : '—'}
            />
          ))}
        </DiffSection>
      )}

      {/* AA */}
      {diff.aa && (
        <DiffSection title="Acquis d'apprentissage (AA)">
          {diff.aa.added?.map((aa: AAChange) => (
            <AddedRow key={aa.number} label={`AA${aa.number} — ${aa.description}`} />
          ))}
          {diff.aa.removed?.map((aa: AAChange) => (
            <RemovedRow key={aa.number} label={`AA${aa.number}`} />
          ))}
          {diff.aa.modified?.map((aa: AAChange) => (
            <ModifiedRow key={aa.number} label={`AA${aa.number}`} from={aa.from} to={aa.to} />
          ))}
        </DiffSection>
      )}

      {/* Chapters */}
      {diff.chapters && (
        <DiffSection title="Chapitres et sections">
          {diff.chapters.added?.map((c: ChapterChange) => (
            <AddedRow key={c.index} label={`Ch. ${c.index} — ${c.title}`} />
          ))}
          {diff.chapters.removed?.map((c: ChapterChange) => (
            <RemovedRow key={c.index} label={`Ch. ${c.index} — ${c.title}`} />
          ))}
          {diff.chapters.modified?.map((c: ChapterChange) => (
            <div key={c.index} className="space-y-1">
              {c.title && (
                <ModifiedRow
                  label={`Ch. ${c.index}`}
                  from={c.from}
                  to={c.to}
                />
              )}
              {c.sections && (
                <div className="ml-4 space-y-1">
                  {c.sections.added?.map(s => (
                    <AddedRow key={s.index} label={`§ ${s.index} — ${s.title}`} />
                  ))}
                  {c.sections.removed?.map(s => (
                    <RemovedRow key={s.index} label={`§ ${s.index}`} />
                  ))}
                  {c.sections.modified?.map(s => (
                    <ModifiedRow key={s.index} label={`§ ${s.index}`} from={s.from} to={s.to} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </DiffSection>
      )}

      {/* Bibliography */}
      {diff.bibliography && (
        <DiffSection title="Bibliographie">
          {diff.bibliography.added?.map((b: BibChange) => (
            <AddedRow key={b.position} label={`[${b.position}] ${b.entry}`} />
          ))}
          {diff.bibliography.removed?.map((b: BibChange) => (
            <RemovedRow key={b.position} label={`[${b.position}]`} />
          ))}
          {diff.bibliography.modified?.map((b: BibChange) => (
            <ModifiedRow key={b.position} label={`[${b.position}]`} from={b.from} to={b.to} />
          ))}
        </DiffSection>
      )}
    </div>
  );
}
