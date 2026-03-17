'use client';

import { useState } from 'react';
import {
  useCourseReferences,
  useCreateReference,
  useDeleteReference,
  useImportBibliography,
  useLinkReference,
  useUnlinkReference,
  useUpdateChapterReference,
} from '@/lib/hooks/useReferences';
import { CourseReference } from '@/lib/types/references';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BookOpen,
  Plus,
  Trash2,
  Download,
  ExternalLink,
  CheckSquare,
  Square,
  FileText,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface ChapterReferencesProps {
  courseId: number;
  chapterId: number;
  canEdit: boolean;
}

const REF_TYPE_LABELS: Record<string, string> = {
  book: 'Livre',
  article: 'Article',
  online: 'En ligne',
  other: 'Autre',
};

/** Single reference row with checkbox toggle and pages input */
function ReferenceRow({
  ref,
  chapterId,
  canEdit,
}: {
  ref: CourseReference;
  chapterId: number;
  canEdit: boolean;
}) {
  const [pages, setPages] = useState(ref.pages ?? '');
  const [editingPages, setEditingPages] = useState(false);

  const linkMutation = useLinkReference(chapterId);
  const unlinkMutation = useUnlinkReference(chapterId);
  const updateLink = useUpdateChapterReference(chapterId);
  const deleteMutation = useDeleteReference();

  const isLinked = ref.linked_to_chapter ?? false;

  const handleToggle = () => {
    if (isLinked) {
      unlinkMutation.mutate(ref.id);
    } else {
      linkMutation.mutate({ referenceId: ref.id, pages: pages || undefined });
    }
  };

  const handlePagesBlur = () => {
    setEditingPages(false);
    if (isLinked) {
      updateLink.mutate({ referenceId: ref.id, data: { pages: pages || null } });
    }
  };

  const isBusy =
    linkMutation.isPending || unlinkMutation.isPending || updateLink.isPending;

  return (
    <div
      className={`flex flex-col gap-2 rounded-[16px] border p-3 transition-colors ${
        isLinked ? 'border-bolt-accent/30 bg-bolt-accent/5' : 'border-bolt-line bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        {canEdit ? (
          <button
            onClick={handleToggle}
            disabled={isBusy}
            className="mt-0.5 shrink-0 text-bolt-accent disabled:opacity-50"
            aria-label={isLinked ? 'Décocher' : 'Cocher'}
          >
            {isLinked ? (
              <CheckSquare className="h-5 w-5" />
            ) : (
              <Square className="h-5 w-5 text-bolt-muted" />
            )}
          </button>
        ) : (
          <div className="mt-0.5 shrink-0">
            {isLinked ? (
              <CheckSquare className="h-5 w-5 text-bolt-accent" />
            ) : (
              <Square className="h-5 w-5 text-bolt-muted" />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{ref.title}</p>
          {ref.authors && (
            <p className="mt-0.5 text-xs text-muted-foreground">{ref.authors}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {REF_TYPE_LABELS[ref.ref_type] ?? ref.ref_type}
            </Badge>
            {ref.from_bibliography && (
              <Badge variant="secondary" className="text-xs">
                Bibliographie
              </Badge>
            )}
            {ref.url && (
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-bolt-accent hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Lien
              </a>
            )}
          </div>
        </div>

        {canEdit && (
          <button
            onClick={() => deleteMutation.mutate(ref.id)}
            disabled={deleteMutation.isPending}
            className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
            aria-label="Supprimer la référence"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Pages utiles — visible only when linked */}
      {isLinked && (
        <div className="ml-8 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {canEdit ? (
            <Input
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              onFocus={() => setEditingPages(true)}
              onBlur={handlePagesBlur}
              placeholder="Pages utiles, ex: pp. 45-67, 89"
              className="h-7 rounded-full text-xs"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {ref.pages || 'Aucune page spécifiée'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Form to add a new manual reference */
function AddReferenceForm({
  courseId,
  chapterId,
  onDone,
}: {
  courseId: number;
  chapterId: number;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [url, setUrl] = useState('');
  const [refType, setRefType] = useState<'book' | 'article' | 'online' | 'other'>('book');

  const createMutation = useCreateReference(courseId);
  const linkMutation = useLinkReference(chapterId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const ref = await createMutation.mutateAsync({
      title: title.trim(),
      authors: authors.trim() || undefined,
      url: url.trim() || undefined,
      ref_type: refType,
    });
    // Link to this chapter by default
    await linkMutation.mutateAsync({ referenceId: ref.id });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-[16px] border border-dashed border-bolt-accent/50 bg-bolt-accent/5 p-4">
      <p className="text-sm font-semibold text-bolt-accent">Nouvelle référence</p>

      <div className="space-y-2">
        <div>
          <Label className="text-xs">Titre *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la référence"
            className="mt-1 rounded-full text-sm"
            required
          />
        </div>
        <div>
          <Label className="text-xs">Auteur(s)</Label>
          <Input
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="Nom, Prénom"
            className="mt-1 rounded-full text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">URL / DOI</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="mt-1 rounded-full text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={refType}
            onChange={(e) => setRefType(e.target.value as typeof refType)}
            className="mt-1 w-full rounded-full border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="book">Livre</option>
            <option value="article">Article</option>
            <option value="online">En ligne</option>
            <option value="other">Autre</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          className="rounded-full"
          disabled={createMutation.isPending || linkMutation.isPending}
        >
          Ajouter
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Main ChapterReferences component */
export function ChapterReferences({ courseId, chapterId, canEdit }: ChapterReferencesProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: refs = [], isLoading } = useCourseReferences(courseId, chapterId);
  const importMutation = useImportBibliography(courseId);

  if (isLoading) {
    return (
      <Card className="rounded-[24px] border-bolt-line shadow-sm">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[24px] border-bolt-line shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-bolt-accent" />
            <span>Références bibliographiques</span>
            <Badge variant="secondary">{refs.filter((r) => r.linked_to_chapter).length} / {refs.length}</Badge>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
              >
                <Download className="mr-1.5 h-4 w-4" />
                {importMutation.isPending ? 'Import...' : 'Importer bibliographie TN'}
              </Button>
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Ajouter
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {showAddForm && (
          <AddReferenceForm
            courseId={courseId}
            chapterId={chapterId}
            onDone={() => setShowAddForm(false)}
          />
        )}

        {refs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucune référence pour ce cours.
            {canEdit && ' Importez la bibliographie TN ou ajoutez manuellement.'}
          </p>
        ) : (
          refs.map((ref) => (
            <ReferenceRow key={ref.id} ref={ref} chapterId={chapterId} canEdit={canEdit} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
