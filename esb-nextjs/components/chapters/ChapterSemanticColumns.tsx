'use client';

import { useState } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Youtube, FileText, Image as ImageIcon, ClipboardList,
  FileCode2, Plus, Upload, Loader2, ExternalLink,
  BookOpen, Video, File, ChevronRight, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { sectionActivitiesApi } from '@/lib/api/references';
import type { SectionActivity, ActivityType } from '@/lib/types/references';
import type { Document, TNSection } from '@/lib/types/course';
import { practicalWorkApi } from '@/lib/api/practicalWork';
import type { PracticalWork } from '@/lib/types/practicalWork';
import { chapterPipelineApi, ChapterExercise } from '@/lib/api/chapter-pipeline';
import { toast } from 'sonner';

// ─── Column palette ───────────────────────────────────────────────────────────
// 1: gray (Documents & Vidéos)
// 2: bordeaux / rose-900 (Activités Pratiques)
// 3: blue (Consolidation des Acquis)

const COLUMNS = [
  {
    id: 'docs',
    label: 'Documents & Vidéos',
    icon: <BookOpen className="h-4 w-4" />,
    emoji: '📚',
    description: 'Cours, fichiers et ressources vidéo',
    border: 'border-gray-300',
    bg: 'bg-gray-50',
    header: 'bg-gray-100',
    accent: 'text-gray-700',
    dot: 'bg-gray-400',
    badge: 'bg-gray-200 text-gray-700',
    btn: 'border-gray-300 text-gray-600 hover:bg-gray-100',
    types: ['youtube'] as ActivityType[],
  },
  {
    id: 'pratiques',
    label: 'Activités Pratiques',
    icon: <FileCode2 className="h-4 w-4" />,
    emoji: '🔬',
    description: 'Travaux pratiques et exercices',
    border: 'border-rose-800/30',
    bg: 'bg-rose-50/50',
    header: 'bg-rose-900/8',
    accent: 'text-rose-900',
    dot: 'bg-rose-800',
    badge: 'bg-rose-100 text-rose-900',
    btn: 'border-rose-300 text-rose-800 hover:bg-rose-50',
    types: ['text_doc', 'image', 'pdf_extract'] as ActivityType[],
  },
  {
    id: 'consolidation',
    label: 'Consolidation des Acquis',
    icon: <ClipboardList className="h-4 w-4" />,
    emoji: '🎯',
    description: 'Quiz, devoirs et évaluations',
    border: 'border-blue-200',
    bg: 'bg-blue-50/50',
    header: 'bg-blue-50',
    accent: 'text-blue-700',
    dot: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    btn: 'border-blue-300 text-blue-700 hover:bg-blue-50',
    types: ['quiz', 'assignment'] as ActivityType[],
  },
] as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  sections: TNSection[];
  documents: Document[];
  canEdit: boolean;
  courseId: number;
  chapterId: number;
}

// ─── Activity icon ────────────────────────────────────────────────────────────

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

function activityHref(
  activity: SectionActivity,
  courseId: number,
  chapterId: number
): string {
  const base = `/courses/${courseId}/chapters/${chapterId}`;
  switch (activity.activity_type) {
    case 'youtube':
      return `${base}/video/${activity.id}`;
    case 'text_doc':
    case 'image':
    case 'pdf_extract':
      return `${base}/content/${activity.id}`;
    case 'quiz':
      return `${base}/section-quiz/${activity.section_id}`;
    case 'assignment':
      return `${base}/assignment/${activity.section_id}`;
    default:
      return base;
  }
}

// ─── Inline add forms ─────────────────────────────────────────────────────────

function AddYoutubeForm({
  sectionId,
  onClose,
}: {
  sectionId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const mutation = useMutation({
    mutationFn: () => sectionActivitiesApi.addYoutube(sectionId, url.trim(), title.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['section-activities', sectionId] });
      toast.success('Vidéo ajoutée');
      onClose();
    },
    onError: () => toast.error('Erreur lors de l\'ajout'),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
      className="mt-2 rounded-xl border border-gray-200 bg-white p-3 space-y-2"
    >
      <Input
        placeholder="URL YouTube (ex: https://youtu.be/xxx)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="h-8 rounded-[8px] text-sm"
        required
      />
      <Input
        placeholder="Titre (optionnel)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 rounded-[8px] text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-7 rounded-full text-xs" disabled={mutation.isPending || !url.trim()}>
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ajouter'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function AddTPForm({
  sectionId,
  onClose,
}: {
  sectionId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const mutation = useMutation({
    mutationFn: () => sectionActivitiesApi.addTextDoc(sectionId, title.trim(), content.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['section-activities', sectionId] });
      toast.success('TP ajouté');
      onClose();
    },
    onError: () => toast.error('Erreur lors de l\'ajout'),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
      className="mt-2 rounded-xl border border-rose-200 bg-white p-3 space-y-2"
    >
      <Input
        placeholder="Titre du TP"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 rounded-[8px] text-sm"
        required
      />
      <textarea
        placeholder="Contenu / énoncé (optionnel)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="w-full rounded-[8px] border border-bolt-line px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-200"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-7 rounded-full text-xs bg-rose-800 hover:bg-rose-900 text-white" disabled={mutation.isPending || !title.trim()}>
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ajouter le TP'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ─── Activity item card ───────────────────────────────────────────────────────

function ActivityCard({
  activity,
  courseId,
  chapterId,
  canEdit,
}: {
  activity: SectionActivity;
  courseId: number;
  chapterId: number;
  canEdit: boolean;
}) {
  const href = activityHref(activity, courseId, chapterId);

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-bolt-line bg-white px-3 py-2.5 hover:border-gray-300 hover:shadow-sm transition-all no-underline"
    >
      <span className="shrink-0">{activityIcon(activity.activity_type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-bolt-ink truncate leading-snug">
          {activity.title || activityLabel(activity.activity_type)}
        </p>
        <p className="text-xs text-muted-foreground">{activityLabel(activity.activity_type)}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-bolt-ink transition-colors" />
    </Link>
  );
}

// ─── Document item card ───────────────────────────────────────────────────────

function DocumentCard({
  document: doc,
  courseId,
  chapterId,
}: {
  document: Document;
  courseId: number;
  chapterId: number;
}) {
  const icon = doc.file_type === 'pdf'
    ? <File className="h-3.5 w-3.5 text-red-600" />
    : doc.file_type === 'docx'
    ? <FileText className="h-3.5 w-3.5 text-blue-600" />
    : <File className="h-3.5 w-3.5 text-gray-500" />;

  return (
    <Link
      href={`/courses/${courseId}/chapters/${chapterId}/documents/${doc.id}`}
      className="group flex items-center gap-3 rounded-xl border border-bolt-line bg-white px-3 py-2.5 hover:border-gray-300 hover:shadow-sm transition-all no-underline"
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-bolt-ink truncate leading-snug">{doc.title}</p>
        <p className="text-xs text-muted-foreground uppercase">{doc.file_type ?? 'fichier'}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-bolt-ink transition-colors" />
    </Link>
  );
}

// ─── TP item card ─────────────────────────────────────────────────────────────

const LANG_EMOJI: Record<string, string> = {
  python: '🐍', sql: '🗄️', r: '📊', java: '☕', c: '⚙️', cpp: '⚙️',
};

function TPCard({
  tp,
  courseId,
  chapterId,
  canEdit,
}: {
  tp: PracticalWork;
  courseId: number;
  chapterId: number;
  canEdit: boolean;
}) {
  const href = canEdit
    ? `/courses/${courseId}/chapters/${chapterId}/tp/${tp.id}/review`
    : `/courses/${courseId}/chapters/${chapterId}/tp/${tp.id}`;

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-bolt-line bg-white px-3 py-2.5 hover:border-rose-300 hover:shadow-sm transition-all no-underline"
    >
      <span className="shrink-0 text-base">{LANG_EMOJI[tp.language] ?? '💻'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-bolt-ink truncate leading-snug">{tp.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-muted-foreground uppercase">{tp.language}</span>
          {tp.status === 'draft' && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Brouillon</span>
          )}
          {tp.submission_count > 0 && (
            <span className="text-[10px] text-muted-foreground">{tp.submission_count} rendu{tp.submission_count > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-rose-800 transition-colors" />
    </Link>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function SemanticColumn({
  col,
  sections,
  allActivities,
  documents,
  practicalWorks,
  publishedExercises,
  canEdit,
  courseId,
  chapterId,
  defaultSectionId,
  isLoading,
}: {
  col: (typeof COLUMNS)[number];
  sections: TNSection[];
  allActivities: SectionActivity[];
  documents?: Document[];
  practicalWorks?: PracticalWork[];
  publishedExercises?: ChapterExercise[];
  canEdit: boolean;
  courseId: number;
  chapterId: number;
  defaultSectionId: number | null;
  isLoading: boolean;
}) {
  const [showAddVideo, setShowAddVideo] = useState(false);

  // Group activities by section for grouped display
  const activitiesBySection = sections.reduce<Record<number, SectionActivity[]>>((acc, s) => {
    acc[s.id] = allActivities.filter(
      a => a.section_id === s.id && col.types.includes(a.activity_type as ActivityType)
    );
    // Also include sub-section activities
    (s.sub_sections ?? []).forEach(sub => {
      acc[sub.id] = allActivities.filter(
        a => a.section_id === sub.id && col.types.includes(a.activity_type as ActivityType)
      );
    });
    return acc;
  }, {});

  const activities = allActivities.filter(a => col.types.includes(a.activity_type as ActivityType));

  const exerciseCount = col.id === 'consolidation' ? (publishedExercises?.length ?? 0) : 0;
  const totalItems = activities.length + (documents?.length ?? 0) + (practicalWorks?.length ?? 0) + exerciseCount;

  const hasSectionGroups = sections.length > 1 || sections.some(s => (s.sub_sections ?? []).length > 0);

  return (
    <div className={`rounded-2xl border-2 ${col.border} ${col.bg} flex flex-col min-h-[320px]`}>
      {/* Header */}
      <div className={`${col.header} rounded-t-2xl px-4 pt-4 pb-3 border-b ${col.border}`}>
        <div className="flex items-center gap-2">
          <span className={col.accent}>{col.icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-sm ${col.accent}`}>{col.emoji} {col.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{col.description}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.badge}`}>
            {totalItems}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-3 py-3 space-y-2 overflow-hidden">
        {isLoading ? (
          <>
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </>
        ) : (
          <>
            {/* Documents (only in column 1) */}
            {documents?.map((doc) => (
              <DocumentCard
                key={`doc-${doc.id}`}
                document={doc}
                courseId={courseId}
                chapterId={chapterId}
              />
            ))}

            {col.id !== 'pratiques' ? (
              /* Activities grouped by section */
              hasSectionGroups ? (
                sections.map(section => {
                  const sectionActivities = activitiesBySection[section.id] ?? [];
                  const subSections = section.sub_sections ?? [];
                  const hasSubContent = subSections.some(sub => (activitiesBySection[sub.id] ?? []).length > 0);
                  if (sectionActivities.length === 0 && !hasSubContent) return null;
                  return (
                    <div key={section.id}>
                      {sections.length > 1 && (
                        <Link
                          href={`/courses/${courseId}/chapters/${chapterId}/sections/${section.id}`}
                          className="block text-xs font-semibold text-muted-foreground hover:text-bolt-ink hover:underline transition-colors mb-1 no-underline truncate"
                        >
                          {section.index} — {section.title}
                        </Link>
                      )}
                      <div className="space-y-1.5">
                        {sectionActivities.map(activity => (
                          <ActivityCard
                            key={activity.id}
                            activity={activity}
                            courseId={courseId}
                            chapterId={chapterId}
                            canEdit={canEdit}
                          />
                        ))}
                        {/* Sub-sections */}
                        {subSections.map(sub => {
                          const subActivities = activitiesBySection[sub.id] ?? [];
                          if (subActivities.length === 0) return null;
                          return (
                            <div key={sub.id} className="ml-3 space-y-1">
                              <Link
                                href={`/courses/${courseId}/chapters/${chapterId}/sections/${sub.id}`}
                                className="block text-xs text-muted-foreground/70 hover:text-bolt-ink hover:underline transition-colors no-underline truncate"
                              >
                                ↳ {sub.index} {sub.title}
                              </Link>
                              {subActivities.map(activity => (
                                <ActivityCard
                                  key={activity.id}
                                  activity={activity}
                                  courseId={courseId}
                                  chapterId={chapterId}
                                  canEdit={canEdit}
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Flat list (single section, no sub-sections) */
                activities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    courseId={courseId}
                    chapterId={chapterId}
                    canEdit={canEdit}
                  />
                ))
              )
            ) : (
              /* Pratiques: activities (text_doc/image/pdf_extract) + Practical Works (TP Code) */
              <>
                {(hasSectionGroups ? (
                  sections.flatMap(section => {
                    const sectionActivities = activitiesBySection[section.id] ?? [];
                    return sectionActivities.map(activity => (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        courseId={courseId}
                        chapterId={chapterId}
                        canEdit={canEdit}
                      />
                    ));
                  })
                ) : (
                  activities.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      courseId={courseId}
                      chapterId={chapterId}
                      canEdit={canEdit}
                    />
                  ))
                ))}
                {practicalWorks?.map((tp) => (
                  <TPCard
                    key={`tp-${tp.id}`}
                    tp={tp}
                    courseId={courseId}
                    chapterId={chapterId}
                    canEdit={canEdit}
                  />
                ))}
              </>
            )}

            {totalItems === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl mb-2">{col.emoji}</span>
                <p className="text-xs text-muted-foreground">Aucun contenu pour le moment.</p>
              </div>
            )}

            {/* Published exercises in consolidation column */}
            {col.id === 'consolidation' && publishedExercises && publishedExercises.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Exercices publiés ({publishedExercises.length})
                </p>
                {publishedExercises.map((ex) => (
                  <Link
                    key={ex.id}
                    href={`/courses/${courseId}/chapters/${chapterId}?tab=consolidation`}
                    className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs hover:bg-blue-50 transition-colors no-underline mb-1.5 group"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-blue-900 truncate">{ex.title}</p>
                      <p className="text-muted-foreground">
                        {ex.questions?.length ?? 0} question{(ex.questions?.length ?? 0) !== 1 ? 's' : ''}
                        {ex.total_points ? ` · ${ex.total_points} pts` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-blue-300 group-hover:text-blue-600 transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {/* Inline add forms */}
            {showAddVideo && defaultSectionId && (
              <AddYoutubeForm sectionId={defaultSectionId} onClose={() => setShowAddVideo(false)} />
            )}
          </>
        )}
      </div>

      {/* Teacher add buttons */}
      {canEdit && defaultSectionId && (
        <div className={`border-t ${col.border} px-3 py-3 space-y-2`}>
          {col.id === 'docs' && (
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAddVideo(v => !v); }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-xs font-medium transition-colors ${col.btn}`}
              >
                <Youtube className="h-3.5 w-3.5" />
                Ajouter une vidéo
              </button>
              <Link
                href={`/courses/${courseId}/chapters/${chapterId}/documents/new`}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-xs font-medium transition-colors no-underline ${col.btn}`}
              >
                <Upload className="h-3.5 w-3.5" />
                Uploader fichier
              </Link>
            </div>
          )}
          {col.id === 'pratiques' && (
            <Link
              href={`/courses/${courseId}/chapters/${chapterId}/tp/create?sectionId=${defaultSectionId}`}
              className={`w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-xs font-medium transition-colors no-underline ${col.btn}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter un TP
            </Link>
          )}
          {col.id === 'consolidation' && (
            <div className="flex gap-2">
              <Link
                href={`/courses/${courseId}/chapters/${chapterId}/section-quiz/${defaultSectionId}?manage=1`}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-xs font-medium transition-colors no-underline ${col.btn}`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Créer un quiz
              </Link>
              <Link
                href={`/courses/${courseId}/chapters/${chapterId}/assignment/${defaultSectionId}?manage=1`}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-xs font-medium transition-colors no-underline ${col.btn}`}
              >
                <FileText className="h-3.5 w-3.5" />
                Créer un devoir
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChapterSemanticColumns({
  sections,
  documents,
  canEdit,
  courseId,
  chapterId,
}: Props) {
  const sectionIds = sections.map((s) => s.id);
  const defaultSectionId = sectionIds[0] ?? null;

  // Fetch activities for ALL sections in parallel
  const queries = useQueries({
    queries: sectionIds.map((id) => ({
      queryKey: ['section-activities', id],
      queryFn: () => sectionActivitiesApi.list(id),
      enabled: !!id,
    })),
  });

  // Fetch practical works for ALL sections in parallel
  const tpQueries = useQueries({
    queries: sectionIds.map((id) => ({
      queryKey: ['section-practical-works', id],
      queryFn: () => practicalWorkApi.listForSection(id),
      enabled: !!id,
    })),
  });

  // Fetch published consolidation exercises for the chapter
  const exercisesQuery = useQuery({
    queryKey: ['chapter-exercises', chapterId, 'consolidation'],
    queryFn: () => chapterPipelineApi.listExercises(chapterId, 'consolidation'),
    enabled: !!chapterId,
    select: (data) => data.filter(e => e.status === 'published'),
  });

  const isLoading = queries.some((q) => q.isLoading) || tpQueries.some((q) => q.isLoading);
  const allActivities = queries.flatMap((q) => q.data ?? []);
  const allPracticalWorks = tpQueries.flatMap((q) => q.data ?? []);
  const publishedExercises = exercisesQuery.data ?? [];

  if (sectionIds.length === 0 && !canEdit) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-bolt-line p-16 text-center">
        <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Aucun contenu disponible pour ce chapitre.</p>
      </div>
    );
  }

  if (sectionIds.length === 0 && canEdit) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-bolt-line p-16 text-center">
        <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Ce chapitre n'a pas encore de sections. Ajoutez une section ci-dessous pour commencer à ajouter du contenu.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {COLUMNS.map((col, idx) => (
        <SemanticColumn
          key={col.id}
          col={col}
          sections={sections}
          allActivities={allActivities}
          documents={idx === 0 ? documents : undefined}
          practicalWorks={idx === 1 ? allPracticalWorks : undefined}
          publishedExercises={idx === 2 ? publishedExercises : undefined}
          canEdit={canEdit}
          courseId={courseId}
          chapterId={chapterId}
          defaultSectionId={defaultSectionId}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
