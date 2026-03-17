'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Save, BookOpen, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAAMatching, useProposeAAMatching, useSaveAAMatching } from '@/lib/hooks/useChapters';
import { AAItem } from '@/lib/api/chapters';

interface ChapterAAMatchingProps {
  chapterId: number;
  canEdit: boolean;
}

export function ChapterAAMatching({ chapterId, canEdit }: ChapterAAMatchingProps) {
  const { data, isLoading, error } = useAAMatching(chapterId);
  const propose = useProposeAAMatching();
  const save = useSaveAAMatching();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Initialise selection from server data
  useEffect(() => {
    if (data) {
      setSelected(new Set(data.current_aa_ids));
      setIsDirty(false);
    }
  }, [data]);

  const toggle = (id: number) => {
    if (!canEdit) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setIsDirty(true);
  };

  const handlePropose = async () => {
    const result = await propose.mutateAsync(chapterId);
    setSelected(new Set(result.proposed_aa_ids));
    setIsDirty(true);
    setExpanded(true);
  };

  const handleSave = () => {
    save.mutate({ chapterId, aaIds: Array.from(selected) });
    setIsDirty(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <BookOpen className="h-4 w-4 animate-pulse" />
        Chargement des Acquis d'Apprentissage…
      </div>
    );
  }

  if (error || !data) {
    // Silently hide if no TN syllabus — not an error for the user
    return null;
  }

  const { all_aas, current_aa_ids } = data;
  const selectedCount = selected.size;

  return (
    <Card className="rounded-[20px] border border-bolt-line shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-bolt-accent" />
            <CardTitle className="text-base">
              Acquis d'Apprentissage (AA)
            </CardTitle>
            <Badge variant="secondary">{selectedCount} / {all_aas.length}</Badge>
            {isDirty && (
              <Badge variant="outline" className="border-amber-400 text-amber-600 text-xs">
                Non sauvegardé
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePropose}
                  disabled={propose.isPending}
                >
                  <Sparkles className={`h-4 w-4 mr-2 ${propose.isPending ? 'animate-spin' : ''}`} />
                  {propose.isPending ? 'Analyse…' : 'Proposition automatique'}
                </Button>
                {isDirty && (
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={save.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {save.isPending ? 'Sauvegarde…' : 'Valider'}
                  </Button>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Compact chips preview when collapsed */}
        {!expanded && selectedCount > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {all_aas
              .filter((aa) => selected.has(aa.id))
              .map((aa) => (
                <span
                  key={aa.id}
                  title={aa.description}
                  className="rounded-full bg-bolt-accent/10 px-2.5 py-0.5 text-xs font-semibold text-bolt-accent"
                >
                  AA{aa.number}
                </span>
              ))}
          </div>
        )}
        {!expanded && selectedCount === 0 && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            Aucun AA associé à ce chapitre.
            {canEdit && ' Utilisez « Proposition automatique » pour démarrer.'}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {all_aas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun AA défini dans le syllabus.</p>
          ) : (
            <div className="space-y-2">
              {all_aas.map((aa: AAItem) => {
                const checked = selected.has(aa.id);
                return (
                  <label
                    key={aa.id}
                    className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      checked
                        ? 'border-bolt-accent/40 bg-bolt-accent/5'
                        : 'border-border bg-background hover:bg-muted/30'
                    } ${!canEdit ? 'cursor-default' : ''}`}
                    onClick={() => toggle(aa.id)}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!canEdit}
                      className="mt-0.5 pointer-events-none"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${checked ? 'text-bolt-accent' : 'text-muted-foreground'}`}>
                          AA{aa.number}
                        </span>
                      </div>
                      <p className="text-sm leading-snug text-foreground">{aa.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {canEdit && isDirty && (
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSave} disabled={save.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {save.isPending ? 'Sauvegarde…' : 'Valider le matching'}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
