'use client';

import { useState, useMemo } from 'react';
import {
  useSectionActivities,
  useAddYoutubeActivity,
  useDeleteActivity,
  useSectionQuiz,
  useUpdateQuizQuestion,
  usePublishSectionQuiz,
  useDeleteSectionQuiz,
  useTakeQuiz,
  useSubmitSectionQuiz,
  useQuizBankStats,
  useCreateQuizFromBank,
} from '@/lib/hooks/useReferences';
import { SectionActivity, SectionQuiz, SectionQuizQuestion } from '@/lib/types/references';
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
} from 'lucide-react';

interface SectionActivitiesProps {
  sectionId: number;
  canEdit: boolean;
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
          <div className="mt-1.5 pl-4">
            <QuestionTags question={question} />
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
  const [showBankForm, setShowBankForm] = useState(false);
  const [filterAA, setFilterAA] = useState<string>('all');
  const [filterDiff, setFilterDiff] = useState<string>('all');
  const [filterBloom, setFilterBloom] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const questions = quiz.questions ?? [];
  const approvedCount = questions.filter((q) => q.status === 'approved').length;
  const isPublished = quiz.status === 'published';

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
    <div className="mt-2 rounded-[14px] border border-bolt-line bg-white p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-4 w-4 shrink-0 text-bolt-accent" />
          <span className="font-semibold text-sm truncate">{quiz.title}</span>
          <Badge variant={isPublished ? 'default' : 'secondary'} className="text-[10px] shrink-0">
            {isPublished ? '✓ Publié' : 'Brouillon'}
          </Badge>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {!isPublished && approvedCount > 0 && (
            <Button
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
            >
              <Send className="mr-1 h-3 w-3" />
              {publishMutation.isPending ? 'Publication...' : 'Publier'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setShowBankForm((v) => !v)}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            {showBankForm ? 'Annuler' : 'Reconfigurer depuis la banque'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-full px-2 text-xs text-red-500 hover:bg-red-50"
            onClick={() => { if (confirm('Supprimer le quiz ?')) deleteMutation.mutate(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Bank configurator */}
      {showBankForm && (
        <QuizBankConfigurator sectionId={sectionId} onClose={() => setShowBankForm(false)} />
      )}

      {/* Stats bar */}
      {questions.length > 0 && <QuizStatsBar questions={questions} />}

      {/* Filters */}
      {questions.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
          {aaCodes.length > 1 && (
            <select
              value={filterAA}
              onChange={(e) => setFilterAA(e.target.value)}
              className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] text-bolt-ink"
            >
              <option value="all">Tous les AA</option>
              {aaCodes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select
            value={filterDiff}
            onChange={(e) => setFilterDiff(e.target.value)}
            className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] text-bolt-ink"
          >
            <option value="all">Toutes difficultés</option>
            <option value="easy">Facile</option>
            <option value="medium">Moyen</option>
            <option value="hard">Difficile</option>
          </select>
          <select
            value={filterBloom}
            onChange={(e) => setFilterBloom(e.target.value)}
            className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] text-bolt-ink"
          >
            <option value="all">Tous niveaux Bloom</option>
            {Object.entries(BLOOM_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] text-bolt-ink"
          >
            <option value="all">Tous statuts</option>
            <option value="pending">En attente</option>
            <option value="approved">Approuvées</option>
            <option value="rejected">Rejetées</option>
          </select>
          {hasFilters && (
            <button
              onClick={() => { setFilterAA('all'); setFilterDiff('all'); setFilterBloom('all'); setFilterStatus('all'); }}
              className="text-[11px] text-muted-foreground underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {/* Questions grouped by AA */}
      {questions.length > 0 && (
        <div className="mt-3 space-y-4">
          {filteredQuestions.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-3">
              Aucune question ne correspond aux filtres sélectionnés.
            </p>
          ) : (
            Object.entries(groupedByAA).sort(([a], [b]) => a.localeCompare(b)).map(([aaCode, qs]) => (
              <div key={aaCode}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-bolt-accent/10 px-2.5 py-1 text-xs font-semibold text-bolt-accent">
                    <GraduationCap className="h-3 w-3" />
                    {aaCode}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{qs.length} question{qs.length > 1 ? 's' : ''}</span>
                  <div className="h-px flex-1 bg-bolt-line/60" />
                </div>
                <div className="space-y-2 pl-1">
                  {qs.map((q) => (
                    <QuizQuestionCard key={q.id} question={q} sectionId={sectionId} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section Quiz Taker (Student) ────────────────────────────────────────────

function SectionQuizTaker({ sectionId }: { sectionId: number }) {
  const { data: takeData, isLoading } = useTakeQuiz(sectionId);
  const submitMutation = useSubmitSectionQuiz(sectionId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; max_score: number; percent: number } | null>(null);

  if (isLoading) return <Skeleton className="h-24 rounded-[12px]" />;
  if (!takeData) return null;

  if (takeData.already_submitted && takeData.result) {
    const r = takeData.result;
    const pct = Math.round((r.score / r.max_score) * 100);
    return (
      <div className="mt-2 rounded-[12px] bg-emerald-50 border border-emerald-200 p-4 text-sm">
        <p className="font-semibold text-emerald-800">Quiz déjà soumis ✓</p>
        <p className="text-emerald-700 mt-1">
          Score : {r.score}/{r.max_score} — {pct}%
        </p>
      </div>
    );
  }

  if (submitted && result) {
    return (
      <div className="mt-2 rounded-[12px] bg-emerald-50 border border-emerald-200 p-4 text-sm">
        <p className="font-semibold text-emerald-800">Quiz soumis ✓</p>
        <p className="text-emerald-700 mt-1">
          Score : {result.score}/{result.max_score} — {result.percent}%
        </p>
      </div>
    );
  }

  const handleSubmit = () => {
    submitMutation.mutate(answers, {
      onSuccess: (data) => {
        setSubmitted(true);
        setResult({ score: data.score, max_score: data.max_score, percent: data.percent });
      },
    });
  };

  return (
    <div className="mt-2 rounded-[14px] border border-bolt-line bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-bolt-accent" />
        <span className="font-semibold text-sm">{takeData.quiz.title}</span>
        <span className="text-xs text-muted-foreground">{takeData.quiz.question_count} question(s)</span>
      </div>

      <div className="space-y-4">
        {takeData.questions.map((q, idx) => (
          <div key={q.id} className="rounded-[10px] border border-bolt-line p-3">
            <p className="text-sm font-medium mb-2">{idx + 1}. {q.question_text}</p>
            <div className="space-y-1">
              {(['a', 'b', 'c', 'd'] as const).map((k) => {
                const text = q[`choice_${k}` as keyof SectionQuizQuestion] as string;
                if (!text) return null;
                const chosen = answers[String(q.id)] === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: k }))}
                    className={`flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm transition-colors ${
                      chosen ? 'bg-bolt-accent text-white' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <span className="w-5 font-bold">{k.toUpperCase()}.</span>
                    <span>{text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Button
        className="mt-4 w-full rounded-full"
        onClick={handleSubmit}
        disabled={Object.keys(answers).length < takeData.questions.length || submitMutation.isPending}
      >
        <Send className="mr-2 h-4 w-4" />
        {submitMutation.isPending ? 'Envoi...' : 'Soumettre le quiz'}
      </Button>

      {Object.keys(answers).length < takeData.questions.length && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Répondez à toutes les questions avant de soumettre.
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SectionActivities({ sectionId, canEdit }: SectionActivitiesProps) {
  const { data: activities = [], isLoading } = useSectionActivities(sectionId);
  const { data: quiz } = useSectionQuiz(sectionId);
  const deleteMutation = useDeleteActivity(sectionId);

  const [showYoutubeForm, setShowYoutubeForm] = useState(false);
  const [showQuizSection, setShowQuizSection] = useState(false);

  const youtubeActivities = activities.filter((a) => a.activity_type === 'youtube');

  if (isLoading) return <Skeleton className="mt-3 h-12 rounded-[12px]" />;

  return (
    <div className="mt-4 rounded-[16px] border border-bolt-line bg-gray-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-bolt-ink">Activités</span>
        {canEdit && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => { setShowYoutubeForm((v) => !v); setShowQuizSection(false); }}
            >
              <Youtube className="mr-1 h-3.5 w-3.5 text-red-500" />
              Vidéo YouTube
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => { setShowQuizSection((v) => !v); setShowYoutubeForm(false); }}
            >
              <ClipboardList className="mr-1 h-3.5 w-3.5 text-bolt-accent" />
              {quiz ? 'Quiz' : 'Créer un Quiz'}
            </Button>
          </div>
        )}
      </div>

      {/* Add YouTube form */}
      {canEdit && showYoutubeForm && (
        <AddYoutubeForm sectionId={sectionId} onClose={() => setShowYoutubeForm(false)} />
      )}

      {/* YouTube embeds */}
      {youtubeActivities.length > 0 && (
        <div className="mt-3 space-y-3">
          {youtubeActivities.map((activity) => (
            <div key={activity.id} className="group relative">
              <YoutubeEmbed
                embedId={activity.youtube_embed_id!}
                title={activity.title}
                transcriptStatus={activity.transcript_status}
              />
              {canEdit && (
                <button
                  onClick={() => deleteMutation.mutate(activity.id)}
                  className="absolute right-2 top-2 hidden rounded-full bg-red-500/80 p-1 text-white backdrop-blur-sm group-hover:flex"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
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
              <SectionQuizTaker sectionId={sectionId} />
            ) : null
          )}
        </div>
      )}

      {/* Empty state */}
      {youtubeActivities.length === 0 && !quiz && !showYoutubeForm && !showQuizSection && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {canEdit
            ? 'Ajoutez une vidéo YouTube ou créez un quiz depuis la banque de questions.'
            : 'Aucune activité pour cette section.'}
        </p>
      )}
    </div>
  );
}
