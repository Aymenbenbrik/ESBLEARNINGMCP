'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useChapter, useDeleteChapter, useGenerateSummary,
  useCreateSection, useDeleteSection, useUpdateSection,
  useReorderSections, useChapterDeadlines, useActivityProgress,
  useCreateSubSection,
} from '@/lib/hooks/useChapters';
import { useCourse } from '@/lib/hooks/useCourses';
import { useAuth } from '@/lib/hooks/useAuth';
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
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DocumentsList } from '@/components/chapters/DocumentsList';
import { ChapterSummary } from '@/components/chapters/ChapterSummary';
import { ChapterAAMatching } from '@/components/chapters/ChapterAAMatching';
import { DeleteChapterDialog } from '@/components/chapters/DeleteChapterDialog';
import { ChapterReferences } from '@/components/chapters/ChapterReferences';
import { ChapterPresentation } from '@/components/chapters/ChapterPresentation';
import { SectionContentPanel } from '@/components/chapters/SectionContentPanel';
import { SectionActivities } from '@/components/chapters/SectionActivities';
import { ChapterSemanticColumns } from '@/components/chapters/ChapterSemanticColumns';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText, MessageSquare, ClipboardList, Users,
  BookOpen, Pencil, Trash2, Plus, Check, X, GripVertical,
  CheckCircle2, ChevronDown, Upload, Sparkles, Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { practicalWorkApi } from '@/lib/api/practicalWork';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Bot } from 'lucide-react';

export default function ChapterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = parseInt(params.chapterId as string);
  const courseId = parseInt(params.id as string);
  const { data, isLoading, error } = useChapter(chapterId);
  const { data: courseData } = useCourse(courseId);
  const { data: deadlinesData } = useChapterDeadlines(chapterId);
  const { data: progressData } = useActivityProgress(chapterId);
  const { user } = useAuth();
  const deleteMutation = useDeleteChapter();
  const generateSummaryMutation = useGenerateSummary();
  const createSectionMutation = useCreateSection(chapterId);
  const deleteSectionMutation = useDeleteSection(chapterId);
  const updateSectionMutation = useUpdateSection(chapterId);
  const reorderSectionsMutation = useReorderSections(chapterId);
  const [sectionOrder, setSectionOrder] = useState<number[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showExtras, setShowExtras] = useState(false);

  // Section management state
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addingSubSectionFor, setAddingSubSectionFor] = useState<number | null>(null);
  const [newSubSectionTitle, setNewSubSectionTitle] = useState('');
  const createSubSectionMutation = useCreateSubSection(chapterId);

  // AI detect TP state
  const [showDetectTpModal, setShowDetectTpModal] = useState(false);
  const [detectTpLanguage, setDetectTpLanguage] = useState('Python');
  const [detectTpLoading, setDetectTpLoading] = useState(false);
  const [detectTpSuggestions, setDetectTpSuggestions] = useState<Array<{title: string; description: string; type: string; estimated_duration: string}>>([]);

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

  const handleDelete = () => {
    deleteMutation.mutate(chapterId, {
      onSuccess: () => router.push(`/courses/${courseId}`),
    });
  };

  const handleGenerateSummary = () => generateSummaryMutation.mutate({ id: chapterId });
  const handleRegenerateSummary = () => generateSummaryMutation.mutate({ id: chapterId, force: true });

  const handleAddSection = () => {
    if (!newSectionTitle.trim()) return;
    createSectionMutation.mutate(newSectionTitle.trim(), {
      onSuccess: () => { setNewSectionTitle(''); setAddingSection(false); },
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

  const handleAddSubSection = (parentSectionId: number) => {
    if (!newSubSectionTitle.trim()) return;
    createSubSectionMutation.mutate(
      { parentSectionId, title: newSubSectionTitle.trim() },
      { onSuccess: () => { setNewSubSectionTitle(''); setAddingSubSectionFor(null); } }
    );
  };

  const handleDetectTp = async () => {
    setDetectTpLoading(true);
    try {
      const result = await practicalWorkApi.detectTpOpportunities(chapterId, detectTpLanguage);
      setDetectTpSuggestions(result.suggestions || []);
    } catch {
      // toast not available here without import, use console
    } finally {
      setDetectTpLoading(false);
    }
  };

  // Compute progress from deadlines
  const deadlines = deadlinesData?.deadlines ?? [];
  const completedCount = deadlines.filter(d => d.completed).length;
  const progress = deadlines.length > 0 ? Math.round((completedCount / deadlines.length) * 100) : 0;

  const courseChapters = courseData?.chapters ?? [];

  if (isLoading) {
    return (
      <div className="-mx-[18px] -mb-10 flex h-[calc(100vh-74px)]">
        <div className="w-72 bg-white border-r border-bolt-line p-5 space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
        <div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid grid-cols-3 gap-5">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-20">
        <EmptyState
          title="Chapitre introuvable"
          description="Ce chapitre n'existe pas ou vous n'y avez pas accès."
          icon={<FileText className="h-12 w-12" />}
        />
      </div>
    );
  }

  const { chapter, course, documents, tn_chapter } = data;
  const isTeacher = !!(chapter.can_edit);

  return (
    <>
      {/* Full-bleed layout — escapes AppShell's centered container */}
      <div className="-mx-[18px] -mb-10 flex h-[calc(100vh-74px)]">

        {/* ── LEFT SIDEBAR: Chapter Navigation ─────────────────────── */}
        <aside className="w-72 shrink-0 bg-white border-r border-bolt-line overflow-y-auto flex flex-col">
          <div className="p-5 border-b border-bolt-line">
            <Link
              href={`/courses/${courseId}`}
              className="text-xs font-semibold text-bolt-muted uppercase tracking-wider hover:text-bolt-accent transition-colors no-underline"
            >
              ← {course.title}
            </Link>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {courseChapters.length > 0 ? (
              courseChapters.map((ch: any) => {
                const isActive = ch.id === chapterId;
                return (
                  <Link
                    key={ch.id}
                    href={`/courses/${courseId}/chapters/${ch.id}`}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl no-underline transition-colors group border-l-4 ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-transparent hover:bg-gray-50 text-bolt-ink'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug line-clamp-2 ${isActive ? 'text-blue-700' : 'text-bolt-ink'}`}>
                        {ch.title}
                      </p>
                      {isActive && (
                        <span className="text-xs text-blue-500 font-medium">Active</span>
                      )}
                    </div>
                    <CheckCircle2
                      className={`h-4 w-4 shrink-0 ${ch.has_summary ? 'text-green-500' : 'text-gray-300'}`}
                    />
                  </Link>
                );
              })
            ) : (
              // Fallback: show current chapter if course chapters not loaded yet
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl border-l-4 border-blue-500 bg-blue-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-700 leading-snug">{chapter.title}</p>
                  <span className="text-xs text-blue-500 font-medium">Active</span>
                </div>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-gray-300" />
              </div>
            )}
          </nav>

          {/* Teacher tools at bottom of sidebar */}
          {isTeacher && (
            <div className="p-3 border-t border-bolt-line space-y-1">
              <Link
                href={`/courses/${courseId}/chapters/${chapterId}/edit`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-bolt-muted hover:bg-gray-50 hover:text-bolt-ink transition-colors no-underline"
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifier le chapitre
              </Link>
              <Link
                href={`/courses/${courseId}/chapters/${chapterId}/documents/new`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-bolt-muted hover:bg-gray-50 hover:text-bolt-ink transition-colors no-underline"
              >
                <Upload className="h-3.5 w-3.5" />
                Uploader un document
              </Link>
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer le chapitre
              </button>
            </div>
          )}
        </aside>

        {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-slate-50">

          {/* Chapter Header */}
          <div className="bg-white border-b border-bolt-line px-8 py-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h1 className="text-2xl font-bold text-bolt-ink leading-tight">
                Chapitre {chapter.order} : {chapter.title}
              </h1>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-blue-600 font-semibold text-sm whitespace-nowrap">
                  {progress}% Complete
                </span>
                {/* Action buttons */}
                {user && (
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" className="rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs px-3">
                      <Link href={`/courses/${courseId}/chapters/${chapterId}/quiz/setup`}>
                        <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                        Quiz
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="rounded-full text-xs px-3 border-bolt-line">
                      <Link href={`/courses/${courseId}/chapters/${chapterId}/chat`}>
                        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                        Chatbot
                      </Link>
                    </Button>
                    {isTeacher && (
                      <Button asChild size="sm" variant="outline" className="rounded-full text-xs px-3 border-bolt-line">
                        <Link href={`/courses/${courseId}/chapters/${chapterId}/quiz/submissions`}>
                          <Users className="mr-1.5 h-3.5 w-3.5" />
                          Soumissions
                        </Link>
                      </Button>
                    )}
                    {isTeacher && !chapter.has_summary && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-xs px-3 border-bolt-line"
                        onClick={handleGenerateSummary}
                        disabled={generateSummaryMutation.isPending}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        {generateSummaryMutation.isPending ? 'Génération...' : 'Résumé IA'}
                      </Button>
                    )}
                    {isTeacher && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-xs px-3 border-bolt-line"
                        onClick={() => { setShowDetectTpModal(true); setDetectTpSuggestions([]); }}
                      >
                        <Bot className="mr-1.5 h-3.5 w-3.5" />
                        Détecter des TPs
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-2 mb-5">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Chapter presentation (description + objectives) */}
            <ChapterPresentation
              chapterId={chapterId}
              description={(chapter as any).description ?? null}
              objectives={(chapter as any).objectives ?? null}
              validated={(chapter as any).description_validated ?? false}
              canEdit={chapter.can_edit}
            />
          </div>

          {/* ── 3 Semantic Columns ─────────────────────────────────── */}
          <div className="p-6 space-y-6">
            <ChapterSemanticColumns
              sections={tn_chapter?.sections ?? []}
              documents={documents}
              canEdit={isTeacher}
              courseId={courseId}
              chapterId={chapterId}
            />

            {/* ── Extras: Sections management (teacher), Documents, AA, Summary, Refs ── */}
            <div className="rounded-2xl border border-bolt-line bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => setShowExtras(o => !o)}
                className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-bolt-ink hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Ressources &amp; Gestion avancée
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showExtras ? 'rotate-180' : ''}`} />
              </button>
              {showExtras && (
                <div className="border-t border-bolt-line p-6 space-y-8">
                  {/* Documents upload */}
                  <DocumentsList documents={documents} chapterId={chapterId} canEdit={chapter.can_edit} />

                  {/* Teacher: section management panel */}
                  {isTeacher && tn_chapter && (
                    <div>
                      <h4 className="text-sm font-semibold text-bolt-ink mb-3 flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        Gestion des Sections Pédagogiques
                      </h4>
                      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleSectionDragEnd}>
                        <SortableContext items={sectionOrder} strategy={horizontalListSortingStrategy}>
                          <div className="space-y-3">
                            {sectionOrder.map((sId) => {
                              const section = tn_chapter.sections.find((s: any) => s.id === sId);
                              if (!section) return null;
                              return (
                                <SortableSection key={section.id} section={section} canEdit={isTeacher}>
                                  <div className="rounded-xl border border-bolt-line bg-white">
                                    <div className="flex items-center gap-2 px-4 py-3 border-b border-bolt-line/50">
                                      {editingSectionId === section.id ? (
                                        <div className="flex items-center gap-2 flex-1">
                                          <Input
                                            value={editTitle}
                                            onChange={e => setEditTitle(e.target.value)}
                                            className="h-7 rounded-[8px] text-sm flex-1 bg-white"
                                            autoFocus
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') handleSaveEdit(section.id);
                                              if (e.key === 'Escape') setEditingSectionId(null);
                                            }}
                                          />
                                          <button onClick={() => handleSaveEdit(section.id)} className="rounded-full p-1 text-green-600 hover:bg-green-50">
                                            <Check className="h-3.5 w-3.5" />
                                          </button>
                                          <button onClick={() => setEditingSectionId(null)} className="rounded-full p-1 text-muted-foreground hover:bg-gray-100">
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="text-xs text-muted-foreground font-medium shrink-0">Section {section.index}</span>
                                          <Link
                                            href={`/courses/${courseId}/chapters/${chapterId}/sections/${section.id}`}
                                            className="font-semibold text-sm text-bolt-ink flex-1 truncate no-underline hover:text-blue-600 transition-colors"
                                          >
                                            {section.title}
                                          </Link>
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            <button onClick={() => handleStartEdit(section.id, section.title)} className="rounded-full p-1.5 text-muted-foreground hover:text-bolt-ink hover:bg-gray-100 transition-colors">
                                              <Pencil className="h-3 w-3" />
                                            </button>
                                            <button onClick={() => handleDeleteSection(section.id)} className="rounded-full p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors" disabled={deletingId === section.id}>
                                              <Trash2 className="h-3 w-3" />
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    <div className="px-4 py-3 space-y-2">
                                      <SectionContentPanel sectionId={section.id} canEdit={chapter.can_edit} />
                                      <SectionActivities sectionId={section.id} canEdit={chapter.can_edit} allSections={tn_chapter?.sections ?? []} />
                                      {isTeacher && (
                                        addingSubSectionFor === section.id ? (
                                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-bolt-line/50">
                                            <Input
                                              placeholder="Titre de la sous-section"
                                              value={newSubSectionTitle}
                                              onChange={e => setNewSubSectionTitle(e.target.value)}
                                              className="h-7 rounded-[8px] text-sm flex-1"
                                              autoFocus
                                              onKeyDown={e => {
                                                if (e.key === 'Enter') handleAddSubSection(section.id);
                                                if (e.key === 'Escape') { setAddingSubSectionFor(null); setNewSubSectionTitle(''); }
                                              }}
                                            />
                                            <Button size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => handleAddSubSection(section.id)} disabled={createSubSectionMutation.isPending || !newSubSectionTitle.trim()}>
                                              Ajouter
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={() => { setAddingSubSectionFor(null); setNewSubSectionTitle(''); }}>
                                              Annuler
                                            </Button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => setAddingSubSectionFor(section.id)}
                                            className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-bolt-ink transition-colors"
                                          >
                                            <Plus className="h-3 w-3" />
                                            Ajouter une sous-section
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                </SortableSection>
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>

                      {/* Add section button */}
                      <div className="mt-3">
                        {addingSection ? (
                          <div className="flex items-center gap-2 bg-white rounded-xl border border-bolt-line p-3">
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
                            <Button size="sm" className="h-8 rounded-full px-4 text-xs" onClick={handleAddSection} disabled={createSectionMutation.isPending || !newSectionTitle.trim()}>
                              {createSectionMutation.isPending ? 'Ajout...' : 'Ajouter'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 rounded-full px-3 text-xs" onClick={() => { setAddingSection(false); setNewSectionTitle(''); }}>
                              Annuler
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingSection(true)}
                            className="flex items-center gap-2 rounded-xl border-2 border-dashed border-bolt-line px-4 py-2.5 text-sm text-muted-foreground hover:text-bolt-ink hover:border-bolt-ink transition-colors w-full justify-center"
                          >
                            <Plus className="h-4 w-4" />
                            Ajouter une section
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <ChapterAAMatching chapterId={chapterId} canEdit={chapter.can_edit} />
                  <ChapterSummary
                    summary={chapter.summary}
                    canGenerate={chapter.can_edit}
                    onGenerate={handleGenerateSummary}
                    onRegenerate={handleRegenerateSummary}
                    isGenerating={generateSummaryMutation.isPending}
                  />
                  <ChapterReferences courseId={courseId} chapterId={chapterId} canEdit={chapter.can_edit} />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <DeleteChapterDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        chapterId={chapterId}
        chapterName={chapter.title}
        onDelete={handleDelete}
      />

      {/* AI Detect TP Modal */}
      <Dialog open={showDetectTpModal} onOpenChange={setShowDetectTpModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-violet-600" />
              Détecter des TPs par IA
            </DialogTitle>
            <DialogDescription>
              L&apos;IA analyse le contenu du chapitre et propose des travaux pratiques pertinents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-bolt-ink whitespace-nowrap">Langage :</label>
              <Select value={detectTpLanguage} onValueChange={setDetectTpLanguage}>
                <SelectTrigger className="w-40 h-9 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Python', 'SQL', 'R', 'Java', 'C', 'C++'].map(lang => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleDetectTp}
                disabled={detectTpLoading}
                className="rounded-full px-4 h-9 text-sm bg-violet-600 hover:bg-violet-700 text-white"
              >
                {detectTpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Bot className="h-4 w-4 mr-1.5" />}
                {detectTpLoading ? 'Analyse...' : 'Analyser'}
              </Button>
            </div>

            {detectTpSuggestions.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-bolt-ink">{detectTpSuggestions.length} TP{detectTpSuggestions.length > 1 ? 's' : ''} suggéré{detectTpSuggestions.length > 1 ? 's' : ''}</p>
                {detectTpSuggestions.map((s, i) => (
                  <div key={i} className="rounded-xl border border-bolt-line bg-white p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm text-bolt-ink">{s.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{s.type}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">⏱ {s.estimated_duration}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 rounded-full text-xs border-violet-300 text-violet-700 hover:bg-violet-50"
                        onClick={() => {
                          const params = new URLSearchParams({ title: s.title, description: s.description });
                          router.push(`/courses/${courseId}/chapters/${chapterId}/tp/create?${params.toString()}`);
                          setShowDetectTpModal(false);
                        }}
                      >
                        Créer ce TP
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!detectTpLoading && detectTpSuggestions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Cliquez sur &quot;Analyser&quot; pour détecter des TPs basés sur le contenu du chapitre.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
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
    <div ref={setNodeRef} style={style} className="relative flex flex-col">
      {canEdit && (
        <button
          {...attributes}
          {...listeners}
          className="absolute top-3 right-10 z-10 cursor-grab p-1 text-muted-foreground hover:text-bolt-ink"
          title="Glisser pour réordonner"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </div>
  );
}
