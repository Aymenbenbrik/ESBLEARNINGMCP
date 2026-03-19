'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useChapter, useDeleteChapter, useGenerateSummary,
  useCreateSection, useDeleteSection, useUpdateSection,
} from '@/lib/hooks/useChapters';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  useReorderSections,
} from '@/lib/hooks/useChapters';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChapterHeader } from '@/components/chapters/ChapterHeader';
import { DocumentsList } from '@/components/chapters/DocumentsList';
import { ChapterSummary } from '@/components/chapters/ChapterSummary';
import { ChapterAAMatching } from '@/components/chapters/ChapterAAMatching';
import { DeleteChapterDialog } from '@/components/chapters/DeleteChapterDialog';
import { ChapterReferences } from '@/components/chapters/ChapterReferences';
import { ChapterPresentation } from '@/components/chapters/ChapterPresentation';
import { SectionContentPanel } from '@/components/chapters/SectionContentPanel';
import { SectionActivities } from '@/components/chapters/SectionActivities';
import { ChapterRightSidebar } from '@/components/chapters/ChapterRightSidebar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText, MessageSquare, ClipboardList, Users,
  ChevronRight, BookOpen,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Pencil, Trash2, Plus, Check, X, GripVertical,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ChapterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = parseInt(params.chapterId as string);
  const courseId = parseInt(params.id as string);
  const { data, isLoading, error } = useChapter(chapterId);
  const { user } = useAuth();
  const deleteMutation = useDeleteChapter();
  const generateSummaryMutation = useGenerateSummary();
  const createSectionMutation = useCreateSection(chapterId);
  const deleteSectionMutation = useDeleteSection(chapterId);
  const updateSectionMutation = useUpdateSection(chapterId);
  const reorderSectionsMutation = useReorderSections(chapterId);
  const [sectionOrder, setSectionOrder] = useState<number[]>([]);

  useEffect(() => {
    if (data?.tn_chapter?.sections) {
      setSectionOrder(data.tn_chapter.sections.map((s: any) => s.id));
    }
  }, [data?.tn_chapter?.sections]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sectionOrder.indexOf(active.id as number);
    const newIndex = sectionOrder.indexOf(over.id as number);
    const newOrder = arrayMove(sectionOrder, oldIndex, newIndex);
    setSectionOrder(newOrder);
    reorderSectionsMutation.mutate(newOrder);
  }

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Section management state
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = () => {
    deleteMutation.mutate(chapterId, {
      onSuccess: () => {
        router.push(`/courses/${courseId}`);
      },
    });
  };

  const handleGenerateSummary = () => {
    generateSummaryMutation.mutate({ id: chapterId });
  };

  const handleRegenerateSummary = () => {
    generateSummaryMutation.mutate({ id: chapterId, force: true });
  };

  const handleAddSection = () => {
    if (!newSectionTitle.trim()) return;
    createSectionMutation.mutate(newSectionTitle.trim(), {
      onSuccess: () => {
        setNewSectionTitle('');
        setAddingSection(false);
      },
    });
  };

  const handleStartEdit = (sectionId: number, currentTitle: string) => {
    setEditingSectionId(sectionId);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = (sectionId: number) => {
    if (!editTitle.trim()) return;
    updateSectionMutation.mutate(
      { sectionId, data: { title: editTitle.trim() } },
      { onSuccess: () => setEditingSectionId(null) }
    );
  };

  const handleDeleteSection = (sectionId: number) => {
    setDeletingId(sectionId);
    deleteSectionMutation.mutate(sectionId, {
      onSuccess: () => setDeletingId(null),
      onError: () => setDeletingId(null),
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Chapter not found"
          description="The chapter you're looking for doesn't exist or you don't have access to it."
          icon={<FileText className="h-12 w-12" />}
        />
      </div>
    );
  }

  const { chapter, course, documents, tn_chapter } = data;
  const isTeacher = !!(chapter.can_edit);

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: 'Courses', href: '/courses' },
            { label: course.title, href: `/courses/${courseId}` },
            { label: chapter.title },
          ]}
        />

        <ChapterHeader
          chapter={chapter}
          course={course}
          onDelete={chapter.can_edit ? () => setShowDeleteDialog(true) : undefined}
          onGenerateSummary={chapter.can_edit ? handleGenerateSummary : undefined}
          isGeneratingSummary={generateSummaryMutation.isPending}
        />

        {user && (
          <div className="mb-6 flex flex-wrap gap-3">
            <Button asChild variant="default" size="lg" className="rounded-2xl">
              <Link href={`/courses/${courseId}/chapters/${chapterId}/quiz/setup`}>
                <ClipboardList className="mr-2 h-5 w-5" />
                Quiz
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="rounded-2xl">
              <Link href={`/courses/${courseId}/chapters/${chapterId}/chat`}>
                <MessageSquare className="mr-2 h-5 w-5" />
                Chatbot
              </Link>
            </Button>
            {(user?.is_teacher || user?.is_superuser) && (
              <Button asChild variant="outline" size="lg" className="rounded-2xl">
                <Link href={`/courses/${courseId}/chapters/${chapterId}/quiz/submissions`}>
                  <Users className="mr-2 h-5 w-5" />
                  Quiz Submissions
                </Link>
              </Button>
            )}
          </div>
        )}

        {/* ── TOP: AA Matching + Présentation (full width) ─────────── */}
        <div className="mb-6 space-y-5">
          <ChapterAAMatching chapterId={chapterId} canEdit={chapter.can_edit} />
          <ChapterPresentation
            chapterId={chapterId}
            description={(chapter as any).description ?? null}
            objectives={(chapter as any).objectives ?? null}
            validated={(chapter as any).description_validated ?? false}
            canEdit={chapter.can_edit}
          />
        </div>

        {/* ── MAIN: collapsible sidebars + center ───────────────────── */}
        <div className="flex gap-4 items-start">

          {/* ── LEFT SIDEBAR: Documents ─────────────────────────────── */}
          <div className={`shrink-0 transition-all duration-300 ${leftOpen ? 'w-64' : 'w-10'}`}>
            <button
              onClick={() => setLeftOpen(o => !o)}
              className="mb-3 flex items-center gap-1.5 rounded-full border border-bolt-line bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm hover:text-bolt-ink transition-colors"
              title={leftOpen ? 'Masquer les documents' : 'Afficher les documents'}
            >
              {leftOpen
                ? <><PanelLeftClose className="h-3.5 w-3.5" /><span>Documents</span></>
                : <PanelLeftOpen className="h-4 w-4" />}
            </button>

            {leftOpen && (
              <div className="space-y-4 overflow-hidden">
                <DocumentsList documents={documents} chapterId={chapterId} canEdit={chapter.can_edit} />
              </div>
            )}
          </div>

          {/* ── CENTER: Sections + Summary + References ──────────────── */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Sections */}
            <Card className="rounded-[24px] border-bolt-line shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Sections du chapitre</CardTitle>
              </CardHeader>
              <CardContent>
                {tn_chapter && tn_chapter.sections.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragEnd={handleSectionDragEnd}
                  >
                  <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {sectionOrder.map((sId) => {
                      const section = tn_chapter.sections.find((s: any) => s.id === sId);
                      if (!section) return null;
                      return (
                      <SortableSection key={section.id} section={section} canEdit={isTeacher}>
                      <details
                        className="group rounded-[20px] border border-bolt-line bg-white open:shadow-sm w-full"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {editingSectionId === section.id ? (
                              <div className="flex items-center gap-2 flex-1" onClick={e => e.preventDefault()}>
                                <Input
                                  value={editTitle}
                                  onChange={e => setEditTitle(e.target.value)}
                                  className="h-7 rounded-[8px] text-sm flex-1"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveEdit(section.id);
                                    if (e.key === 'Escape') setEditingSectionId(null);
                                  }}
                                />
                                <button
                                  onClick={() => handleSaveEdit(section.id)}
                                  className="rounded-full p-1 text-green-600 hover:bg-green-50"
                                  disabled={updateSectionMutation.isPending}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingSectionId(null)}
                                  className="rounded-full p-1 text-muted-foreground hover:bg-gray-100"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <p className="font-semibold text-sm truncate">
                                Section {section.index} — {section.title}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isTeacher && editingSectionId !== section.id && (
                              <>
                                <button
                                  onClick={e => { e.preventDefault(); handleStartEdit(section.id, section.title); }}
                                  className="rounded-full p-1 text-muted-foreground hover:text-bolt-ink hover:bg-gray-100 transition-colors"
                                  title="Modifier le titre"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={e => { e.preventDefault(); handleDeleteSection(section.id); }}
                                  className="rounded-full p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Supprimer la section"
                                  disabled={deletingId === section.id}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                          </div>
                        </summary>
                        <div className="border-t border-bolt-line px-4 pb-4 pt-4 space-y-4">
                          <SectionContentPanel sectionId={section.id} canEdit={chapter.can_edit} />
                          <SectionActivities sectionId={section.id} canEdit={chapter.can_edit} allSections={tn_chapter?.sections ?? []} />
                        </div>
                      </details>
                      </SortableSection>
                      );
                    })}
                  </div>
                  </SortableContext>
                  </DndContext>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-bolt-line p-8 text-center text-sm text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                    Aucune section disponible pour ce chapitre.
                  </div>
                )}

                {/* Add section — teacher only */}
                {isTeacher && (
                  <div className="mt-4">
                    {addingSection ? (
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Titre de la nouvelle section"
                          value={newSectionTitle}
                          onChange={e => setNewSectionTitle(e.target.value)}
                          className="h-8 rounded-[10px] text-sm flex-1"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddSection();
                            if (e.key === 'Escape') { setAddingSection(false); setNewSectionTitle(''); }
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-8 rounded-full px-4 text-xs"
                          onClick={handleAddSection}
                          disabled={createSectionMutation.isPending || !newSectionTitle.trim()}
                        >
                          {createSectionMutation.isPending ? 'Ajout...' : 'Ajouter'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => { setAddingSection(false); setNewSectionTitle(''); }}
                        >
                          Annuler
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingSection(true)}
                        className="flex items-center gap-1.5 rounded-full border border-dashed border-bolt-line px-4 py-2 text-xs text-muted-foreground hover:text-bolt-ink hover:border-bolt-ink transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Ajouter une section
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary */}
            <ChapterSummary
              summary={chapter.summary}
              canGenerate={chapter.can_edit}
              onGenerate={handleGenerateSummary}
              onRegenerate={handleRegenerateSummary}
              isGenerating={generateSummaryMutation.isPending}
            />

            {/* References */}
            <ChapterReferences courseId={courseId} chapterId={chapterId} canEdit={chapter.can_edit} />
          </div>

          {/* ── RIGHT SIDEBAR: Deadlines + Progress ──────────────────── */}
          <div className={`shrink-0 transition-all duration-300 ${rightOpen ? 'w-72' : 'w-10'}`}>
            <button
              onClick={() => setRightOpen(o => !o)}
              className="mb-3 flex items-center gap-1.5 rounded-full border border-bolt-line bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm hover:text-bolt-ink transition-colors"
              title={rightOpen ? 'Masquer le tableau de bord' : 'Afficher le tableau de bord'}
            >
              {rightOpen
                ? <><span>Tableau de bord</span><PanelRightClose className="h-3.5 w-3.5" /></>
                : <PanelRightOpen className="h-4 w-4" />}
            </button>

            {rightOpen && (
              <div className="overflow-hidden">
                <ChapterRightSidebar chapterId={chapterId} />
              </div>
            )}
          </div>
        </div>
      </div>

      <DeleteChapterDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        chapterId={chapterId}
        chapterName={chapter.title}
        onDelete={handleDelete}
      />
    </>
  );
}

function SortableSection({
  section,
  children,
  canEdit,
}: {
  section: any;
  children: React.ReactNode;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      {canEdit && (
        <button
          {...attributes}
          {...listeners}
          className="mt-4 cursor-grab p-1 text-muted-foreground hover:text-bolt-ink shrink-0"
          title="Glisser pour reordonner"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
