'use client';

import { useState } from 'react';
import {
  useSectionActivities,
  useAddYoutubeActivity,
  useDeleteActivity,
  useSectionQuiz,
  useGenerateSectionQuiz,
  useUpdateQuizQuestion,
  usePublishSectionQuiz,
  useDeleteSectionQuiz,
  useTakeQuiz,
  useSubmitSectionQuiz,
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
} from 'lucide-react';

interface SectionActivitiesProps {
  sectionId: number;
  canEdit: boolean;
}

// ─── YouTube Embed ─────────────────────────────────────────────────────────────

function YoutubeEmbed({ embedId, title }: { embedId: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-bolt-line">
      <iframe
        src={`https://www.youtube.com/embed/${embedId}`}
        title={title}
        className="aspect-video w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      <p className="px-3 py-2 text-xs text-muted-foreground">{title}</p>
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
    mutation.mutate({ url: url.trim(), title: title.trim() || undefined }, {
      onSuccess: onClose,
    });
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

// ─── Quiz Question Card (Teacher) ─────────────────────────────────────────────

const CHOICE_LABELS = { a: 'A', b: 'B', c: 'C', d: 'D' } as const;
const BLOOM_COLOR: Record<string, string> = {
  remember: 'bg-blue-100 text-blue-700',
  understand: 'bg-indigo-100 text-indigo-700',
  apply: 'bg-purple-100 text-purple-700',
  analyze: 'bg-orange-100 text-orange-700',
  evaluate: 'bg-red-100 text-red-700',
  create: 'bg-pink-100 text-pink-700',
};

function QuizQuestionCard({
  question,
  sectionId,
}: {
  question: SectionQuizQuestion;
  sectionId: number;
}) {
  const updateMutation = useUpdateQuizQuestion(sectionId);
  const [expanded, setExpanded] = useState(false);
  const isPending = question.status === 'pending';
  const isApproved = question.status === 'approved';
  const isRejected = question.status === 'rejected';

  const statusColor = isApproved
    ? 'border-emerald-200 bg-emerald-50'
    : isRejected
    ? 'border-red-200 bg-red-50 opacity-60'
    : 'border-yellow-200 bg-yellow-50';

  return (
    <div className={`rounded-[12px] border p-3 ${statusColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium">{question.question_text}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {question.bloom_level && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BLOOM_COLOR[question.bloom_level] ?? 'bg-gray-100 text-gray-600'}`}>
                {question.bloom_level}
              </span>
            )}
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {question.points} pt{question.points > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 rounded-full p-0"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1">
          {(['a', 'b', 'c', 'd'] as const).map((k) => {
            const text = question[`choice_${k}` as keyof SectionQuizQuestion] as string;
            const isCorrect = question.correct_choice === k;
            return (
              <div
                key={k}
                className={`flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm ${
                  isCorrect ? 'bg-emerald-100 font-semibold text-emerald-800' : 'bg-white/80'
                }`}
              >
                <span className="w-5 shrink-0 font-bold">{CHOICE_LABELS[k]}.</span>
                <span>{text}</span>
                {isCorrect && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-600" />}
              </div>
            );
          })}
          {question.explanation && (
            <p className="mt-1 rounded-[8px] bg-white/60 px-2 py-1.5 text-xs text-muted-foreground">
              💡 {question.explanation}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-2 flex gap-1.5">
        {!isApproved && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-full border-emerald-400 px-2 text-[11px] text-emerald-700 hover:bg-emerald-50"
            onClick={() => updateMutation.mutate({ questionId: question.id, data: { status: 'approved' } })}
            disabled={updateMutation.isPending}
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approuver
          </Button>
        )}
        {!isRejected && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-full border-red-400 px-2 text-[11px] text-red-600 hover:bg-red-50"
            onClick={() => updateMutation.mutate({ questionId: question.id, data: { status: 'rejected' } })}
            disabled={updateMutation.isPending}
          >
            <XCircle className="mr-1 h-3 w-3" />
            Rejeter
          </Button>
        )}
        {!isPending && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 rounded-full px-2 text-[11px]"
            onClick={() => updateMutation.mutate({ questionId: question.id, data: { status: 'pending' } })}
          >
            Remettre en attente
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Section Quiz Manager (Teacher) ──────────────────────────────────────────

function SectionQuizManager({ quiz, sectionId }: { quiz: SectionQuiz; sectionId: number }) {
  const [numQ, setNumQ] = useState(5);
  const generateMutation = useGenerateSectionQuiz(sectionId);
  const publishMutation = usePublishSectionQuiz(sectionId);
  const deleteMutation = useDeleteSectionQuiz(sectionId);
  const [showGenForm, setShowGenForm] = useState(false);

  const approvedCount = (quiz.questions ?? []).filter((q) => q.status === 'approved').length;
  const isPublished = quiz.status === 'published';

  return (
    <div className="mt-2 rounded-[14px] border border-bolt-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-bolt-accent" />
          <span className="font-semibold text-sm">{quiz.title}</span>
          <Badge variant={isPublished ? 'default' : 'secondary'} className="text-xs">
            {isPublished ? 'Publié ✓' : 'Brouillon'}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {approvedCount}/{(quiz.questions ?? []).length} approuvée(s)
          </span>
        </div>

        <div className="flex gap-1.5">
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
            onClick={() => setShowGenForm((v) => !v)}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            {showGenForm ? 'Annuler' : 'Générer plus'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-full px-2 text-xs text-red-500"
            onClick={() => { if (confirm('Supprimer le quiz ?')) deleteMutation.mutate(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showGenForm && (
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Nb questions :</label>
          <Input
            type="number"
            min={2}
            max={15}
            value={numQ}
            onChange={(e) => setNumQ(Number(e.target.value))}
            className="h-7 w-20 rounded-full text-center text-xs"
          />
          <Button
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => { generateMutation.mutate(numQ); setShowGenForm(false); }}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? 'Génération...' : 'Générer'}
          </Button>
        </div>
      )}

      {(quiz.questions ?? []).length > 0 && (
        <div className="mt-3 space-y-2">
          {(quiz.questions ?? []).map((q) => (
            <QuizQuestionCard key={q.id} question={q} sectionId={sectionId} />
          ))}
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
    return (
      <div className="mt-2 rounded-[12px] bg-emerald-50 border border-emerald-200 p-4 text-sm">
        <p className="font-semibold text-emerald-800">Quiz déjà soumis ✓</p>
        <p className="text-emerald-700 mt-1">
          Score : {r.score}/{r.max_score} — {Math.round((r.score / r.max_score) * 100)}%
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
                      chosen
                        ? 'bg-bolt-accent text-white'
                        : 'bg-gray-50 hover:bg-gray-100'
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
  const generateMutation = useGenerateSectionQuiz(sectionId);

  const [showYoutubeForm, setShowYoutubeForm] = useState(false);
  const [showQuizSection, setShowQuizSection] = useState(false);

  const youtubeActivities = activities.filter((a) => a.activity_type === 'youtube');

  if (isLoading) return <Skeleton className="mt-3 h-12 rounded-[12px]" />;

  return (
    <div className="mt-4 rounded-[16px] border border-bolt-line bg-gray-50 p-4">
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

      {/* Quiz section (Teacher: manage quiz / Student: take quiz) */}
      {(showQuizSection || quiz) && (
        <div className="mt-3">
          {canEdit ? (
            quiz ? (
              <SectionQuizManager quiz={quiz} sectionId={sectionId} />
            ) : (
              <div className="rounded-[12px] border border-dashed border-bolt-line p-4 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Aucun quiz pour cette section. Générez-en un avec l'IA.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <label className="text-xs text-muted-foreground">Nb questions :</label>
                  <Input
                    type="number"
                    min={2}
                    max={15}
                    defaultValue={5}
                    id={`numq-${sectionId}`}
                    className="h-7 w-20 rounded-full text-center text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => {
                      const el = document.getElementById(`numq-${sectionId}`) as HTMLInputElement;
                      generateMutation.mutate(Number(el?.value ?? 5));
                    }}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending ? 'Génération...' : 'Générer le quiz'}
                  </Button>
                </div>
              </div>
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
            ? 'Ajoutez une vidéo YouTube ou créez un quiz pour cette section.'
            : 'Aucune activité pour cette section.'}
        </p>
      )}
    </div>
  );
}
