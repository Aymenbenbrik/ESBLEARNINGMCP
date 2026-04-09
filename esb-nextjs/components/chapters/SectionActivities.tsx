'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  useSectionActivities,
  useAddYoutubeActivity,
  useAddImageActivity,
  useAddTextDocActivity,
  useDeleteActivity,
  useSectionQuiz,
  useUpdateQuizQuestion,
  usePublishSectionQuiz,
  useDeleteSectionQuiz,
  useTakeQuiz,
  useSubmitSectionQuiz,
  useUpdateQuizConfig,
  useQuizBankStats,
  useCreateQuizFromBank,
  useQuizResult,
  useGradeSubmission,
  useAssignment,
  useSurveyJson,
} from '@/lib/hooks/useReferences';

const SurveyQuizBuilder = dynamic(() => import('./SurveyQuizBuilder'), { ssr: false });
const SurveyQuizPlayer = dynamic(() => import('./SurveyQuizPlayer'), { ssr: false });
import { SectionActivity, SectionQuiz, SectionQuizQuestion, SectionQuizSubmissionDetailed, GradedAnswer, SubmitQuizResponse } from '@/lib/types/references';
import { useStartExercise, useSubmitExercise } from '@/lib/hooks/useQuestionBank';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Youtube,
  ClipboardList,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Filter,
  GraduationCap,
  BarChart3,
  Layers,
  Database,
  Star,
  FileText,
  Lock,
  X,
  AlertTriangle,
  Clock,
  Settings,
  Image,
  FileCode2,
  GripVertical,
  ArrowRightLeft,
  Eye,
  Dumbbell,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useReorderActivities, useMoveActivity } from '@/lib/hooks/useChapters';
import { SectionAssignmentManager } from './SectionAssignmentManager';
import { SectionAssignmentTaker } from './SectionAssignmentTaker';

interface SectionActivitiesProps {
  sectionId: number;
  canEdit: boolean;
  allSections?: Array<{ id: number; title: string; index: number | string }>;
}

// Helper to ensure activity IDs are numbers
function numId(id: number | string): number {
  return typeof id === 'string' ? parseInt(id, 10) : id;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSCRIPT_STATUS = {
  indexing: { label: '⏳ Analyse en cours (transcript + visuel)...', className: 'bg-yellow-100 text-yellow-700' },
  indexed:  { label: '✓ Disponible dans le chatbot (transcript + visuel)', className: 'bg-emerald-100 text-emerald-700' },
  failed:   { label: '✗ Analyse indisponible (vidéo sans sous-titres publics)', className: 'bg-red-100 text-red-600' },
} as const;

const BLOOM_CONFIG: Record<string, { label: string; className: string }> = {
  remember:   { label: 'Mémorisation',    className: 'bg-sky-100 text-sky-700' },
  understand: { label: 'Compréhension',   className: 'bg-indigo-100 text-indigo-700' },
  apply:      { label: 'Application',     className: 'bg-violet-100 text-violet-700' },
  analyze:    { label: 'Analyse',         className: 'bg-amber-100 text-amber-700' },
  evaluate:   { label: 'Évaluation',      className: 'bg-orange-100 text-orange-700' },
  create:     { label: 'Création',        className: 'bg-rose-100 text-rose-700' },
};

const DIFFICULTY_CONFIG: Record<string, { label: string; className: string }> = {
  easy:   { label: 'Facile',  className: 'bg-emerald-100 text-emerald-700' },
  medium: { label: 'Moyen',   className: 'bg-yellow-100 text-yellow-700' },
  hard:   { label: 'Difficile', className: 'bg-red-100 text-red-700' },
};

const CHOICE_LABELS = { a: 'A', b: 'B', c: 'C', d: 'D' } as const;

// ─── YouTube Embed ─────────────────────────────────────────────────────────────

function YoutubeEmbed({ embedId, title, transcriptStatus }: { embedId: string; title: string; transcriptStatus?: string | null }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-bolt-line">
      <iframe
        src={`https://www.youtube.com/embed/${embedId}`}
        title={title}
        className="aspect-video w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="text-xs text-muted-foreground">{title}</p>
        {transcriptStatus && TRANSCRIPT_STATUS[transcriptStatus as keyof typeof TRANSCRIPT_STATUS] && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TRANSCRIPT_STATUS[transcriptStatus as keyof typeof TRANSCRIPT_STATUS].className}`}>
            {TRANSCRIPT_STATUS[transcriptStatus as keyof typeof TRANSCRIPT_STATUS].label}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Add YouTube Form ─────────────────────────────────────────────────────────

function AddYoutubeForm({ sectionId, onClose }: { sectionId: number; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const mutation = useAddYoutubeActivity(sectionId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    mutation.mutate({ url: url.trim(), title: title.trim() || undefined }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <Input
        placeholder="URL YouTube (ex: https://youtu.be/xxx)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="rounded-[10px] text-sm"
        required
      />
      <Input
        placeholder="Titre (optionnel)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-[10px] text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="rounded-full text-xs" disabled={mutation.isPending}>
          {mutation.isPending ? 'Ajout...' : 'Ajouter'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full text-xs" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ─── Question Tags ────────────────────────────────────────────────────────────

function QuestionTags({ question }: { question: SectionQuizQuestion }) {
  const bloom = question.bloom_level ? BLOOM_CONFIG[question.bloom_level] : null;
  const diff = question.difficulty ? DIFFICULTY_CONFIG[question.difficulty] : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {question.aa_code && (
        <span className="flex items-center gap-1 rounded-full bg-bolt-accent/10 px-2 py-0.5 text-[10px] font-semibold text-bolt-accent">
          <GraduationCap className="h-2.5 w-2.5" />
          {question.aa_code}
        </span>
      )}
      {bloom && (
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${bloom.className}`}>
          <Layers className="h-2.5 w-2.5" />
          {bloom.label}
        </span>
      )}
      {diff && (
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${diff.className}`}>
          <BarChart3 className="h-2.5 w-2.5" />
          {diff.label}
        </span>
      )}
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
        {question.points} pt{question.points > 1 ? 's' : ''}
      </span>
    </div>
  );
}

// ─── Quiz Question Card (Teacher) ─────────────────────────────────────────────

function QuizQuestionCard({ question, sectionId }: { question: SectionQuizQuestion; sectionId: number }) {
  const updateMutation = useUpdateQuizQuestion(sectionId);
  const [expanded, setExpanded] = useState(false);
  const [editingPoints, setEditingPoints] = useState(false);
  const [localPoints, setLocalPoints] = useState(question.points ?? 1);
  const isPending = question.status === 'pending';
  const isApproved = question.status === 'approved';
  const isRejected = question.status === 'rejected';

  const statusBorder = isApproved
    ? 'border-emerald-200 bg-emerald-50/60'
    : isRejected
    ? 'border-red-200 bg-red-50/60 opacity-60'
    : 'border-yellow-200 bg-yellow-50/60';

  return (
    <div className={`rounded-[12px] border p-3 transition-all ${statusBorder}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${isApproved ? 'bg-emerald-400' : isRejected ? 'bg-red-400' : 'bg-yellow-400'}`} />
            <p className="text-sm font-medium leading-snug">{question.question_text}</p>
          </div>
          <div className="mt-1.5 pl-4 flex items-center gap-3 flex-wrap">
            <QuestionTags question={question} />
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-500" />
              {editingPoints ? (
                <input
                  type="number" min={0.25} max={20} step={0.25}
                  value={localPoints}
                  onChange={(e) => setLocalPoints(Number(e.target.value))}
                  onBlur={() => {
                    setEditingPoints(false);
                    if (localPoints !== question.points) {
                      updateMutation.mutate({ questionId: question.id, data: { points: localPoints } });
                    }
                  }}
                  className="w-14 h-5 rounded border border-bolt-line px-1 text-xs text-center"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingPoints(true)}
                  className="text-[11px] font-semibold text-amber-600 hover:underline"
                >
                  {(question.points ?? 1).toFixed(1)} pt{(question.points ?? 1) > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 shrink-0 rounded-full p-0"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 ml-4 space-y-1.5">
          {(['a', 'b', 'c', 'd'] as const).map((k) => {
            const text = question[`choice_${k}` as keyof SectionQuizQuestion] as string;
            if (!text) return null;
            const isCorrect = question.correct_choice === k;
            return (
              <div
                key={k}
                className={`flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm ${
                  isCorrect ? 'bg-emerald-100 font-semibold text-emerald-800' : 'bg-white/80'
                }`}
              >
                <span className={`w-5 shrink-0 font-bold text-xs ${isCorrect ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                  {CHOICE_LABELS[k]}.
                </span>
                <span>{text}</span>
                {isCorrect && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600" />}
              </div>
            );
          })}
          {question.explanation && (
            <p className="mt-1 rounded-[8px] bg-white/70 px-2.5 py-1.5 text-xs text-muted-foreground">
              💡 {question.explanation}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
        {!isApproved && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-full border-emerald-400 px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-50"
            onClick={() => updateMutation.mutate({ questionId: question.id, data: { status: 'approved' } })}
            disabled={updateMutation.isPending}
          >
            <CheckCircle2 className="mr-1 h-3 w-3" /> Approuver
          </Button>
        )}
        {!isRejected && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-full border-red-400 px-2.5 text-[11px] text-red-600 hover:bg-red-50"
            onClick={() => updateMutation.mutate({ questionId: question.id, data: { status: 'rejected' } })}
            disabled={updateMutation.isPending}
          >
            <XCircle className="mr-1 h-3 w-3" /> Rejeter
          </Button>
        )}
        {!isPending && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 rounded-full px-2.5 text-[11px] text-muted-foreground"
            onClick={() => updateMutation.mutate({ questionId: question.id, data: { status: 'pending' } })}
          >
            Remettre en attente
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Quiz Stats Bar ───────────────────────────────────────────────────────────

function QuizStatsBar({ questions }: { questions: SectionQuizQuestion[] }) {
  const total = questions.length;
  if (!total) return null;

  const approved = questions.filter((q) => q.status === 'approved').length;
  const pending = questions.filter((q) => q.status === 'pending').length;

  // Bloom distribution
  const bloomCounts = questions.reduce<Record<string, number>>((acc, q) => {
    if (q.bloom_level) acc[q.bloom_level] = (acc[q.bloom_level] || 0) + 1;
    return acc;
  }, {});

  // Difficulty distribution
  const diffCounts = questions.reduce<Record<string, number>>((acc, q) => {
    if (q.difficulty) acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mt-3 rounded-[10px] bg-gray-50 border border-bolt-line/60 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">
          <span className="font-semibold text-emerald-600">{approved}</span>/{total} approuvée(s)
          {pending > 0 && <span className="ml-1 text-yellow-600">({pending} en attente)</span>}
        </span>
      </div>
      {/* Bloom pills */}
      <div className="flex flex-wrap gap-1">
        {Object.entries(bloomCounts).map(([level, count]) => {
          const cfg = BLOOM_CONFIG[level];
          return cfg ? (
            <span key={level} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.className}`}>
              {cfg.label} ×{count}
            </span>
          ) : null;
        })}
      </div>
      {/* Difficulty pills */}
      <div className="flex flex-wrap gap-1">
        {(['easy', 'medium', 'hard'] as const).map((d) =>
          diffCounts[d] ? (
            <span key={d} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${DIFFICULTY_CONFIG[d].className}`}>
              {DIFFICULTY_CONFIG[d].label} ×{diffCounts[d]}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

// ─── Quiz Bank Configurator ───────────────────────────────────────────────────

function QuizBankConfigurator({ sectionId, onClose }: { sectionId: number; onClose: () => void }) {
  const { data: stats, isLoading } = useQuizBankStats(sectionId);
  const createMutation = useCreateQuizFromBank(sectionId);

  const [numQ, setNumQ] = useState(5);
  const [selAA, setSelAA] = useState<string[]>([]);
  const [selBloom, setSelBloom] = useState<string[]>([]);
  const [selDiff, setSelDiff] = useState<string[]>([]);
  const [title, setTitle] = useState('');

  const toggle = (list: string[], setList: (v: string[]) => void, val: string) => {
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const handleCreate = () => {
    createMutation.mutate(
      {
        num_questions: numQ,
        aa_codes: selAA.length ? selAA : undefined,
        bloom_levels: selBloom.length ? selBloom : undefined,
        difficulties: selDiff.length ? selDiff : undefined,
        title: title.trim() || undefined,
      },
      { onSuccess: onClose }
    );
  };

  if (isLoading) return <Skeleton className="h-32 rounded-[12px]" />;

  const available = stats?.total ?? 0;

  return (
    <div className="mt-3 rounded-[12px] border border-bolt-line bg-gray-50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-bolt-accent" />
        <span className="text-sm font-semibold">Configurer le quiz depuis la banque</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${available > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          {available} question{available !== 1 ? 's' : ''} disponible{available !== 1 ? 's' : ''}
        </span>
      </div>

      {available === 0 ? (
        <p className="text-xs text-muted-foreground">
          La banque de questions de ce cours ne contient pas encore de questions approuvées.
          Rendez-vous dans <strong>Banque de questions</strong> pour en générer.
        </p>
      ) : (
        <>
          {/* Title */}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Titre du quiz (optionnel)</label>
            <Input
              placeholder="Ex: Quiz — Chapitre 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-7 rounded-[8px] text-xs"
            />
          </div>

          {/* Nb questions */}
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-muted-foreground whitespace-nowrap">Nombre de questions :</label>
            <Input
              type="number"
              min={2}
              max={Math.min(30, available)}
              value={numQ}
              onChange={(e) => setNumQ(Number(e.target.value))}
              className="h-7 w-20 rounded-full text-center text-xs"
            />
          </div>

          {/* AA filter */}
          {(stats?.aa_codes?.length ?? 0) > 0 && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">
                Filtrer par AA <span className="text-bolt-accent">(tous si aucun sélectionné)</span>
              </label>
              <div className="flex flex-wrap gap-1">
                {stats!.aa_codes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggle(selAA, setSelAA, code)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      selAA.includes(code)
                        ? 'bg-bolt-accent text-white'
                        : 'bg-bolt-accent/10 text-bolt-accent hover:bg-bolt-accent/20'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bloom filter */}
          {(stats?.bloom_levels?.length ?? 0) > 0 && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">
                Filtrer par Taxonomie de Bloom
              </label>
              <div className="flex flex-wrap gap-1">
                {stats!.bloom_levels.map((bl) => {
                  const cfg = BLOOM_CONFIG[bl];
                  return (
                    <button
                      key={bl}
                      type="button"
                      onClick={() => toggle(selBloom, setSelBloom, bl)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        selBloom.includes(bl)
                          ? (cfg?.className ?? 'bg-gray-200 text-gray-700') + ' ring-2 ring-offset-1 ring-current'
                          : (cfg?.className ?? 'bg-gray-100 text-gray-600') + ' opacity-70 hover:opacity-100'
                      }`}
                    >
                      {cfg?.label ?? bl}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Difficulty filter */}
          {(stats?.difficulties?.length ?? 0) > 0 && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">
                Filtrer par Difficulté
              </label>
              <div className="flex flex-wrap gap-1">
                {stats!.difficulties.map((d) => {
                  const cfg = DIFFICULTY_CONFIG[d];
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggle(selDiff, setSelDiff, d)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        selDiff.includes(d)
                          ? (cfg?.className ?? 'bg-gray-200 text-gray-700') + ' ring-2 ring-offset-1 ring-current'
                          : (cfg?.className ?? 'bg-gray-100 text-gray-600') + ' opacity-70 hover:opacity-100'
                      }`}
                    >
                      {cfg?.label ?? d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="h-7 rounded-full px-4 text-xs"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? '⏳ Sélection en cours...' : '✨ Créer le quiz'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-xs" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SectionQuizManager({ quiz, sectionId }: { quiz: SectionQuiz; sectionId: number }) {
  const publishMutation = usePublishSectionQuiz(sectionId);
  const deleteMutation = useDeleteSectionQuiz(sectionId);
  const [activeTab, setActiveTab] = useState<'questions' | 'results' | 'config' | 'builder'>('questions');
  const [showBankForm, setShowBankForm] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const questions = quiz.questions ?? [];
  const approvedCount = questions.filter((q) => q.status === 'approved').length;
  const isPublished = quiz.status === 'published';
  const totalPoints = questions.filter(q => q.status === 'approved').reduce((s, q) => s + (q.points ?? 1), 0);

  // If teacher activated preview mode, show the quiz taker
  if (previewMode && isPublished) {
    return <SectionQuizTaker sectionId={sectionId} quiz={quiz} isPreview onExitPreview={() => setPreviewMode(false)} />;
  }

  return (
    <div className="mt-2 rounded-[14px] border border-bolt-line bg-white overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-bolt-line">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-4 w-4 shrink-0 text-bolt-accent" />
          <span className="font-semibold text-sm truncate">{quiz.title}</span>
          <Badge variant={isPublished ? 'default' : 'secondary'} className="text-[10px] shrink-0">
            {isPublished ? '✓ Publié' : 'Brouillon'}
          </Badge>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {isPublished && approvedCount > 0 && (
            <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => setPreviewMode(true)}>
              <Eye className="mr-1 h-3 w-3" />
              Vérifier le quiz
            </Button>
          )}
          {!isPublished && approvedCount > 0 && (
            <Button size="sm" className="h-7 rounded-full px-3 text-xs"
              onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              <Send className="mr-1 h-3 w-3" />
              {publishMutation.isPending ? 'Publication...' : 'Publier'}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs text-red-500 hover:bg-red-50"
            onClick={() => { if (confirm('Supprimer le quiz ?')) deleteMutation.mutate(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-bolt-line px-4">
        {([
          { id: 'questions', label: `Questions (${approvedCount}/${questions.length})` },
          { id: 'results',   label: 'Résultats & Notation' },
          { id: 'config',    label: 'Configuration' },
          { id: 'builder',   label: 'Constructeur' },
        ] as const).map((tab) => (
          <button key={tab.id} type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-bolt-accent text-bolt-accent'
                : 'border-transparent text-muted-foreground hover:text-bolt-ink'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'questions' && (
          <QuestionsTab
            quiz={quiz}
            sectionId={sectionId}
            showBankForm={showBankForm}
            setShowBankForm={setShowBankForm}
          />
        )}
        {activeTab === 'results' && (
          <ResultsTab sectionId={sectionId} quiz={quiz} />
        )}
        {activeTab === 'config' && (
          <ConfigTab quiz={quiz} sectionId={sectionId} totalPoints={totalPoints} />
        )}
        {activeTab === 'builder' && (
          <SurveyQuizBuilder sectionId={sectionId} quizId={quiz.id} />
        )}
      </div>
    </div>
  );
}

function QuestionsTab({ quiz, sectionId, showBankForm, setShowBankForm }: {
  quiz: SectionQuiz; sectionId: number;
  showBankForm: boolean; setShowBankForm: (v: boolean) => void;
}) {
  const [filterAA, setFilterAA]       = useState<string>('all');
  const [filterDiff, setFilterDiff]   = useState<string>('all');
  const [filterBloom, setFilterBloom] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const questions = quiz.questions ?? [];
  const approvedCount = questions.filter((q) => q.status === 'approved').length;

  const aaCodes = useMemo(() => {
    const codes = new Set<string>();
    questions.forEach((q) => { if (q.aa_code) codes.add(q.aa_code); });
    return Array.from(codes).sort();
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (filterAA !== 'all' && q.aa_code !== filterAA) return false;
      if (filterDiff !== 'all' && q.difficulty !== filterDiff) return false;
      if (filterBloom !== 'all' && q.bloom_level !== filterBloom) return false;
      if (filterStatus !== 'all' && q.status !== filterStatus) return false;
      return true;
    });
  }, [questions, filterAA, filterDiff, filterBloom, filterStatus]);

  const groupedByAA = useMemo(() => {
    const groups: Record<string, SectionQuizQuestion[]> = {};
    filteredQuestions.forEach((q) => {
      const key = q.aa_code || 'Sans AA';
      if (!groups[key]) groups[key] = [];
      groups[key].push(q);
    });
    return groups;
  }, [filteredQuestions]);

  const hasFilters = filterAA !== 'all' || filterDiff !== 'all' || filterBloom !== 'all' || filterStatus !== 'all';

  return (
    <div>
      {questions.length > 0 && <QuizStatsBar questions={questions} />}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {approvedCount} question{approvedCount > 1 ? 's' : ''} approuvée{approvedCount > 1 ? 's' : ''} {' '}
          {questions.filter(q => q.status === 'approved').reduce((s, q) => s + (q.points ?? 1), 0).toFixed(1)} pts total
        </div>
        <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs"
          onClick={() => setShowBankForm(!showBankForm)}>
          <RefreshCw className="mr-1 h-3 w-3" />
          {showBankForm ? 'Annuler' : 'Reconfigurer depuis la banque'}
        </Button>
      </div>
      {showBankForm && (
        <QuizBankConfigurator sectionId={sectionId} onClose={() => setShowBankForm(false)} />
      )}
      {questions.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
          {aaCodes.length > 1 && (
            <select value={filterAA} onChange={(e) => setFilterAA(e.target.value)}
              className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] text-bolt-ink">
              <option value="all">Tous les AA</option>
              {aaCodes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={filterDiff} onChange={(e) => setFilterDiff(e.target.value)}
            className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] text-bolt-ink">
            <option value="all">Toutes difficultés</option>
            <option value="easy">Facile</option>
            <option value="medium">Moyen</option>
            <option value="hard">Difficile</option>
          </select>
          <select value={filterBloom} onChange={(e) => setFilterBloom(e.target.value)}
            className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] text-bolt-ink">
            <option value="all">Tous niveaux Bloom</option>
            {Object.entries(BLOOM_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] text-bolt-ink">
            <option value="all">Tous statuts</option>
            <option value="pending">En attente</option>
            <option value="approved">Approuvées</option>
            <option value="rejected">Rejetées</option>
          </select>
          {hasFilters && (
            <button onClick={() => { setFilterAA('all'); setFilterDiff('all'); setFilterBloom('all'); setFilterStatus('all'); }}
              className="text-[11px] text-muted-foreground underline">
              Réinitialiser
            </button>
          )}
        </div>
      )}
      {questions.length > 0 ? (
        <div className="mt-3 space-y-4">
          {filteredQuestions.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-3">Aucune question ne correspond aux filtres.</p>
          ) : (
            Object.entries(groupedByAA).sort(([a], [b]) => a.localeCompare(b)).map(([aaCode, qs]) => (
              <div key={aaCode}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-bolt-accent/10 px-2.5 py-1 text-xs font-semibold text-bolt-accent">
                    <GraduationCap className="h-3 w-3" />{aaCode}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{qs.length} question{qs.length > 1 ? 's' : ''}</span>
                  <div className="h-px flex-1 bg-bolt-line/60" />
                </div>
                <div className="space-y-2 pl-1">
                  {qs.map((q) => <QuizQuestionCard key={q.id} question={q} sectionId={sectionId} />)}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Aucune question — reconfigurer depuis la banque.
        </p>
      )}
    </div>
  );
}

function ResultsTab({ sectionId, quiz }: { sectionId: number; quiz: SectionQuiz }) {
  const { data, isLoading } = useQuizResult(sectionId);
  const gradeMutation = useGradeSubmission(sectionId);
  const [selectedSub, setSelectedSub] = useState<SectionQuizSubmissionDetailed | null>(null);
  const [localGrades, setLocalGrades] = useState<Record<string, { score: number; comment: string }>>({});

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Chargement…</div>;

  const submissions: SectionQuizSubmissionDetailed[] = (data as { submissions?: SectionQuizSubmissionDetailed[] })?.submissions ?? [];
  const questions: Record<string, SectionQuizQuestion> = (data as { questions?: Record<string, SectionQuizQuestion> })?.questions ?? {};

  if (submissions.length === 0) {
    return (
      <div className="py-8 text-center">
        <GraduationCap className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Aucune soumission pour le moment.</p>
      </div>
    );
  }

  const openDetailPanel = (sub: SectionQuizSubmissionDetailed) => {
    setSelectedSub(sub);
    const init: Record<string, { score: number; comment: string }> = {};
    Object.entries(sub.graded_answers ?? {}).forEach(([qid, ga]) => {
      init[qid] = { score: ga.final ?? ga.proposed, comment: ga.comment };
    });
    setLocalGrades(init);
  };

  const handleValidateAll = () => {
    if (!selectedSub) return;
    const grades = Object.entries(localGrades)
      .filter(([qid]) => {
        const ga = selectedSub.graded_answers?.[qid];
        return ga && !ga.validated;
      })
      .map(([question_id, { score, comment }]) => ({ question_id, final_score: score, comment }));
    if (grades.length === 0) return;
    gradeMutation.mutate({ submissionId: selectedSub.id, grades }, { onSuccess: () => setSelectedSub(null) });
  };

  const handleValidateOne = (qid: string) => {
    if (!selectedSub) return;
    const g = localGrades[qid];
    if (!g) return;
    gradeMutation.mutate(
      { submissionId: selectedSub.id, grades: [{ question_id: qid, final_score: g.score, comment: g.comment }] },
      { onSuccess: () => setSelectedSub(null) }
    );
  };

  const avg = submissions.reduce((s, sub) => s + (sub.score ?? 0), 0) / submissions.length;
  const pendingCount = submissions.filter(s => s.grading_status === 'pending').length;

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-[10px] bg-bolt-accent/5 p-3 text-center">
          <p className="text-lg font-bold text-bolt-accent">{submissions.length}</p>
          <p className="text-[11px] text-muted-foreground">Soumissions</p>
        </div>
        <div className="rounded-[10px] bg-emerald-50 p-3 text-center">
          <p className="text-lg font-bold text-emerald-600">{avg.toFixed(1)}</p>
          <p className="text-[11px] text-muted-foreground">Moyenne / {quiz.max_score}</p>
        </div>
        <div className={`rounded-[10px] p-3 text-center ${pendingCount > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
          <p className={`text-lg font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{pendingCount}</p>
          <p className="text-[11px] text-muted-foreground">À corriger</p>
        </div>
      </div>
      <div className="space-y-2">
        {submissions.map((sub) => {
          const pct = sub.max_score ? Math.round((sub.score / sub.max_score) * 100) : 0;
          return (
            <div key={sub.id}
              className={`flex items-center gap-3 rounded-[10px] border p-3 hover:border-bolt-accent/30 transition-colors cursor-pointer ${selectedSub?.id === sub.id ? 'border-bolt-accent/50 bg-bolt-accent/5' : 'border-bolt-line'}`}
              onClick={() => selectedSub?.id === sub.id ? setSelectedSub(null) : openDetailPanel(sub)}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bolt-accent/10 text-xs font-bold text-bolt-accent">
                {(sub.student_name ?? 'E').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{sub.student_name ?? `Étudiant #${sub.student_id}`}</p>
                <p className="text-[11px] text-muted-foreground truncate">{sub.student_email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">{sub.score?.toFixed(1)}/{sub.max_score}</p>
                <p className="text-[11px] text-muted-foreground">{pct}%</p>
              </div>
              {sub.attempt_number && sub.attempt_number > 1 && (
                <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  T{sub.attempt_number}
                </span>
              )}
              {sub.grading_status === 'pending' && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">À corriger</span>
              )}
              {sub.grading_status === 'graded' && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Corrigé</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedSub && (
        <div className="mt-4 rounded-[14px] border-2 border-bolt-accent/20 bg-white p-4">
          {/* Panel header with total */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-bolt-ink">{selectedSub.student_name ?? `Étudiant #${selectedSub.student_id}`}</p>
              <p className="text-[11px] text-muted-foreground">{selectedSub.student_email}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-base font-bold text-bolt-accent">{selectedSub.score?.toFixed(1)}/{selectedSub.max_score}</span>
                <span className="rounded-full bg-bolt-accent/10 px-2 py-0.5 text-[11px] font-semibold text-bolt-accent">
                  {selectedSub.max_score ? Math.round((selectedSub.score / selectedSub.max_score) * 100) : 0}%
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  selectedSub.grading_status === 'graded' ? 'bg-emerald-100 text-emerald-700' :
                  selectedSub.grading_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {selectedSub.grading_status === 'graded' ? 'Corrigé' : selectedSub.grading_status === 'pending' ? 'À corriger' : 'Auto-corrigé'}
                </span>
              </div>
            </div>
            <button onClick={() => setSelectedSub(null)} className="shrink-0 rounded-full p-1 hover:bg-gray-100 text-muted-foreground hover:text-bolt-ink">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Per-question review */}
          <div className="space-y-3">
            {Object.entries(selectedSub.graded_answers ?? {}).map(([qid, ga]) => {
              const q = questions[qid];
              const localG = localGrades[qid] ?? { score: ga.final ?? ga.proposed, comment: ga.comment };
              const isMcq = q && (q.question_type === 'mcq' || q.question_type === 'true_false');
              const isOpenType = q && (q.question_type === 'open_ended' || q.question_type === 'code' || q.question_type === 'drag_drop');
              const needsManualGrade = isOpenType && !ga.validated;

              return (
                <div key={qid} className={`rounded-[10px] border p-3 ${ga.validated ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
                  {/* Question text */}
                  <p className="text-xs font-semibold text-bolt-ink mb-2 leading-snug">{q?.question_text ?? `Question ${qid}`}</p>

                  {/* MCQ choices */}
                  {isMcq && q && (
                    <div className="mb-2 space-y-1">
                      {(['a', 'b', 'c', 'd'] as const).map((k) => {
                        const text = q[`choice_${k}` as keyof SectionQuizQuestion] as string | null;
                        if (!text) return null;
                        const isCorrect = q.correct_choice === k;
                        const isStudentAnswer = ga.answer === k;
                        return (
                          <div key={k} className={`flex items-center gap-2 rounded-[6px] px-2 py-1 text-xs ${
                            isCorrect ? 'bg-emerald-100 text-emerald-800 font-medium' :
                            isStudentAnswer && !isCorrect ? 'bg-red-100 text-red-700 line-through opacity-80' :
                            'bg-gray-50 text-gray-600'
                          }`}>
                            <span className="w-4 shrink-0 font-bold">{k.toUpperCase()}.</span>
                            <span className="flex-1">{text}</span>
                            {isCorrect && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />}
                            {isStudentAnswer && !isCorrect && <XCircle className="h-3 w-3 shrink-0 text-red-500" />}
                            {isStudentAnswer && isCorrect && <span className="text-[10px] font-bold text-emerald-700 ml-1">← réponse</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Student answer box */}
                  {!isMcq && (
                    <div className="mb-2 rounded-[6px] border border-bolt-line bg-white px-2.5 py-1.5">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Réponse de l'étudiant</p>
                      <p className="text-xs text-bolt-ink whitespace-pre-wrap">{ga.answer || '(vide)'}</p>
                    </div>
                  )}

                  {/* AI grade + comment */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                      IA : {ga.proposed?.toFixed(1)}/{q?.points ?? 1} pts
                    </span>
                    {ga.comment && (
                      <span className="text-[11px] text-muted-foreground italic">{ga.comment}</span>
                    )}
                    {ga.validated && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">✓ Validé — {ga.final?.toFixed(1)}/{q?.points ?? 1}</span>
                    )}
                  </div>

                  {/* Manual grading controls */}
                  {needsManualGrade && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground shrink-0">Note finale :</span>
                      <input
                        type="number" min={0} max={q?.points ?? 1} step={0.25}
                        value={localG.score}
                        onChange={(e) => setLocalGrades(prev => ({ ...prev, [qid]: { ...prev[qid], score: Number(e.target.value) } }))}
                        className="w-16 h-6 rounded border border-bolt-line px-1 text-xs text-center"
                      />
                      <span className="text-[11px] text-muted-foreground">/ {q?.points ?? 1}</span>
                      <input
                        type="text" placeholder="Commentaire…" value={localG.comment}
                        onChange={(e) => setLocalGrades(prev => ({ ...prev, [qid]: { ...prev[qid], comment: e.target.value } }))}
                        className="flex-1 min-w-24 h-6 rounded border border-bolt-line px-2 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-6 rounded-full px-2 text-[11px]"
                        onClick={() => handleValidateOne(qid)}
                        disabled={gradeMutation.isPending}
                      >
                        Valider
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Validate all pending */}
          {selectedSub.grading_status === 'pending' && (
            <Button size="sm" className="mt-4 w-full rounded-full" onClick={handleValidateAll} disabled={gradeMutation.isPending}>
              {gradeMutation.isPending ? 'Validation…' : '✓ Enregistrer toutes les notes'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigTab({ quiz, sectionId, totalPoints }: { quiz: SectionQuiz; sectionId: number; totalPoints: number }) {
  const updateConfig = useUpdateQuizConfig(sectionId);
  const [startDate, setStartDate] = useState(quiz.start_date ? quiz.start_date.slice(0, 16) : '');
  const [endDate, setEndDate]     = useState(quiz.end_date   ? quiz.end_date.slice(0, 16)   : '');
  const [duration, setDuration]   = useState<string>(quiz.duration_minutes != null ? String(quiz.duration_minutes) : '');
  const [maxAttempts, setMaxAttempts] = useState(quiz.max_attempts ?? 1);
  const [showFeedback, setShowFeedback] = useState(quiz.show_feedback !== false);
  const [password, setPassword]   = useState('');
  const [weightPercent, setWeightPercent] = useState(quiz.weight_percent ?? 10);

  const handleSave = () => {
    updateConfig.mutate({
      start_date:       startDate || null,
      end_date:         endDate   || null,
      duration_minutes: duration  ? Number(duration) : null,
      max_attempts:     maxAttempts,
      show_feedback:    showFeedback,
      password:         password || undefined,
      weight_percent:   weightPercent,
    });
  };

  return (
    <div className="space-y-5">
      {/* Static info */}
      <div className="rounded-[10px] border border-bolt-line bg-gray-50 p-3">
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between"><span>Statut</span><span className="font-medium text-bolt-ink">{quiz.status === 'published' ? 'Publié' : 'Brouillon'}</span></div>
          <div className="flex justify-between"><span>Questions approuvées</span><span className="font-medium text-bolt-ink">{quiz.approved_count ?? 0} / {quiz.question_count ?? 0}</span></div>
          <div className="flex justify-between"><span>Score max calculé</span><span className="font-medium text-bolt-ink">{totalPoints.toFixed(1)} pts</span></div>
        </div>
      </div>

      {/* Availability */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-bolt-ink uppercase tracking-wide">Disponibilité</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Date de début</label>
            <Input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 rounded-[8px] text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Date de fin</label>
            <Input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 rounded-[8px] text-xs"
            />
          </div>
        </div>
      </div>

      {/* Parameters */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-bolt-ink uppercase tracking-wide">Paramètres</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Durée (minutes) — vide = illimitée</label>
            <Input
              type="number"
              min={1}
              max={300}
              placeholder="Illimitée"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-8 rounded-[8px] text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Nombre de tentatives</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              className="h-8 rounded-[8px] text-xs"
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-[8px] border border-bolt-line px-3 py-2">
          <span className="text-xs text-bolt-ink">Afficher les résultats après soumission</span>
          <button
            type="button"
            onClick={() => setShowFeedback((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition-colors ${showFeedback ? 'bg-bolt-accent' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showFeedback ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-bolt-ink uppercase tracking-wide">Sécurité</p>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">
            Mot de passe{quiz.password_protected ? ' (actuellement protégé — laisser vide pour ne pas changer)' : ' (laisser vide = aucun)'}
          </label>
          <Input
            type="text"
            placeholder="Nouveau mot de passe (optionnel)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-8 rounded-[8px] text-xs"
          />
        </div>
      </div>

      {/* Weight */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-bolt-ink uppercase tracking-wide">Pondération</p>
        <div className="flex items-center gap-3">
          <label className="text-[11px] text-muted-foreground whitespace-nowrap">Poids dans la note finale :</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={weightPercent}
            onChange={(e) => setWeightPercent(Number(e.target.value))}
            className="h-8 w-20 rounded-[8px] text-center text-xs"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>

      <Button
        className="w-full rounded-full"
        onClick={handleSave}
        disabled={updateConfig.isPending}
      >
        <Settings className="mr-2 h-3.5 w-3.5" />
        {updateConfig.isPending ? 'Enregistrement…' : 'Enregistrer la configuration'}
      </Button>
    </div>
  );
}

// ─── Section Quiz Taker (Student) ────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SectionQuizTaker({ sectionId, quiz, isPreview = false, onExitPreview }: { sectionId: number; quiz: SectionQuiz; isPreview?: boolean; onExitPreview?: () => void }) {
  // Password state
  const [passwordInput, setPasswordInput] = useState('');
  const [activePassword, setActivePassword] = useState<string | undefined>(
    (quiz.password_protected && !isPreview) ? undefined : ''
  );
  // Quiz UI state
  const [taking, setTaking]         = useState(false);
  const [currentQ, setCurrentQ]     = useState(0);
  const [answers, setAnswers]       = useState<Record<string, string>>({});
  const [submitted, setSubmitted]   = useState(false);
  const [result, setResult]         = useState<SubmitQuizResponse | null>(null);
  const [timeLeft, setTimeLeft]     = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Keep a ref so the timer effect always sees latest answers
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const submitMutation = useSubmitSectionQuiz(sectionId, isPreview);

  // Fetch quiz data (enabled only once we have a password token — or immediately for unprotected/preview)
  const { data: takeData, isLoading, isError } = useTakeQuiz(
    sectionId,
    activePassword || undefined,
    activePassword !== undefined,
    isPreview
  );

  // Fetch survey JSON for SurveyJS player path
  const { data: surveyJsonData } = useSurveyJson(sectionId);

  // Handle wrong password (401)
  useEffect(() => {
    if (isError && quiz.password_protected && activePassword !== undefined) {
      setActivePassword(undefined);
      setPasswordInput('');
    }
  }, [isError, quiz.password_protected, activePassword]);

  // Countdown timer (only while quiz is in progress)
  useEffect(() => {
    if (!taking || timeLeft === null) return;
    if (timeLeft <= 0) {
      // Auto-submit with latest answers
      submitMutation.mutate(answersRef.current, {
        onSuccess: (data) => {
          setSubmitted(true);
          setTaking(false);
          setResult(data);
        },
      });
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => (t ?? 1) - 1), 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taking, timeLeft]);

  const questions: SectionQuizQuestion[] = takeData?.questions ?? [];
  const total = questions.length;

  /* ── Password gate ──────────────────────────────────────────────────────── */
  if (quiz.password_protected && activePassword === undefined) {
    return (
      <div className="mt-2 rounded-[14px] border border-bolt-line bg-white p-6 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-bolt-accent" />
        <p className="font-semibold text-bolt-ink">{quiz.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">Ce quiz est protégé par un mot de passe</p>
        <div className="mt-4 flex gap-2 max-w-xs mx-auto">
          <Input
            type="password"
            placeholder="Mot de passe"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setActivePassword(passwordInput); }}
            className="rounded-[10px]"
          />
          <Button onClick={() => setActivePassword(passwordInput)} className="rounded-full shrink-0">
            Accéder
          </Button>
        </div>
      </div>
    );
  }

  /* ── Loading ─────────────────────────────────────────────────────────────── */
  if (activePassword !== undefined && isLoading) return <Skeleton className="h-24 rounded-[12px]" />;
  if (!takeData) return null;

  /* ── Already submitted (from a previous session) ─────────────────────────── */
  if (takeData.already_submitted && !submitted) {
    const r = takeData.result;
    const attemptsUsed = takeData.attempts_used ?? 1;
    const maxAttempts  = quiz.max_attempts ?? 1;
    const canRetry     = attemptsUsed < maxAttempts;

    return (
      <div className="mt-2 rounded-[12px] border border-bolt-line bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="font-semibold text-bolt-ink">Quiz soumis ✓</p>
          <span className="text-[11px] text-muted-foreground ml-auto">Tentative {attemptsUsed}/{maxAttempts}</span>
        </div>
        {r && quiz.show_feedback !== false && (
          <p className="text-sm text-muted-foreground">Score : <span className="font-bold text-bolt-ink">{r.score}/{r.max_score}</span> ({Math.round((r.score / r.max_score) * 100)}%)</p>
        )}
        {r && quiz.show_feedback === false && (
          <p className="text-sm text-muted-foreground">Votre réponse a été soumise.</p>
        )}
        {canRetry && (
          <Button
            className="mt-3 rounded-full"
            variant="outline"
            onClick={() => {
              setAnswers({});
              setCurrentQ(0);
              setSubmitted(false);
              setResult(null);
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Recommencer (tentative {attemptsUsed + 1}/{maxAttempts})
          </Button>
        )}
      </div>
    );
  }

  /* ── Submitted this session ───────────────────────────────────────────────── */
  if (submitted && result) {
    const showFeedback = quiz.show_feedback !== false || isPreview;
    const attemptsRemaining = isPreview ? 0 : (result.attempts_remaining ?? 0);

    if (!showFeedback) {
      return (
        <div className="mt-2 rounded-[14px] border border-bolt-line bg-white p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <p className="font-bold text-lg text-bolt-ink">Votre réponse a été soumise.</p>
          <p className="mt-1 text-sm text-muted-foreground">L&apos;enseignant vous communiquera votre résultat.</p>
          {attemptsRemaining > 0 && (
            <Button className="mt-4 rounded-full" variant="outline"
              onClick={() => { setAnswers({}); setCurrentQ(0); setSubmitted(false); setResult(null); }}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Recommencer ({attemptsRemaining} tentative{attemptsRemaining > 1 ? 's' : ''} restante{attemptsRemaining > 1 ? 's' : ''})
            </Button>
          )}
        </div>
      );
    }

    const score    = result.score ?? 0;
    const maxScore = result.max_score ?? quiz.max_score;
    const pct      = maxScore ? Math.round((score / maxScore) * 100) : 0;
    const color    = pct >= 80 ? 'emerald' : pct >= 50 ? 'amber' : 'red';
    const gradedAnswers: Record<string, GradedAnswer> = result.graded_answers ?? {};
    const hasPending = result.grading_status === 'pending';

    return (
      <div className="mt-2 rounded-[14px] border border-bolt-line bg-white p-5">
        {isPreview && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm mb-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">MODE VÉRIFICATION</p>
              <p className="text-xs text-amber-700">Les résultats ne seront pas comptabilisés</p>
            </div>
          </div>
        )}
        <div className="text-center mb-5">
          <div className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full ${
            color === 'emerald' ? 'bg-emerald-100' : color === 'amber' ? 'bg-amber-100' : 'bg-red-100'
          }`}>
            {color === 'emerald'
              ? <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              : <BookOpen className="h-7 w-7 text-amber-600" />
            }
          </div>
          <p className="font-bold text-lg text-bolt-ink">{isPreview ? 'Vérification terminée' : 'Quiz soumis !'}</p>
          <p className={`text-2xl font-bold mt-1 ${color === 'emerald' ? 'text-emerald-600' : color === 'amber' ? 'text-amber-500' : 'text-red-500'}`}>
            {score.toFixed(1)} / {maxScore}
          </p>
          <div className="mt-2 mx-auto max-w-[200px] h-2 w-full rounded-full bg-gray-100">
            <div className={`h-2 rounded-full transition-all ${color === 'emerald' ? 'bg-emerald-500' : color === 'amber' ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${pct}%` }} />
          </div>
          {hasPending && (
            <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-full px-3 py-1 inline-block">
              ⏳ Questions ouvertes en attente de correction par l&apos;enseignant
            </p>
          )}
        </div>
        {Object.keys(gradedAnswers).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Détail par question</p>
            {questions.map((q) => {
              const qid = String(q.id);
              const ga = gradedAnswers[qid];
              if (!ga) return null;
              const isCorrect = ga.validated && ga.final === q.points;
              const isPending = !ga.validated;
              return (
                <div key={q.id} className={`rounded-[8px] border p-3 text-xs ${
                  isPending ? 'border-amber-200 bg-amber-50/50' :
                  isCorrect ? 'border-emerald-200 bg-emerald-50/50' :
                  'border-red-200 bg-red-50/50'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 font-bold ${isPending ? 'text-amber-500' : isCorrect ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isPending ? '⏳' : isCorrect ? '✓' : '✗'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-2">{q.question_text}</p>
                      {ga.comment && <p className="mt-1 text-muted-foreground italic">{ga.comment}</p>}
                    </div>
                    <span className={`shrink-0 font-bold ${isPending ? 'text-amber-600' : isCorrect ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isPending ? `?/${q.points}` : `${ga.final?.toFixed(1)}/${q.points}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {isPreview && onExitPreview && (
          <Button className="mt-4 w-full rounded-full" variant="outline" onClick={onExitPreview}>
            ← Retour à la gestion du quiz
          </Button>
        )}
        {!isPreview && attemptsRemaining > 0 && (
          <Button className="mt-4 w-full rounded-full" variant="outline"
            onClick={() => { setAnswers({}); setCurrentQ(0); setSubmitted(false); setResult(null); }}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Recommencer ({attemptsRemaining} tentative{attemptsRemaining > 1 ? 's' : ''} restante{attemptsRemaining > 1 ? 's' : ''})
          </Button>
        )}
      </div>
    );
  }

  /* ── Full-screen quiz ────────────────────────────────────────────────────── */
  if (taking) {
    // SurveyJS player path: if quiz has a survey JSON, use the SurveyQuizPlayer
    const activeSurveyJson = takeData?.survey_json ?? surveyJsonData?.survey_json;
    if (quiz.has_survey_json && activeSurveyJson) {
      return (
        <SurveyQuizPlayer
          sectionId={sectionId}
          quiz={quiz}
          surveyJson={activeSurveyJson}
          attemptsUsed={takeData?.attempts_used ?? 0}
          onClose={() => setTaking(false)}
        />
      );
    }

    const questions: SectionQuizQuestion[] = takeData?.questions ?? [];
    const total = questions.length;
    if (total === 0) return null;

    const q       = questions[currentQ];
    const qId     = String(q.id);
    const isLast  = currentQ === total - 1;
    const needsChoice = q.question_type !== 'open_ended' && q.question_type !== 'code' && q.question_type !== 'drag_drop';
    const hasAnswer   = !!answers[qId];
    const canNext     = !needsChoice || hasAnswer;
    const answeredCount = questions.filter((qu) => !!answers[String(qu.id)]).length;

    const handleSetAnswer = (val: string) => setAnswers((prev) => ({ ...prev, [qId]: val }));

    const handleSubmit = () => {
      submitMutation.mutate(answers, {
        onSuccess: (data) => {
          setSubmitted(true);
          setTaking(false);
          setResult(data);
        },
      });
    };

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {/* Preview banner */}
        {isPreview && (
          <div className="flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 shrink-0">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
            <p className="text-xs font-semibold text-amber-800">MODE VÉRIFICATION — Les résultats ne seront pas comptabilisés</p>
          </div>
        )}
        {/* Header bar */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-bolt-line bg-white shadow-sm shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-5 w-5 shrink-0 text-bolt-accent" />
            <span className="font-semibold text-bolt-ink text-sm truncate">{quiz.title}</span>
            {!isPreview && (
              <span className="hidden sm:block text-[11px] text-muted-foreground shrink-0">
                Tentative {(takeData.attempts_used ?? 0) + 1}/{quiz.max_attempts ?? 1}
              </span>
            )}
          </div>
          {/* Timer */}
          {timeLeft !== null && (
            <div className={`flex items-center gap-1.5 font-mono text-sm font-bold shrink-0 ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-bolt-ink'}`}>
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
          )}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-muted-foreground">{answeredCount}/{total} répondues</span>
            <button
              type="button"
              onClick={() => setShowExitConfirm(true)}
              className="rounded-full p-1 hover:bg-gray-100 text-gray-500 hover:text-bolt-ink"
              aria-label="Quitter"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-gray-100 shrink-0">
          <div className="h-1 bg-bolt-accent transition-all" style={{ width: `${((currentQ + 1) / total) * 100}%` }} />
        </div>

        {/* Exit confirmation */}
        {showExitConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <div className="mx-4 rounded-[16px] bg-white p-6 shadow-xl max-w-sm w-full">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
              <p className="text-center font-semibold text-bolt-ink">Quitter le quiz ?</p>
              <p className="mt-1 text-center text-sm text-muted-foreground">Vos réponses ne seront pas enregistrées.</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1 rounded-full" onClick={() => setShowExitConfirm(false)}>
                  Continuer
                </Button>
                <Button variant="destructive" className="flex-1 rounded-full"
                  onClick={() => { setTaking(false); setShowExitConfirm(false); if (isPreview && onExitPreview) onExitPreview(); }}>
                  Quitter
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Question grid sidebar */}
          <div className="hidden sm:flex w-20 shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-bolt-line bg-gray-50 pt-4 pb-4 px-2">
            {questions.map((qu, idx) => (
              <button
                key={qu.id}
                type="button"
                onClick={() => setCurrentQ(idx)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${
                  idx === currentQ
                    ? 'bg-bolt-accent text-white shadow-sm'
                    : answers[String(qu.id)]
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-white border border-bolt-line text-gray-500 hover:border-bolt-accent/40'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          {/* Question area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-4 sm:p-6">
              {/* Question header */}
              <div className="mb-4">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Question {currentQ + 1} / {total}
                </span>
                <p className="mt-1.5 text-base font-medium leading-snug text-bolt-ink">
                  <span className="mr-1 text-bolt-accent font-bold">Q{currentQ + 1}.</span>
                  {q.question_text}
                </p>
              </div>

              {/* MCQ / True-False */}
              {(q.question_type === 'mcq' || q.question_type === 'true_false' || !q.question_type) && (
                <div className="space-y-2.5">
                  {(['a', 'b', 'c', 'd'] as const).map((k) => {
                    const text = q[`choice_${k}` as keyof SectionQuizQuestion] as string | null;
                    if (!text) return null;
                    const chosen = answers[qId] === k;
                    return (
                      <button key={k} type="button" onClick={() => handleSetAnswer(k)}
                        className={`flex w-full items-center gap-3 rounded-[12px] border-2 px-4 py-3 text-left text-sm transition-all ${
                          chosen
                            ? 'border-bolt-accent bg-bolt-accent/10 text-bolt-accent font-medium'
                            : 'border-transparent bg-gray-50 hover:border-bolt-accent/30 hover:bg-gray-100'
                        }`}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
                          chosen ? 'border-bolt-accent bg-bolt-accent text-white' : 'border-gray-300 text-gray-500'
                        }`}>
                          {k.toUpperCase()}
                        </span>
                        <span>{text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Open-ended */}
              {q.question_type === 'open_ended' && (
                <textarea rows={5} placeholder="Écrivez votre réponse ici…"
                  value={answers[qId] ?? ''}
                  onChange={(e) => handleSetAnswer(e.target.value)}
                  className="w-full rounded-[10px] border border-bolt-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bolt-accent/40 resize-none"
                />
              )}

              {/* Code */}
              {q.question_type === 'code' && (
                <textarea rows={8} placeholder="// Écrivez votre code ici…"
                  value={answers[qId] ?? ''}
                  onChange={(e) => handleSetAnswer(e.target.value)}
                  className="w-full rounded-[10px] border border-bolt-line px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-bolt-accent/40 resize-y"
                />
              )}

              {/* Drag & drop */}
              {q.question_type === 'drag_drop' && (
                <textarea rows={3} placeholder="Décrivez l'ordre ou les correspondances…"
                  value={answers[qId] ?? ''}
                  onChange={(e) => handleSetAnswer(e.target.value)}
                  className="w-full rounded-[10px] border border-bolt-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bolt-accent/40 resize-none"
                />
              )}

              {/* Navigation */}
              <div className="mt-6 flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" className="rounded-full"
                  disabled={currentQ === 0} onClick={() => setCurrentQ((i) => i - 1)}>
                  ← Précédent
                </Button>
                <div className="flex flex-1 justify-center gap-1 sm:hidden">
                  {questions.map((_, idx) => (
                    <button key={idx} type="button" onClick={() => setCurrentQ(idx)}
                      className={`h-2 w-2 rounded-full transition-colors ${
                        idx === currentQ ? 'bg-bolt-accent' :
                        answers[String(questions[idx].id)] ? 'bg-emerald-400' : 'bg-gray-200'
                      }`} />
                  ))}
                </div>
                <div className="flex-1 sm:flex-none" />
                {isLast ? (
                  <Button type="button" size="sm" className="rounded-full"
                    disabled={submitMutation.isPending} onClick={handleSubmit}>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {submitMutation.isPending ? 'Envoi…' : 'Soumettre'}
                  </Button>
                ) : (
                  <Button type="button" size="sm" className="rounded-full"
                    disabled={!canNext} onClick={() => setCurrentQ((i) => i + 1)}>
                    Suivant →
                  </Button>
                )}
              </div>
              {needsChoice && !hasAnswer && !isLast && (
                <p className="mt-2 text-center text-xs text-muted-foreground">Sélectionnez une réponse pour continuer</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Start screen ──────────────────────────────────────────────────────────── */
  const attemptsUsed = takeData.attempts_used ?? 0;
  const maxAttempts  = quiz.max_attempts ?? takeData.max_attempts ?? 1;

  return (
    <div className="mt-2 rounded-[14px] border border-bolt-line bg-white p-6 text-center">
      {isPreview && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm mb-4 text-left">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">MODE VÉRIFICATION</p>
            <p className="text-xs text-amber-700">Les résultats ne seront pas comptabilisés</p>
          </div>
        </div>
      )}
      <BookOpen className="mx-auto mb-3 h-10 w-10 text-bolt-accent" />
      <p className="text-base font-semibold text-bolt-ink">{takeData.quiz.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {total} question{total > 1 ? 's' : ''} · {takeData.quiz.max_score} point{takeData.quiz.max_score > 1 ? 's' : ''}
        {quiz.duration_minutes && ` · ${quiz.duration_minutes} min`}
      </p>
      {!isPreview && maxAttempts > 1 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Tentatives : {attemptsUsed}/{maxAttempts}
        </p>
      )}
      {total === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Aucune question disponible pour l&apos;instant.</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {isPreview
              ? 'Vérifiez le quiz tel que les étudiants le verront.'
              : 'Répondez à chaque question puis soumettez. La soumission est définitive.'}
          </p>
          <Button
            className="mt-5 rounded-full px-8"
            onClick={() => {
              setTaking(true);
              if (quiz.duration_minutes) setTimeLeft(quiz.duration_minutes * 60);
            }}
          >
            {isPreview ? 'Commencer la vérification' : 'Commencer le quiz'}
          </Button>
          {isPreview && onExitPreview && (
            <Button className="mt-2 rounded-full px-8" variant="ghost" onClick={onExitPreview}>
              ← Retour
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Add Image Form ────────────────────────────────────────────────────────────

function AddImageForm({ sectionId, onClose }: { sectionId: number; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const mutation = useAddImageActivity(sectionId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    mutation.mutate({ file, title: title.trim() }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <Input
        placeholder="Titre de l'image"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-[10px] text-sm"
        required
      />
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs"
        required
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="rounded-full text-xs" disabled={mutation.isPending || !file}>
          {mutation.isPending ? 'Ajout...' : 'Ajouter'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full text-xs" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ─── Add Text Doc Form ─────────────────────────────────────────────────────────

function AddTextDocForm({ sectionId, onClose }: { sectionId: number; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const mutation = useAddTextDocActivity(sectionId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    mutation.mutate({ title: title.trim(), content: content.trim() }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <Input
        placeholder="Titre du document"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-[10px] text-sm"
        required
      />
      <textarea
        placeholder="Contenu (Markdown supporté)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="rounded-[10px] border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-y"
        required
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="rounded-full text-xs" disabled={mutation.isPending}>
          {mutation.isPending ? 'Ajout...' : 'Ajouter'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full text-xs" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ─── Sortable Activity Item ───────────────────────────────────────────────────

function SortableActivityItem({
  activity,
  children,
  canEdit,
  allSections,
  sectionId,
  onMove,
}: {
  activity: any;
  children: React.ReactNode;
  canEdit: boolean;
  allSections: Array<{ id: number; title: string; index: number | string }>;
  sectionId: number;
  onMove: (targetSectionId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const otherSections = allSections.filter((s) => s.id !== sectionId);

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1.5">
      <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab p-0.5 text-muted-foreground hover:text-bolt-ink"
            title="Glisser pour réordonner"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {canEdit && otherSections.length > 0 && (
          <Select onValueChange={(val) => onMove(parseInt(val))}>
            <SelectTrigger className="h-5 w-5 p-0 border-none shadow-none bg-transparent text-muted-foreground hover:text-bolt-ink">
              <ArrowRightLeft className="h-3 w-3" />
            </SelectTrigger>
            <SelectContent>
              {otherSections.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  → Section {s.index} — {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ─── Exercise Taker (Feature 3) ──────────────────────────────────────────────

function ExerciseTaker({
  exerciseId,
  exerciseTitle,
  onClose,
}: {
  exerciseId: number;
  exerciseTitle: string;
  onClose: () => void;
}) {
  const startMutation = useStartExercise();
  const submitMutation = useSubmitExercise();
  const [quizData, setQuizData] = useState<{
    quizId: number;
    questions: Array<{
      id: number;
      question_text: string;
      question_type: string;
      choice_a: string | null;
      choice_b: string | null;
      choice_c: string | null;
    }>;
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    startMutation.mutate(exerciseId, {
      onSuccess: (data) => {
        setQuizData({ quizId: data.quiz.id, questions: data.questions });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId]);

  if (startMutation.isPending) {
    return (
      <div className="rounded-[12px] border border-bolt-line bg-white p-6 text-center">
        <RefreshCw className="mx-auto h-5 w-5 animate-spin text-bolt-accent" />
        <p className="mt-2 text-sm text-muted-foreground">Préparation de l'exercice…</p>
      </div>
    );
  }

  if (results) {
    return (
      <div className="rounded-[12px] border border-bolt-line bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-bolt-ink">{exerciseTitle} — Résultats</h4>
          <Button size="sm" variant="outline" onClick={onClose}>Fermer</Button>
        </div>
        <div className="flex items-center gap-4">
          <Badge className="bg-bolt-accent/10 text-bolt-accent text-lg px-3 py-1">
            {results.score}%
          </Badge>
          <span className="text-sm text-muted-foreground">
            {results.correct}/{results.total} correctes
          </span>
          {results.is_tp && (
            <Badge variant="outline" className="text-violet-600 border-violet-300">TP — noté</Badge>
          )}
        </div>
        <div className="space-y-3">
          {results.results?.map((r: any) => (
            <div key={r.id} className="rounded-lg border p-3">
              <p className="text-sm font-medium">{r.question_text}</p>
              <div className="mt-1 flex items-center gap-2 text-xs">
                {r.is_correct === true && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {r.is_correct === false && <XCircle className="h-4 w-4 text-red-500" />}
                {r.is_correct === null && <Clock className="h-4 w-4 text-amber-500" />}
                <span className="text-muted-foreground">Réponse: {r.student_choice || '—'}</span>
                {r.correct_choice && (
                  <span className="text-muted-foreground">• Correcte: {r.correct_choice}</span>
                )}
              </div>
              {r.explanation && (
                <p className="mt-1 text-xs text-muted-foreground italic">{r.explanation}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!quizData) {
    return (
      <div className="rounded-[12px] border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-sm text-red-600">Impossible de démarrer l'exercice.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onClose}>Fermer</Button>
      </div>
    );
  }

  const handleSubmit = () => {
    submitMutation.mutate(
      { exerciseId, quizId: quizData.quizId, answers },
      { onSuccess: (data) => setResults(data) }
    );
  };

  return (
    <div className="rounded-[12px] border border-bolt-line bg-white p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-bolt-ink">{exerciseTitle}</h4>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-4">
        {quizData.questions.map((q, idx) => (
          <div key={q.id} className="rounded-lg border p-4">
            <p className="text-sm font-medium text-bolt-ink">
              <span className="text-muted-foreground mr-1">Q{idx + 1}.</span>
              {q.question_text}
            </p>
            {(q.question_type === 'mcq' || q.question_type === 'true_false') ? (
              <div className="mt-2 space-y-1.5">
                {(['a', 'b', 'c'] as const).map((letter) => {
                  const choiceText = q[`choice_${letter}` as keyof typeof q] as string | null;
                  if (!choiceText) return null;
                  const isSelected = answers[String(q.id)]?.toUpperCase() === letter.toUpperCase();
                  return (
                    <button
                      key={letter}
                      onClick={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: letter.toUpperCase() }))}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                        isSelected
                          ? 'border-bolt-accent bg-bolt-accent/10 text-bolt-accent font-medium'
                          : 'border-bolt-line hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-semibold mr-2">{letter.toUpperCase()}.</span>
                      {choiceText}
                    </button>
                  );
                })}
              </div>
            ) : (
              <textarea
                className="mt-2 w-full rounded-lg border border-bolt-line p-2 text-sm"
                rows={3}
                placeholder="Votre réponse…"
                value={answers[String(q.id)] || ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [String(q.id)]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
          {submitMutation.isPending ? (
            <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Envoi…</>
          ) : (
            <><Send className="mr-2 h-4 w-4" /> Soumettre</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SectionActivities({ sectionId, canEdit, allSections = [] }: SectionActivitiesProps) {
  const { data: activitiesData, isLoading } = useSectionActivities(sectionId);
  // Stabilise the array reference — a new [] default on every render would trigger
  // the useEffect below on every render, causing an infinite setState loop.
  const activities = useMemo(() => activitiesData ?? [], [activitiesData]);
  const { data: quiz } = useSectionQuiz(sectionId);
  const { data: assignment } = useAssignment(sectionId);
  const deleteMutation = useDeleteActivity(sectionId);
  const reorderActivitiesMutation = useReorderActivities();
  const moveActivityMutation = useMoveActivity();

  const [activityOrder, setActivityOrder] = useState<number[]>([]);
  useEffect(() => {
    // Exclude virtual exercise activities (string IDs) from DnD ordering
    setActivityOrder(
      activities
        .filter((a) => typeof a.id === 'number')
        .map((a) => a.id as number)
    );
  }, [activities]);

  const activitySensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleActivityDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = activityOrder.indexOf(active.id as number);
    const newIdx = activityOrder.indexOf(over.id as number);
    const newOrder = arrayMove(activityOrder, oldIdx, newIdx);
    setActivityOrder(newOrder);
    reorderActivitiesMutation.mutate({ sectionId, activityIds: newOrder });
  }

  const [showYoutubeForm, setShowYoutubeForm] = useState(false);
  const [showQuizSection, setShowQuizSection] = useState(false);
  const [showAssignmentSection, setShowAssignmentSection] = useState(false);
  const [showImageForm, setShowImageForm] = useState(false);
  const [showTextDocForm, setShowTextDocForm] = useState(false);

  const closeAll = () => {
    setShowYoutubeForm(false);
    setShowQuizSection(false);
    setShowAssignmentSection(false);
    setShowImageForm(false);
    setShowTextDocForm(false);
  };

  const youtubeActivities = activities.filter((a) => a.activity_type === 'youtube');
  const imageActivities = activities.filter((a) => a.activity_type === 'image');
  const textDocActivities = activities.filter((a) => a.activity_type === 'text_doc');
  const pdfExtractActivities = activities.filter((a) => a.activity_type === 'pdf_extract');
  const exerciseActivities = activities.filter((a) => a.activity_type === 'exercise');

  const [activeExerciseId, setActiveExerciseId] = useState<number | null>(null);

  const hasAnyActivity = youtubeActivities.length > 0 || imageActivities.length > 0 || textDocActivities.length > 0 || pdfExtractActivities.length > 0 || exerciseActivities.length > 0 || !!quiz || !!assignment;

  if (isLoading) return <Skeleton className="mt-3 h-12 rounded-[12px]" />;

  return (
    <div className="mt-4 rounded-[16px] border border-bolt-line bg-gray-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-bolt-ink">Activités</span>
        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => { closeAll(); setShowYoutubeForm((v) => !v); }}
            >
              <Youtube className="mr-1 h-3.5 w-3.5 text-red-500" />
              Vidéo YouTube
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => { closeAll(); setShowImageForm((v) => !v); }}
            >
              <Image className="mr-1 h-3.5 w-3.5 text-blue-500" />
              Image
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => { closeAll(); setShowTextDocForm((v) => !v); }}
            >
              <FileCode2 className="mr-1 h-3.5 w-3.5 text-teal-500" />
              Texte
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => { closeAll(); setShowQuizSection((v) => !v); }}
            >
              <ClipboardList className="mr-1 h-3.5 w-3.5 text-bolt-accent" />
              {quiz ? 'Quiz' : 'Créer un Quiz'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => { closeAll(); setShowAssignmentSection((v) => !v); }}
            >
              <FileText className="mr-1 h-3.5 w-3.5 text-violet-500" />
              {assignment ? 'Devoir' : 'Créer un devoir'}
            </Button>
          </div>
        )}
      </div>

      {/* Add YouTube form */}
      {canEdit && showYoutubeForm && (
        <AddYoutubeForm sectionId={sectionId} onClose={() => setShowYoutubeForm(false)} />
      )}

      {/* Add Image form */}
      {canEdit && showImageForm && (
        <AddImageForm sectionId={sectionId} onClose={() => setShowImageForm(false)} />
      )}

      {/* Add Text Doc form */}
      {canEdit && showTextDocForm && (
        <AddTextDocForm sectionId={sectionId} onClose={() => setShowTextDocForm(false)} />
      )}

      <DndContext
        sensors={activitySensors}
        collisionDetection={closestCorners}
        onDragEnd={handleActivityDragEnd}
      >
      <SortableContext items={activityOrder} strategy={verticalListSortingStrategy}>

      {/* YouTube embeds */}
      {youtubeActivities.length > 0 && (
        <div className="mt-3 space-y-3">
          {youtubeActivities.map((activity) => (
            <SortableActivityItem key={activity.id} activity={activity} canEdit={canEdit} allSections={allSections} sectionId={sectionId} onMove={(targetSectionId) => moveActivityMutation.mutate({ activityId: activity.id as number, sectionId: targetSectionId, position: 0 })}>
              <div className="group relative">
              <YoutubeEmbed
                embedId={activity.youtube_embed_id!}
                title={activity.title}
                transcriptStatus={activity.transcript_status}
              />
              {canEdit && (
                <button
                  onClick={() => deleteMutation.mutate(activity.id as number)}
                  className="absolute right-2 top-2 hidden rounded-full bg-red-500/80 p-1 text-white backdrop-blur-sm group-hover:flex"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              </div>
            </SortableActivityItem>
          ))}
        </div>
      )}

      {/* Image activities */}
      {imageActivities.length > 0 && (
        <div className="mt-3 space-y-3">
          {imageActivities.map((activity) => (
            <SortableActivityItem key={activity.id} activity={activity} canEdit={canEdit} allSections={allSections} sectionId={sectionId} onMove={(targetSectionId) => moveActivityMutation.mutate({ activityId: activity.id as number, sectionId: targetSectionId, position: 0 })}>
              <div className="group relative rounded-[12px] border border-bolt-line overflow-hidden bg-white">
              {activity.image_url && (
                <img
                  src={activity.image_url}
                  alt={activity.title}
                  className="w-full object-contain max-h-80"
                />
              )}
              <p className="px-3 py-2 text-xs text-muted-foreground">{activity.title}</p>
              {canEdit && (
                <button
                  onClick={() => deleteMutation.mutate(activity.id as number)}
                  className="absolute right-2 top-2 hidden rounded-full bg-red-500/80 p-1 text-white backdrop-blur-sm group-hover:flex"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              </div>
            </SortableActivityItem>
          ))}
        </div>
      )}

      {/* Text doc activities */}
      {textDocActivities.length > 0 && (
        <div className="mt-3 space-y-3">
          {textDocActivities.map((activity) => (
            <SortableActivityItem key={activity.id} activity={activity} canEdit={canEdit} allSections={allSections} sectionId={sectionId} onMove={(targetSectionId) => moveActivityMutation.mutate({ activityId: activity.id as number, sectionId: targetSectionId, position: 0 })}>
              <div className="group relative rounded-[12px] border border-bolt-line bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-bolt-ink">{activity.title}</p>
                {canEdit && (
                  <button
                    onClick={() => deleteMutation.mutate(activity.id as number)}
                    className="rounded-full p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans leading-relaxed">
                {activity.content}
              </pre>
              </div>
            </SortableActivityItem>
          ))}
        </div>
      )}

      {/* PDF extract activities */}
      {pdfExtractActivities.length > 0 && (
        <div className="mt-3 space-y-3">
          {pdfExtractActivities.map((activity) => (
            <SortableActivityItem key={activity.id} activity={activity} canEdit={canEdit} allSections={allSections} sectionId={sectionId} onMove={(targetSectionId) => moveActivityMutation.mutate({ activityId: numId(activity.id), sectionId: targetSectionId, position: 0 })}>
              <div className="group relative rounded-[12px] border border-bolt-line bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-bolt-ink">{activity.title}</p>
                {canEdit && (
                  <button
                    onClick={() => deleteMutation.mutate(numId(activity.id))}
                    className="rounded-full p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {activity.pdf_page_start != null && (
                <p className="text-xs text-muted-foreground mb-2">
                  Pages {activity.pdf_page_start}–{activity.pdf_page_end ?? activity.pdf_page_start}
                </p>
              )}
              {activity.image_url && (
                <embed
                  src={activity.image_url}
                  type="application/pdf"
                  className="w-full h-80 rounded-[8px]"
                />
              )}
              </div>
            </SortableActivityItem>
          ))}
        </div>
      )}

      </SortableContext>
      </DndContext>

      {/* Exercise activities (Feature 2) */}
      {exerciseActivities.length > 0 && (
        <div className="mt-3 space-y-3">
          {exerciseActivities.map((activity) => {
            const exId = activity.exercise_id;
            const isActive = activeExerciseId === exId;
            return (
              <div key={activity.id} className="rounded-[12px] border border-bolt-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-violet-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-bolt-ink">{activity.title}</p>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{activity.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {activity.exercise_type && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        {activity.exercise_type === 'tp' ? 'TP' : activity.exercise_type === 'consolidation' ? 'Consolidation' : activity.exercise_type}
                      </Badge>
                    )}
                    {activity.question_count != null && (
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {activity.question_count} Q
                      </Badge>
                    )}
                  </div>
                </div>
                {/* Bloom levels */}
                {activity.bloom_levels && activity.bloom_levels.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {activity.bloom_levels.map((bl: string) => {
                      const cfg = BLOOM_CONFIG[bl];
                      return cfg ? (
                        <Badge key={bl} className={`text-[10px] h-5 ${cfg.className}`}>{cfg.label}</Badge>
                      ) : (
                        <Badge key={bl} variant="outline" className="text-[10px] h-5">{bl}</Badge>
                      );
                    })}
                  </div>
                )}
                {/* Action button for students */}
                {!canEdit && exId && (
                  <div className="mt-3">
                    {isActive ? (
                      <ExerciseTaker
                        exerciseId={exId}
                        exerciseTitle={activity.title}
                        onClose={() => setActiveExerciseId(null)}
                      />
                    ) : (
                      <Button
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => setActiveExerciseId(exId)}
                      >
                        <Dumbbell className="mr-1.5 h-3.5 w-3.5" />
                        Faire cet exercice
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quiz section */}
      {(showQuizSection || quiz) && (
        <div className="mt-3">
          {canEdit ? (
            quiz ? (
              <SectionQuizManager quiz={quiz} sectionId={sectionId} />
            ) : (
              /* No quiz yet — show bank configurator directly */
              <QuizBankConfigurator
                sectionId={sectionId}
                onClose={() => setShowQuizSection(false)}
              />
            )
          ) : (
            quiz?.status === 'published' ? (
              <SectionQuizTaker sectionId={sectionId} quiz={quiz} />
            ) : null
          )}
        </div>
      )}

      {/* Assignment section */}
      {(showAssignmentSection || assignment) && (
        <div className="mt-3">
          {canEdit ? (
            <SectionAssignmentManager sectionId={sectionId} />
          ) : (
            <SectionAssignmentTaker sectionId={sectionId} />
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasAnyActivity && !showYoutubeForm && !showImageForm && !showTextDocForm && !showQuizSection && !showAssignmentSection && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {canEdit
            ? 'Ajoutez une vidéo YouTube, une image, un texte, créez un quiz ou un devoir.'
            : 'Aucune activité pour cette section.'}
        </p>
      )}
    </div>
  );
}
