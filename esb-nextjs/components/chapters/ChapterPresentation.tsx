'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Pencil, Check, X, Loader2, ListChecks, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface ChapterPresentationProps {
  chapterId: number;
  description: string | null;
  objectives: string | null;       // JSON string: string[]
  validated: boolean;
  canEdit: boolean;
}

function parseObjectives(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export function ChapterPresentation({
  chapterId, description, objectives, validated, canEdit,
}: ChapterPresentationProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(description ?? '');
  const [editObj, setEditObj] = useState<string[]>(parseObjectives(objectives));

  const items = editing ? editObj : parseObjectives(objectives);
  const hasContent = !!(description || (parseObjectives(objectives).length > 0));

  // ── Save mutation ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.put(`/api/v1/chapters/${chapterId}/description`, {
        description: editDesc,
        objectives: JSON.stringify(editObj),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Présentation sauvegardée');
      qc.invalidateQueries({ queryKey: ['chapter', chapterId] });
      setEditing(false);
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  // ── Generate mutation ──────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/chapters/${chapterId}/description/generate`);
      return res.data as { description: string; objectives: string };
    },
    onSuccess: (data) => {
      setEditDesc(data.description ?? '');
      setEditObj(parseObjectives(data.objectives));
      setEditing(true);
      toast.success('Présentation générée — vérifiez et validez');
    },
    onError: () => toast.error('Erreur lors de la génération AI'),
  });

  const cancelEdit = () => {
    setEditDesc(description ?? '');
    setEditObj(parseObjectives(objectives));
    setEditing(false);
  };

  // ── Empty state (teacher) ──────────────────────────────────────────────────
  if (!hasContent && !editing) {
    if (!canEdit) return null;
    return (
      <div className="rounded-[20px] border border-dashed border-bolt-line bg-white p-6 flex flex-col items-center gap-3 text-center shadow-sm">
        <BookOpen className="h-8 w-8 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-bolt-ink">Ajouter une présentation du chapitre</p>
          <p className="text-xs text-muted-foreground mt-1">Décrivez le chapitre et les activités à réaliser. Peut être généré par IA.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Écrire
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Générer via IA
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-[20px] border bg-white shadow-sm overflow-hidden ${validated ? 'border-bolt-line' : 'border-amber-300'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-bolt-line bg-muted/20">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-bolt-accent" />
          <span className="text-sm font-semibold text-bolt-ink">Présentation du chapitre</span>
          {!validated && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Non validé
            </span>
          )}
        </div>
        {canEdit && !editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 rounded-full text-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 rounded-full text-xs" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 rounded-full text-xs text-muted-foreground" onClick={cancelEdit}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" className="h-7 px-3 rounded-full text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Valider
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Description */}
        {editing ? (
          <Textarea
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            placeholder="Décrivez ce chapitre en 2-3 phrases..."
            rows={3}
            className="resize-none text-sm rounded-[10px]"
          />
        ) : (
          description && <p className="text-sm text-bolt-ink leading-relaxed">{description}</p>
        )}

        {/* Objectives */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <ListChecks className="h-4 w-4 text-bolt-accent" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activités à réaliser</span>
          </div>
          {editing ? (
            <div className="space-y-2">
              {editObj.map((obj, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={obj}
                    onChange={e => {
                      const next = [...editObj];
                      next[i] = e.target.value;
                      setEditObj(next);
                    }}
                    className="flex-1 rounded-[8px] border border-bolt-line px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-bolt-accent"
                  />
                  <button onClick={() => setEditObj(editObj.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setEditObj([...editObj, ''])}
                className="text-xs text-bolt-accent hover:underline mt-1"
              >
                + Ajouter une activité
              </button>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map((obj, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-bolt-ink">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-bolt-accent" />
                  {obj}
                </li>
              ))}
              {items.length === 0 && (
                <li className="text-xs text-muted-foreground italic">Aucune activité définie.</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
