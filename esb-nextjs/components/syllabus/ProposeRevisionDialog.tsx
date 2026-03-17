'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, BookOpen, ListTree, BookMarked, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useCreateSyllabusVersion } from '@/lib/hooks/useSyllabusVersions';
import type {
  SyllabusSnapshot, SnapshotChapter, SnapshotSection, SnapshotBibEntry, SnapshotAdmin,
} from '@/lib/types/syllabusVersions';

// ─── Section editor ───────────────────────────────────────────────────────────

interface SectionEditorProps {
  sections: SnapshotSection[];
  chapterIndex: number;
  onChange: (sections: SnapshotSection[]) => void;
}

function SectionEditor({ sections, chapterIndex, onChange }: SectionEditorProps) {
  const addSection = () => {
    const lastIdx = sections.length > 0 ? sections[sections.length - 1].index : `${chapterIndex}.0`;
    const parts = lastIdx.split('.');
    const lastNum = parseInt(parts[parts.length - 1] || '0', 10);
    const newIdx = `${chapterIndex}.${lastNum + 1}`;
    onChange([...sections, { index: newIdx, title: '' }]);
  };

  return (
    <div className="ml-4 space-y-1">
      {sections.map((sec, si) => (
        <div key={si} className="flex gap-2 items-center">
          <Input
            className="w-20 h-7 text-xs"
            value={sec.index}
            onChange={(e) => {
              const updated = [...sections];
              updated[si] = { ...sec, index: e.target.value };
              onChange(updated);
            }}
            placeholder="1.1"
          />
          <Input
            className="flex-1 h-7 text-xs"
            value={sec.title}
            onChange={(e) => {
              const updated = [...sections];
              updated[si] = { ...sec, title: e.target.value };
              onChange(updated);
            }}
            placeholder="Titre de la section"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
            onClick={() => onChange(sections.filter((_, i) => i !== si))}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={addSection}>
        <Plus className="h-3 w-3 mr-1" /> Ajouter une section
      </Button>
    </div>
  );
}

// ─── Chapter editor ───────────────────────────────────────────────────────────

interface ChapterEditorProps {
  chapters: SnapshotChapter[];
  onChange: (chapters: SnapshotChapter[]) => void;
}

function ChapterEditor({ chapters, onChange }: ChapterEditorProps) {
  const addChapter = () => {
    const nextIdx = (Math.max(0, ...chapters.map(c => c.index)) + 1);
    onChange([...chapters, { index: nextIdx, title: '', sections: [] }]);
  };

  return (
    <div className="space-y-4">
      {chapters.map((chap, ci) => (
        <div key={ci} className="border rounded-md p-3 space-y-2">
          <div className="flex gap-2 items-center">
            <Input
              className="w-16 h-8 text-sm font-medium"
              type="number"
              min={1}
              value={chap.index}
              onChange={(e) => {
                const updated = [...chapters];
                updated[ci] = { ...chap, index: parseInt(e.target.value, 10) || chap.index };
                onChange(updated);
              }}
            />
            <Input
              className="flex-1 h-8 text-sm font-medium"
              value={chap.title}
              onChange={(e) => {
                const updated = [...chapters];
                updated[ci] = { ...chap, title: e.target.value };
                onChange(updated);
              }}
              placeholder="Titre du chapitre"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
              onClick={() => onChange(chapters.filter((_, i) => i !== ci))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <SectionEditor
            sections={chap.sections}
            chapterIndex={chap.index}
            onChange={(sections) => {
              const updated = [...chapters];
              updated[ci] = { ...chap, sections };
              onChange(updated);
            }}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addChapter}>
        <Plus className="h-4 w-4 mr-1" /> Ajouter un chapitre
      </Button>
    </div>
  );
}

// ─── Bibliography editor ──────────────────────────────────────────────────────

interface BibEditorProps {
  entries: SnapshotBibEntry[];
  onChange: (entries: SnapshotBibEntry[]) => void;
}

function BibEditor({ entries, onChange }: BibEditorProps) {
  const addEntry = () => {
    const nextPos = (Math.max(0, ...entries.map(e => e.position)) + 1);
    onChange([...entries, { position: nextPos, entry: '' }]);
  };

  return (
    <div className="space-y-2">
      {entries.map((bib, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="mt-2 text-xs text-muted-foreground w-6 text-right">[{bib.position}]</span>
          <Textarea
            className="flex-1 text-sm min-h-[60px]"
            value={bib.entry}
            onChange={(e) => {
              const updated = [...entries];
              updated[i] = { ...bib, entry: e.target.value };
              onChange(updated);
            }}
            placeholder="Auteur(s), Titre, Éditeur, Année…"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 mt-1 text-muted-foreground hover:text-red-600"
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addEntry}>
        <Plus className="h-4 w-4 mr-1" /> Ajouter une référence
      </Button>
    </div>
  );
}

// ─── Admin editor ─────────────────────────────────────────────────────────────

function AdminEditor({
  admin,
  onChange,
}: {
  admin: SnapshotAdmin;
  onChange: (a: SnapshotAdmin) => void;
}) {
  const field = (key: keyof SnapshotAdmin, label: string) => (
    <div key={key}>
      <Label className="text-xs">{label}</Label>
      <Input
        className="mt-1 h-8 text-sm"
        value={(admin[key] as string) ?? ''}
        onChange={(e) => onChange({ ...admin, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {field('module_name', 'Nom du module')}
      {field('code_ue', 'Code UE')}
      {field('code_ecue', 'Code ECUE')}
      {field('responsible', 'Responsable')}
      {field('department', 'Département')}
      {field('field', 'Filière')}
      {field('volume_presentiel', 'Volume présentiel')}
      {field('volume_personnel', 'Volume personnel')}
      {field('coefficient', 'Coefficient')}
      {field('credits', 'Crédits')}
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface ProposeRevisionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courseId: number;
  currentSnapshot?: SyllabusSnapshot;
}

export function ProposeRevisionDialog({
  open, onOpenChange, courseId, currentSnapshot,
}: ProposeRevisionDialogProps) {
  const createVersion = useCreateSyllabusVersion(courseId);

  const [label,    setLabel]    = useState('');
  const [notes,    setNotes]    = useState('');
  const [chapters, setChapters] = useState<SnapshotChapter[]>([]);
  const [bib,      setBib]      = useState<SnapshotBibEntry[]>([]);
  const [admin,    setAdmin]    = useState<SnapshotAdmin>({});

  // Pre-fill from current live snapshot when dialog opens
  useEffect(() => {
    if (open && currentSnapshot) {
      setChapters(structuredClone(currentSnapshot.chapters ?? []));
      setBib(structuredClone(currentSnapshot.bibliography ?? []));
      setAdmin(structuredClone(currentSnapshot.admin ?? {}));
    }
  }, [open, currentSnapshot]);

  const handleSubmit = () => {
    createVersion.mutate(
      {
        label: label || undefined,
        notes: notes || undefined,
        snapshot: {
          chapters,
          bibliography: bib,
          admin,
        },
      },
      { onSuccess: () => { onOpenChange(false); setLabel(''); setNotes(''); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            Proposer une révision du syllabus
          </DialogTitle>
          <DialogDescription>
            Créez une nouvelle version du syllabus. Elle sera soumise pour validation avant d'être appliquée.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rev-label">Titre de la révision</Label>
              <Input
                id="rev-label"
                className="mt-1"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex. Révision Semestre 2 2025"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="rev-notes">Justification des modifications</Label>
            <Textarea
              id="rev-notes"
              className="mt-1"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Décrivez brièvement les raisons de cette révision…"
            />
          </div>

          <Separator />

          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 flex gap-2 text-sm text-yellow-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              Modifiez les éléments ci-dessous. Seules les sections modifiées seront comparées à la version actuelle.
              Les liens AA ne seront pas affectés.
            </span>
          </div>

          {/* Tabbed editors */}
          <Tabs defaultValue="chapters">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="chapters" className="text-xs">
                <ListTree className="h-3 w-3 mr-1" /> Chapitres & Sections
              </TabsTrigger>
              <TabsTrigger value="bib" className="text-xs">
                <BookMarked className="h-3 w-3 mr-1" /> Bibliographie
              </TabsTrigger>
              <TabsTrigger value="admin" className="text-xs">
                Informations admin.
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chapters" className="pt-3">
              <ChapterEditor chapters={chapters} onChange={setChapters} />
            </TabsContent>
            <TabsContent value="bib" className="pt-3">
              <BibEditor entries={bib} onChange={setBib} />
            </TabsContent>
            <TabsContent value="admin" className="pt-3">
              <AdminEditor admin={admin} onChange={setAdmin} />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            onClick={handleSubmit}
            disabled={createVersion.isPending}
          >
            {createVersion.isPending ? 'Création…' : 'Enregistrer comme brouillon'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
