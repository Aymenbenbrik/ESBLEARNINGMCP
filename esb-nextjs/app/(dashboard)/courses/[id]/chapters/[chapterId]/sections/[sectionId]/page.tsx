'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useSection,
  useCreateSubSection,
  useUpdateActivityTitle,
  useDeleteSection,
  useUpdateSection,
  chapterKeys,
} from '@/lib/hooks/useChapters';
import { useAuth } from '@/lib/hooks/useAuth';
import { sectionActivitiesApi } from '@/lib/api/references';
import { practicalWorkApi } from '@/lib/api/practicalWork';
import {
  ArrowLeft, Plus, Pencil, Trash2, Check, X, BookOpen,
  Youtube, FileText, Image as ImageIcon, File, ClipboardList,
  FileCode2, ChevronRight, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { TNSection } from '@/lib/types/course';
import type { SectionActivity, ActivityType } from '@/lib/types/references';

// ─── Activity helpers ─────────────────────────────────────────────────────────

function activityIcon(type: ActivityType) {
  switch (type) {
    case 'youtube': return <Youtube className="h-3.5 w-3.5 text-red-500" />;
    case 'text_doc': return <FileText className="h-3.5 w-3.5 text-rose-800" />;
    case 'image': return <ImageIcon className="h-3.5 w-3.5 text-amber-600" />;
    case 'pdf_extract': return <File className="h-3.5 w-3.5 text-rose-700" />;
    case 'quiz': return <ClipboardList className="h-3.5 w-3.5 text-blue-600" />;
    case 'assignment': return <FileText className="h-3.5 w-3.5 text-blue-700" />;
    default: return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function activityLabel(type: ActivityType) {
  switch (type) {
    case 'youtube': return 'Vidéo';
    case 'text_doc': return 'Document texte';
    case 'image': return 'Image';
    case 'pdf_extract': return 'Extrait PDF';
    case 'quiz': return 'Quiz';
    case 'assignment': return 'Devoir';
    default: return 'Activité';
  }
}

function activityHref(activity: SectionActivity, courseId: number, chapterId: number): string {
  const base = `/courses/${courseId}/chapters/${chapterId}`;
  switch (activity.activity_type) {
    case 'youtube': return `${base}/video/${activity.id}`;
    case 'text_doc':
    case 'image':
    case 'pdf_extract': return `${base}/content/${activity.id}`;
    case 'quiz': return `${base}/section-quiz/${activity.section_id}`;
    case 'assignment': return `${base}/assignment/${activity.section_id}`;
    default: return base;
  }
}

// ─── Column definitions ───────────────────────────────────────────────────────

const DOC_TYPES: ActivityType[] = ['youtube', 'pdf_extract', 'image', 'text_doc'];
const CONSOLIDATION_TYPES: ActivityType[] = ['quiz', 'assignment'];

// ─── Inline edit title ────────────────────────────────────────────────────────

function EditableTitle({
  activityId,
  sectionId,
  currentTitle,
}: {
  activityId: number;
  sectionId: number;
  currentTitle: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentTitle);
  const updateTitle = useUpdateActivityTitle(sectionId);

  const save = () => {
    if (!value.trim()) return;
    updateTitle.mutate(
      { activityId, title: value.trim() },
      { onSuccess: () => setEditing(false) }
    );
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded-full p-1 text-muted-foreground hover:text-bolt-ink hover:bg-gray-100 transition-colors"
        title="Modifier le titre"
      >
        <Pencil className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-1">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        className="h-6 text-xs rounded-[6px] flex-1"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button onClick={save} className="p-1 text-green-600 hover:bg-green-50 rounded-full">
        <Check className="h-3 w-3" />
      </button>
      <button onClick={() => setEditing(false)} className="p-1 text-muted-foreground hover:bg-gray-100 rounded-full">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Activity card ────────────────────────────────────────────────────────────

function ActivityCard({
  activity,
  sectionId,
  courseId,
  chapterId,
  canEdit,
  onDelete,
}: {
  activity: SectionActivity;
  sectionId: number;
  courseId: number;
  chapterId: number;
  canEdit: boolean;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-xl border border-bolt-line bg-white px-3 py-2.5 hover:border-gray-300 hover:shadow-sm transition-all">
      <span className="shrink-0">{activityIcon(activity.activity_type)}</span>
      <Link
        href={activityHref(activity, courseId, chapterId)}
        className="flex-1 min-w-0 no-underline"
      >
        <p className="text-sm font-medium text-bolt-ink truncate leading-snug">
          {activity.title || activityLabel(activity.activity_type)}
        </p>
        <p className="text-xs text-muted-foreground">{activityLabel(activity.activity_type)}</p>
      </Link>
      {canEdit && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <EditableTitle
            activityId={activity.id}
            sectionId={sectionId}
            currentTitle={activity.title || ''}
          />
          <button
            onClick={() => onDelete(activity.id)}
            className="rounded-full p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

const COLUMN_META = [
  {
    id: 'docs',
    label: 'Documents & Vidéos',
    emoji: '📚',
    border: 'border-gray-300',
    bg: 'bg-gray-50',
    header: 'bg-gray-100',
    accent: 'text-gray-700',
    badge: 'bg-gray-200 text-gray-700',
    types: DOC_TYPES,
  },
  {
    id: 'pratiques',
    label: 'Activités Pratiques',
    emoji: '🔬',
    border: 'border-rose-800/30',
    bg: 'bg-rose-50/50',
    header: 'bg-rose-900/5',
    accent: 'text-rose-900',
    badge: 'bg-rose-100 text-rose-900',
    types: [] as ActivityType[], // TPs fetched separately
  },
  {
    id: 'consolidation',
    label: 'Consolidation des Acquis',
    emoji: '🎯',
    border: 'border-blue-200',
    bg: 'bg-blue-50/50',
    header: 'bg-blue-50',
    accent: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    types: CONSOLIDATION_TYPES,
  },
] as const;

// ─── Sub-section item ─────────────────────────────────────────────────────────

function SubSectionItem({
  sub,
  courseId,
  chapterId,
  canEdit,
  onDelete,
}: {
  sub: TNSection;
  courseId: number;
  chapterId: number;
  canEdit: boolean;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(sub.title);
  const updateSection = useUpdateSection(chapterId);

  const saveEdit = () => {
    if (!editTitle.trim()) return;
    updateSection.mutate(
      { sectionId: sub.id, data: { title: editTitle.trim() } },
      { onSuccess: () => setEditing(false) }
    );
  };

  return (
    <div className="group flex items-center gap-2 pl-5 rounded-lg border border-bolt-line bg-white px-3 py-2 hover:border-gray-300 transition-all">
      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      {editing ? (
        <>
          <Input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="h-6 text-xs rounded-[6px] flex-1"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded-full">
            <Check className="h-3 w-3" />
          </button>
          <button onClick={() => setEditing(false)} className="p-1 text-muted-foreground hover:bg-gray-100 rounded-full">
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <Link
            href={`/courses/${courseId}/chapters/${chapterId}/sections/${sub.id}`}
            className="flex-1 min-w-0 no-underline"
          >
            <span className="text-xs text-muted-foreground font-medium">{sub.index}</span>
            <span className="text-sm font-medium text-bolt-ink ml-2 truncate">{sub.title}</span>
          </Link>
          {canEdit && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditing(true)}
                className="rounded-full p-1 text-muted-foreground hover:text-bolt-ink hover:bg-gray-100"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDelete(sub.id)}
                className="rounded-full p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sectionId = parseInt(params.sectionId as string);
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);

  const { data, isLoading } = useSection(sectionId);
  const { user } = useAuth();
  const qc = useQueryClient();

  // Sub-section management
  const [addingSubSection, setAddingSubSection] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState('');

  // Content panel state
  const [activeContentGroup, setActiveContentGroup] = useState<string | null>(null);
  const [ytUrl, setYtUrl] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageTitle, setImageTitle] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState('');
  const createSubSection = useCreateSubSection(chapterId);
  const deleteSection = useDeleteSection(chapterId);

  // Practical works
  const { data: practicalWorks = [] } = useQuery({
    queryKey: ['section-practical-works', sectionId],
    queryFn: () => practicalWorkApi.listForSection(sectionId),
    enabled: !!sectionId,
  });

  // Delete activity
  const deleteActivity = useMutation({
    mutationFn: ({ sId, aId }: { sId: number; aId: number }) =>
      sectionActivitiesApi.deleteActivity(sId, aId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['section', sectionId] });
      qc.invalidateQueries({ queryKey: ['section-activities', sectionId] });
      toast.success('Activité supprimée');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-5">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Section introuvable.
      </div>
    );
  }

  const section: TNSection = data.section;
  const activities: SectionActivity[] = data.activities ?? [];
  const isTeacher: boolean = data.is_teacher ?? false;

  // Categorize activities
  const docActivities = activities.filter(a => DOC_TYPES.includes(a.activity_type as ActivityType));
  const consolidationActivities = activities.filter(a => CONSOLIDATION_TYPES.includes(a.activity_type as ActivityType));

  const handleAddSubSection = () => {
    if (!newSubTitle.trim()) return;
    createSubSection.mutate(
      { parentSectionId: sectionId, title: newSubTitle.trim() },
      {
        onSuccess: () => {
          setNewSubTitle('');
          setAddingSubSection(false);
          qc.invalidateQueries({ queryKey: ['section', sectionId] });
        },
      }
    );
  };

  const handleDeleteSubSection = (subId: number) => {
    deleteSection.mutate(subId, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['section', sectionId] }),
    });
  };

  const handleAddYoutube = async () => {
    if (!ytUrl.trim()) return;
    setYtLoading(true);
    try {
      await sectionActivitiesApi.addYoutube(sectionId, ytUrl.trim(), ytTitle.trim() || undefined);
      qc.invalidateQueries({ queryKey: ['section', sectionId] });
      setYtUrl(''); setYtTitle('');
      toast.success('Vidéo ajoutée');
    } catch { toast.error('Erreur lors de l\'ajout de la vidéo'); }
    finally { setYtLoading(false); }
  };

  const handleAddImage = async () => {
    if (!imageFile) return;
    setImageLoading(true);
    try {
      await sectionActivitiesApi.addImage(sectionId, imageFile, imageTitle || imageFile.name);
      qc.invalidateQueries({ queryKey: ['section', sectionId] });
      setImageFile(null); setImageTitle('');
      toast.success('Image ajoutée');
    } catch { toast.error('Erreur lors de l\'ajout de l\'image'); }
    finally { setImageLoading(false); }
  };

  const handleAddFile = async () => {
    if (!docFile) return;
    setDocLoading(true);
    try {
      await sectionActivitiesApi.addFile(sectionId, docFile, docTitle || docFile.name);
      qc.invalidateQueries({ queryKey: ['section', sectionId] });
      setDocFile(null); setDocTitle('');
      toast.success('Fichier ajouté');
    } catch { toast.error('Erreur lors de l\'ajout du fichier'); }
    finally { setDocLoading(false); }
  };

  const handleAiSummary = async () => {
    setAiSummaryLoading(true);
    try {
      const result = await sectionActivitiesApi.aiSummary(sectionId);
      setAiSummaryText(result.summary);
    } catch { toast.error('Erreur lors de la génération du résumé'); }
    finally { setAiSummaryLoading(false); }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Back button */}
      <div>
        <Link
          href={`/courses/${courseId}/chapters/${chapterId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-bolt-ink transition-colors no-underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au chapitre
        </Link>
      </div>

      {/* Section header */}
      <div className="bg-white rounded-2xl border border-bolt-line p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Section {section.index}
            </p>
            <h1 className="text-2xl font-bold text-bolt-ink">{section.title}</h1>
          </div>
          {isTeacher && (
            <Badge variant="secondary" className="shrink-0">Enseignant</Badge>
          )}
        </div>
      </div>

      {/* Sub-sections panel */}
      {(isTeacher || (section.sub_sections && section.sub_sections.length > 0)) && (
        <div className="bg-white rounded-2xl border border-bolt-line p-5">
          <h2 className="text-sm font-semibold text-bolt-ink mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            Sous-sections
            {section.sub_sections && section.sub_sections.length > 0 && (
              <Badge variant="outline" className="text-xs">{section.sub_sections.length}</Badge>
            )}
          </h2>

          <div className="space-y-2">
            {(section.sub_sections ?? []).map(sub => (
              <SubSectionItem
                key={sub.id}
                sub={sub}
                courseId={courseId}
                chapterId={chapterId}
                canEdit={isTeacher}
                onDelete={handleDeleteSubSection}
              />
            ))}

            {isTeacher && (
              addingSubSection ? (
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-bolt-line p-3">
                  <Input
                    placeholder="Titre de la sous-section"
                    value={newSubTitle}
                    onChange={e => setNewSubTitle(e.target.value)}
                    className="h-8 rounded-[10px] text-sm flex-1"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddSubSection();
                      if (e.key === 'Escape') { setAddingSubSection(false); setNewSubTitle(''); }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8 rounded-full px-4 text-xs"
                    onClick={handleAddSubSection}
                    disabled={createSubSection.isPending || !newSubTitle.trim()}
                  >
                    {createSubSection.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ajouter'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-full text-xs"
                    onClick={() => { setAddingSubSection(false); setNewSubTitle(''); }}
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingSubSection(true)}
                  className="flex items-center gap-2 rounded-xl border-2 border-dashed border-bolt-line px-4 py-2 text-sm text-muted-foreground hover:text-bolt-ink hover:border-bolt-ink transition-colors w-full justify-center"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter une sous-section
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* 3-column activity layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {/* Documents & Vidéos */}
        <div className={`rounded-2xl border-2 border-gray-300 bg-gray-50 flex flex-col min-h-[280px]`}>
          <div className="bg-gray-100 rounded-t-2xl px-4 pt-4 pb-3 border-b border-gray-300">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-gray-700" />
              <div className="flex-1">
                <h3 className="font-bold text-sm text-gray-700">📚 Documents & Vidéos</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Cours, fichiers et ressources vidéo</p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                {docActivities.length}
              </span>
            </div>
          </div>
          <div className="flex-1 px-3 py-3 space-y-2">
            {docActivities.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl mb-2">📚</span>
                <p className="text-xs text-muted-foreground">Aucun document pour le moment.</p>
              </div>
            )}
            {docActivities.map(activity => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                sectionId={sectionId}
                courseId={courseId}
                chapterId={chapterId}
                canEdit={isTeacher}
                onDelete={(aId) => deleteActivity.mutate({ sId: sectionId, aId })}
              />
            ))}
          </div>
          {isTeacher && (
            <div className="border-t border-gray-300 px-3 py-3">
              <div className="flex gap-2">
                <Link
                  href={`/courses/${courseId}/chapters/${chapterId}/video?sectionId=${sectionId}`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors no-underline"
                >
                  <Youtube className="h-3.5 w-3.5" />
                  Vidéo
                </Link>
                <Link
                  href={`/courses/${courseId}/chapters/${chapterId}/documents/new`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors no-underline"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Document
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Activités Pratiques */}
        <div className="rounded-2xl border-2 border-rose-800/30 bg-rose-50/50 flex flex-col min-h-[280px]">
          <div className="bg-rose-900/5 rounded-t-2xl px-4 pt-4 pb-3 border-b border-rose-800/30">
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-rose-900" />
              <div className="flex-1">
                <h3 className="font-bold text-sm text-rose-900">🔬 Activités Pratiques</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Travaux pratiques et exercices</p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900">
                {practicalWorks.length}
              </span>
            </div>
          </div>
          <div className="flex-1 px-3 py-3 space-y-2">
            {practicalWorks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl mb-2">🔬</span>
                <p className="text-xs text-muted-foreground">Aucun TP pour le moment.</p>
              </div>
            )}
            {practicalWorks.map(tp => (
              <Link
                key={tp.id}
                href={isTeacher
                  ? `/courses/${courseId}/chapters/${chapterId}/tp/${tp.id}/review`
                  : `/courses/${courseId}/chapters/${chapterId}/tp/${tp.id}`}
                className="group flex items-center gap-3 rounded-xl border border-bolt-line bg-white px-3 py-2.5 hover:border-rose-300 hover:shadow-sm transition-all no-underline"
              >
                <span className="shrink-0 text-base">💻</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-bolt-ink truncate">{tp.title}</p>
                  <p className="text-xs text-muted-foreground uppercase">{tp.language}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-rose-800" />
              </Link>
            ))}
          </div>
          {isTeacher && (
            <div className="border-t border-rose-800/30 px-3 py-3">
              <Link
                href={`/courses/${courseId}/chapters/${chapterId}/tp/create?sectionId=${sectionId}`}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-rose-300 py-2 text-xs font-medium text-rose-800 hover:bg-rose-50 transition-colors no-underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter un TP
              </Link>
            </div>
          )}
        </div>

        {/* Consolidation des Acquis */}
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/50 flex flex-col min-h-[280px]">
          <div className="bg-blue-50 rounded-t-2xl px-4 pt-4 pb-3 border-b border-blue-200">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-blue-700" />
              <div className="flex-1">
                <h3 className="font-bold text-sm text-blue-700">🎯 Consolidation des Acquis</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Quiz, devoirs et évaluations</p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {consolidationActivities.length}
              </span>
            </div>
          </div>
          <div className="flex-1 px-3 py-3 space-y-2">
            {consolidationActivities.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl mb-2">🎯</span>
                <p className="text-xs text-muted-foreground">Aucune évaluation pour le moment.</p>
              </div>
            )}
            {consolidationActivities.map(activity => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                sectionId={sectionId}
                courseId={courseId}
                chapterId={chapterId}
                canEdit={isTeacher}
                onDelete={(aId) => deleteActivity.mutate({ sId: sectionId, aId })}
              />
            ))}
          </div>
          {isTeacher && (
            <div className="border-t border-blue-200 px-3 py-3">
              <div className="flex gap-2">
                <Link
                  href={`/courses/${courseId}/chapters/${chapterId}/section-quiz/${sectionId}?manage=1`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors no-underline"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Quiz
                </Link>
                <Link
                  href={`/courses/${courseId}/chapters/${chapterId}/assignment/${sectionId}?manage=1`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors no-underline"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Devoir
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Content Panel — Teacher only */}
      {isTeacher && (
        <div className="bg-white rounded-2xl border border-bolt-line">
          <div className="px-5 py-4 border-b border-bolt-line">
            <h2 className="text-sm font-semibold text-bolt-ink flex items-center gap-2">
              <Plus className="h-4 w-4 text-muted-foreground" />
              Ajouter du contenu
            </h2>
          </div>

          {/* Group 1: AI Content */}
          <div className="border-b border-bolt-line">
            <button
              onClick={() => setActiveContentGroup(activeContentGroup === 'ai' ? null : 'ai')}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-violet-700 hover:bg-violet-50 transition-colors"
            >
              <span>🤖 Contenu IA</span>
              <ChevronRight className={`h-4 w-4 transition-transform ${activeContentGroup === 'ai' ? 'rotate-90' : ''}`} />
            </button>
            {activeContentGroup === 'ai' && (
              <div className="px-5 pb-4 space-y-3">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Résumé IA</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-xs border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={handleAiSummary}
                    disabled={aiSummaryLoading}
                  >
                    {aiSummaryLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                    {aiSummaryLoading ? 'Génération...' : 'Générer un résumé'}
                  </Button>
                  {aiSummaryText && (
                    <div className="mt-2 p-3 rounded-xl bg-violet-50 border border-violet-200 text-xs text-violet-900 leading-relaxed whitespace-pre-wrap">
                      {aiSummaryText}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Quiz IA</p>
                  <Link
                    href={`/courses/${courseId}/chapters/${chapterId}/section-quiz/${sectionId}?manage=1&generate=1`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-violet-300 px-4 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors no-underline"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Générer un quiz
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Group 2: Add Content */}
          <div className="border-b border-bolt-line">
            <button
              onClick={() => setActiveContentGroup(activeContentGroup === 'content' ? null : 'content')}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>📁 Ajouter un contenu</span>
              <ChevronRight className={`h-4 w-4 transition-transform ${activeContentGroup === 'content' ? 'rotate-90' : ''}`} />
            </button>
            {activeContentGroup === 'content' && (
              <div className="px-5 pb-4 space-y-4">
                {/* YouTube */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <Youtube className="h-3.5 w-3.5 text-red-500" /> Vidéo YouTube
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="URL YouTube"
                      value={ytUrl}
                      onChange={e => setYtUrl(e.target.value)}
                      className="h-8 rounded-[10px] text-xs flex-1"
                    />
                    <Input
                      placeholder="Titre (optionnel)"
                      value={ytTitle}
                      onChange={e => setYtTitle(e.target.value)}
                      className="h-8 rounded-[10px] text-xs w-40"
                    />
                    <Button
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={handleAddYoutube}
                      disabled={ytLoading || !ytUrl.trim()}
                    >
                      {ytLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ajouter'}
                    </Button>
                  </div>
                </div>
                {/* Image */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-amber-600" /> Image
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 flex-1"
                      onChange={e => setImageFile(e.target.files?.[0] || null)}
                    />
                    <Input
                      placeholder="Titre"
                      value={imageTitle}
                      onChange={e => setImageTitle(e.target.value)}
                      className="h-8 rounded-[10px] text-xs w-40"
                    />
                    <Button
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={handleAddImage}
                      disabled={imageLoading || !imageFile}
                    >
                      {imageLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ajouter'}
                    </Button>
                  </div>
                </div>
                {/* File (PDF/DOCX/ZIP) */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <File className="h-3.5 w-3.5 text-rose-700" /> Document (PDF/DOCX/ZIP)
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.zip,.pptx,.xlsx"
                      className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 flex-1"
                      onChange={e => setDocFile(e.target.files?.[0] || null)}
                    />
                    <Input
                      placeholder="Titre"
                      value={docTitle}
                      onChange={e => setDocTitle(e.target.value)}
                      className="h-8 rounded-[10px] text-xs w-40"
                    />
                    <Button
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={handleAddFile}
                      disabled={docLoading || !docFile}
                    >
                      {docLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ajouter'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Group 3: Add Validation */}
          <div>
            <button
              onClick={() => setActiveContentGroup(activeContentGroup === 'validation' ? null : 'validation')}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <span>✅ Ajouter une validation</span>
              <ChevronRight className={`h-4 w-4 transition-transform ${activeContentGroup === 'validation' ? 'rotate-90' : ''}`} />
            </button>
            {activeContentGroup === 'validation' && (
              <div className="px-5 pb-4 space-y-3">
                <div className="flex gap-2">
                  <Link
                    href={`/courses/${courseId}/chapters/${chapterId}/assignment/${sectionId}?manage=1`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 py-2.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors no-underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Créer un Devoir
                  </Link>
                  <Link
                    href={`/courses/${courseId}/chapters/${chapterId}/tp/create?sectionId=${sectionId}`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-rose-300 py-2.5 text-xs font-medium text-rose-800 hover:bg-rose-50 transition-colors no-underline"
                  >
                    <FileCode2 className="h-3.5 w-3.5" />
                    Créer un TP
                  </Link>
                  <Link
                    href={`/courses/${courseId}/chapters/${chapterId}/section-quiz/${sectionId}?manage=1`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 py-2.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors no-underline"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Créer un Quiz
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
