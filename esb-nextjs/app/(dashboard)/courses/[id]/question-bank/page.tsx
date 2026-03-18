'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  useCourseQBank,
  useCourseAAList,
  useGenerateCourseQBank,
  useCreateCourseQBankQuestion,
  useUpdateCourseQBankQuestion,
  useDeleteCourseQBankQuestion,
} from '@/lib/hooks/useQuestionBank';
import { CourseQBankQuestion, QuestionType, CreateCourseQBankData } from '@/lib/types/question-bank';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Trash2,
  Pencil,
  GraduationCap,
  Layers,
  BarChart3,
  Sparkles,
  Database,
  Code,
  FileText,
  ToggleLeft,
  Grip,
  Eye,
  EyeOff,
} from 'lucide-react';
import { InlineMath, BlockMath } from 'react-katex';

// ─── LaTeX Renderer ───────────────────────────────────────────────────────────

/**
 * Renders a string that may contain LaTeX delimiters:
 *   $$...$$ → block (display) math
 *   $...$   → inline math
 * Falls back to plain text for non-math segments.
 */
function LatexRenderer({ text, className }: { text: string; className?: string }) {
  if (!text) return null;

  // Split on $$...$$ first (block), then on $...$ (inline)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Block math $$...$$
    const blockStart = remaining.indexOf('$$');
    if (blockStart !== -1) {
      const blockEnd = remaining.indexOf('$$', blockStart + 2);
      if (blockEnd !== -1) {
        if (blockStart > 0) parts.push(<span key={key++}>{remaining.slice(0, blockStart)}</span>);
        const latex = remaining.slice(blockStart + 2, blockEnd);
        parts.push(
          <span key={key++} className="block my-1">
            <BlockMath math={latex} />
          </span>
        );
        remaining = remaining.slice(blockEnd + 2);
        continue;
      }
    }

    // Inline math $...$
    const inlineStart = remaining.indexOf('$');
    if (inlineStart !== -1) {
      const inlineEnd = remaining.indexOf('$', inlineStart + 1);
      if (inlineEnd !== -1) {
        if (inlineStart > 0) parts.push(<span key={key++}>{remaining.slice(0, inlineStart)}</span>);
        const latex = remaining.slice(inlineStart + 1, inlineEnd);
        parts.push(<InlineMath key={key++} math={latex} />);
        remaining = remaining.slice(inlineEnd + 1);
        continue;
      }
    }

    // No more math
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return <span className={className}>{parts}</span>;
}

// ─── LaTeX Field (textarea + live preview) ───────────────────────────────────

function LatexField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  const [preview, setPreview] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-muted-foreground">{label}</label>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-bolt-accent hover:underline"
        >
          {preview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {preview ? 'Éditer' : 'Aperçu LaTeX'}
        </button>
      </div>
      {preview ? (
        <div className="min-h-[60px] rounded-[8px] border border-bolt-line bg-gray-50 px-3 py-2 text-sm leading-relaxed">
          {value ? <LatexRenderer text={value} /> : <span className="text-muted-foreground italic text-xs">Aucun contenu</span>}
        </div>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`rounded-[8px] text-xs leading-relaxed ${mono ? 'font-mono' : ''}`}
        />
      )}
      <p className="text-[10px] text-muted-foreground/70">
        Utilisez <code className="bg-gray-100 px-0.5 rounded">$...$</code> pour les formules inline et <code className="bg-gray-100 px-0.5 rounded">$$...$$</code> pour les formules en bloc.
      </p>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTION_TYPES: { value: QuestionType; label: string; icon: React.ReactNode }[] = [
  { value: 'mcq',        label: 'QCM',              icon: <FileText className="h-3.5 w-3.5" /> },
  { value: 'true_false', label: 'Vrai / Faux',       icon: <ToggleLeft className="h-3.5 w-3.5" /> },
  { value: 'drag_drop',  label: 'Drag & Drop',       icon: <Grip className="h-3.5 w-3.5" /> },
  { value: 'open_ended', label: 'Question ouverte',  icon: <FileText className="h-3.5 w-3.5" /> },
  { value: 'code',       label: 'Code pratique',     icon: <Code className="h-3.5 w-3.5" /> },
];

const BLOOM_LEVELS = [
  { value: 'remember',   label: 'Mémorisation',  className: 'bg-slate-100 text-slate-700' },
  { value: 'understand', label: 'Compréhension', className: 'bg-blue-100 text-blue-700' },
  { value: 'apply',      label: 'Application',   className: 'bg-green-100 text-green-700' },
  { value: 'analyze',    label: 'Analyse',       className: 'bg-yellow-100 text-yellow-700' },
  { value: 'evaluate',   label: 'Évaluation',    className: 'bg-orange-100 text-orange-700' },
  { value: 'create',     label: 'Création',      className: 'bg-rose-100 text-rose-700' },
];

const DIFFICULTY_LEVELS = [
  { value: 'easy',   label: 'Facile',    className: 'bg-emerald-100 text-emerald-700' },
  { value: 'medium', label: 'Moyen',     className: 'bg-yellow-100 text-yellow-700' },
  { value: 'hard',   label: 'Difficile', className: 'bg-red-100 text-red-700' },
];

const bloomConfig = Object.fromEntries(BLOOM_LEVELS.map((b) => [b.value, b]));
const diffConfig  = Object.fromEntries(DIFFICULTY_LEVELS.map((d) => [d.value, d]));

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq:        'QCM',
  true_false: 'Vrai/Faux',
  drag_drop:  'Drag & Drop',
  open_ended: 'Question ouverte',
  code:       'Code pratique',
};

// ─── Generation Form ──────────────────────────────────────────────────────────

function GenerateForm({ courseId, onClose }: { courseId: number; onClose: () => void }) {
  const mutation   = useGenerateCourseQBank(courseId);
  const { data: aaData, isLoading: aaLoading } = useCourseAAList(courseId);

  const [selectedAAs,  setSelectedAAs]  = useState<string[]>([]);
  const [bloomLevel,   setBloomLevel]   = useState('remember');
  const [difficulty,   setDifficulty]   = useState('medium');
  const [questionType, setQuestionType] = useState<QuestionType>('mcq');
  const [numQ,         setNumQ]         = useState(3);

  const aaList = aaData?.aa_list ?? [];

  const toggleAA = (code: string) => {
    setSelectedAAs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAAs.length === 0) return;
    mutation.mutate(
      { aa_codes: selectedAAs, bloom_level: bloomLevel, difficulty, question_type: questionType, num_questions: numQ },
      { onSuccess: onClose }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[14px] border border-bolt-line bg-white p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-bolt-accent" />
        <span className="font-semibold text-sm">Générer des questions</span>
      </div>

      {/* AA multi-select pills */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block">
          Acquis d'Apprentissage (AA) *{' '}
          <span className="text-muted-foreground/60">— sélectionnez un ou plusieurs AA</span>
        </label>
        {aaLoading ? (
          <div className="h-8 animate-pulse rounded-[8px] bg-gray-100" />
        ) : aaList.length === 0 ? (
          <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            Aucun AA trouvé dans le syllabus. Vérifiez que le syllabus est bien importé.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {aaList.map((aa) => {
              const isSelected = selectedAAs.includes(aa.code);
              return (
                <button
                  key={aa.code}
                  type="button"
                  title={aa.description}
                  onClick={() => toggleAA(aa.code)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all border ${
                    isSelected
                      ? 'bg-bolt-accent text-white border-bolt-accent shadow-sm'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-bolt-accent hover:text-bolt-accent'
                  }`}
                >
                  {aa.code}
                </button>
              );
            })}
          </div>
        )}
        {selectedAAs.length > 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {selectedAAs.join(', ')} sélectionné{selectedAAs.length > 1 ? 's' : ''} — {numQ} questions par AA ({numQ * selectedAAs.length} au total)
          </p>
        )}
      </div>

      {/* Question Type */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block">Type de question</label>
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setQuestionType(t.value)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                questionType === t.value
                  ? 'bg-bolt-accent text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bloom */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block">Taxonomie de Bloom</label>
        <div className="flex flex-wrap gap-1.5">
          {BLOOM_LEVELS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setBloomLevel(b.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                bloomLevel === b.value
                  ? b.className + ' ring-2 ring-offset-1 ring-current'
                  : b.className + ' opacity-60 hover:opacity-100'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block">Difficulté</label>
        <div className="flex gap-1.5">
          {DIFFICULTY_LEVELS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDifficulty(d.value)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                difficulty === d.value
                  ? d.className + ' ring-2 ring-offset-1 ring-current'
                  : d.className + ' opacity-60 hover:opacity-100'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Nb questions per AA */}
      <div className="flex items-center gap-3">
        <label className="text-[11px] text-muted-foreground whitespace-nowrap">Questions par AA :</label>
        <Input
          type="number"
          min={1}
          max={10}
          value={numQ}
          onChange={(e) => setNumQ(Number(e.target.value))}
          className="h-7 w-16 rounded-full text-center text-xs"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          className="h-7 rounded-full px-4 text-xs"
          disabled={mutation.isPending || selectedAAs.length === 0}
        >
          {mutation.isPending ? '⏳ Génération...' : `✨ Générer${selectedAAs.length > 1 ? ` (${selectedAAs.length} AA)` : ''}`}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full px-3 text-xs" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ─── Manual Create Form ────────────────────────────────────────────────────────

function ManualCreateForm({ courseId, onClose }: { courseId: number; onClose: () => void }) {
  const mutation                       = useCreateCourseQBankQuestion(courseId);
  const { data: aaData, isLoading: aaLoading } = useCourseAAList(courseId);

  const aaList = aaData?.aa_list ?? [];

  const [aaCode,       setAaCode]       = useState('');
  const [bloomLevel,   setBloomLevel]   = useState('remember');
  const [difficulty,   setDifficulty]   = useState('medium');
  const [questionType, setQuestionType] = useState<QuestionType>('mcq');
  const [questionText, setQuestionText] = useState('');
  const [choiceA,      setChoiceA]      = useState('');
  const [choiceB,      setChoiceB]      = useState('');
  const [choiceC,      setChoiceC]      = useState('');
  const [correctChoice,setCorrectChoice]= useState('a');
  const [answer,       setAnswer]       = useState('');
  const [explanation,  setExplanation]  = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    const payload: CreateCourseQBankData = {
      aa_code:       aaCode || (aaList[0]?.code ?? 'AA 1'),
      bloom_level:   bloomLevel,
      difficulty,
      question_type: questionType,
      question_text: questionText,
      explanation:   explanation || undefined,
    };

    if (questionType === 'mcq') {
      payload.choice_a       = choiceA;
      payload.choice_b       = choiceB;
      payload.choice_c       = choiceC;
      payload.correct_choice = correctChoice;
    } else if (questionType === 'true_false') {
      payload.choice_a       = 'Vrai';
      payload.choice_b       = 'Faux';
      payload.correct_choice = correctChoice; // 'a' = Vrai, 'b' = Faux
    } else {
      payload.answer = answer;
    }

    mutation.mutate(payload, { onSuccess: onClose });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[14px] border border-bolt-line bg-white p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Plus className="h-4 w-4 text-bolt-accent" />
        <span className="font-semibold text-sm">Créer une question manuellement</span>
        <span className="ml-auto text-[10px] text-muted-foreground bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          Supporte LaTeX ($…$ / $$…$$)
        </span>
      </div>

      {/* AA selection */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block">Acquis d'Apprentissage (AA) *</label>
        {aaLoading ? (
          <div className="h-8 animate-pulse rounded-[8px] bg-gray-100" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {aaList.map((aa) => (
              <button
                key={aa.code}
                type="button"
                title={aa.description}
                onClick={() => setAaCode(aa.code)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all border ${
                  aaCode === aa.code
                    ? 'bg-bolt-accent text-white border-bolt-accent'
                    : 'bg-white text-bolt-accent border-bolt-accent/40 hover:bg-bolt-accent/5'
                }`}
              >
                {aa.code}
              </button>
            ))}
            {aaList.length === 0 && (
              <Input
                value={aaCode}
                onChange={(e) => setAaCode(e.target.value)}
                placeholder="ex: AA 1"
                className="h-7 w-28 rounded-full text-xs"
              />
            )}
          </div>
        )}
      </div>

      {/* Question type */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block">Type de question</label>
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setQuestionType(t.value)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                questionType === t.value ? 'bg-bolt-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bloom */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block">Taxonomie de Bloom</label>
        <div className="flex flex-wrap gap-1.5">
          {BLOOM_LEVELS.map((b) => (
            <button key={b.value} type="button" onClick={() => setBloomLevel(b.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                bloomLevel === b.value ? b.className + ' ring-2 ring-offset-1 ring-current' : b.className + ' opacity-60 hover:opacity-100'
              }`}
            >{b.label}</button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block">Difficulté</label>
        <div className="flex gap-1.5">
          {DIFFICULTY_LEVELS.map((d) => (
            <button key={d.value} type="button" onClick={() => setDifficulty(d.value)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                difficulty === d.value ? d.className + ' ring-2 ring-offset-1 ring-current' : d.className + ' opacity-60 hover:opacity-100'
              }`}
            >{d.label}</button>
          ))}
        </div>
      </div>

      {/* Question text */}
      <LatexField
        label="Énoncé de la question *"
        value={questionText}
        onChange={setQuestionText}
        placeholder="Saisissez l'énoncé... ex: Calculer $\int_0^1 x^2\,dx$"
        rows={3}
      />

      {/* Type-specific fields */}
      {questionType === 'mcq' && (
        <div className="space-y-3 rounded-[10px] bg-gray-50 border border-bolt-line/60 p-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Choix de réponses (QCM)</p>
          <LatexField label="Choix A" value={choiceA} onChange={setChoiceA} placeholder="ex: $x = 1/3$" rows={1} />
          <LatexField label="Choix B" value={choiceB} onChange={setChoiceB} placeholder="ex: $x = 2/3$" rows={1} />
          <LatexField label="Choix C" value={choiceC} onChange={setChoiceC} placeholder="ex: $x = 1$" rows={1} />
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Bonne réponse</label>
            <div className="flex gap-2">
              {['a', 'b', 'c'].map((opt) => (
                <button key={opt} type="button" onClick={() => setCorrectChoice(opt)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold border transition-all ${
                    correctChoice === opt ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                  }`}
                >{opt.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {questionType === 'true_false' && (
        <div className="rounded-[10px] bg-gray-50 border border-bolt-line/60 p-3">
          <label className="text-[11px] text-muted-foreground mb-2 block font-semibold uppercase tracking-wide">Bonne réponse</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCorrectChoice('a')}
              className={`rounded-full px-4 py-1.5 text-[11px] font-bold border transition-all ${
                correctChoice === 'a' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >✓ Vrai</button>
            <button type="button" onClick={() => setCorrectChoice('b')}
              className={`rounded-full px-4 py-1.5 text-[11px] font-bold border transition-all ${
                correctChoice === 'b' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >✗ Faux</button>
          </div>
        </div>
      )}

      {(questionType === 'open_ended' || questionType === 'drag_drop' || questionType === 'code') && (
        <LatexField
          label={questionType === 'code' ? 'Solution (code)' : 'Réponse modèle'}
          value={answer}
          onChange={setAnswer}
          placeholder={questionType === 'code' ? '# Saisir le code solution...' : 'Saisir la réponse attendue...'}
          rows={questionType === 'code' ? 6 : 3}
          mono={questionType === 'code'}
        />
      )}

      {/* Explanation (optional for all types) */}
      <LatexField
        label="Explication / Justification (optionnel)"
        value={explanation}
        onChange={setExplanation}
        placeholder="Pourquoi cette réponse est correcte..."
        rows={2}
      />

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="h-7 rounded-full px-4 text-xs"
          disabled={mutation.isPending || !questionText.trim()}>
          {mutation.isPending ? '⏳ Enregistrement...' : '+ Ajouter la question'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full px-3 text-xs" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ─── Answer Display (read or inline-edit) ─────────────────────────────────────

function AnswerBlock({
  question,
  courseId,
  editing,
  onStartEdit,
  onSaved,
}: {
  question: CourseQBankQuestion;
  courseId: number;
  editing: boolean;
  onStartEdit: () => void;
  onSaved: () => void;
}) {
  const updateMutation = useUpdateCourseQBankQuestion(courseId);
  const [draft, setDraft] = useState(question.answer ?? '');

  const save = () => {
    updateMutation.mutate(
      { questionId: question.id, data: { answer: draft } },
      { onSuccess: onSaved }
    );
  };

  if (editing) {
    return (
      <div className="mt-2 space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Réponse / Correction (modifiable)
        </label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={question.question_type === 'code' ? 8 : 4}
          className={`rounded-[8px] text-xs leading-relaxed ${question.question_type === 'code' ? 'font-mono' : ''}`}
          placeholder="Réponse modèle…"
        />
        <div className="flex gap-1.5">
          <Button size="sm" className="h-6 rounded-full px-3 text-[11px]" onClick={save} disabled={updateMutation.isPending}>
            Enregistrer
          </Button>
          <Button size="sm" variant="ghost" className="h-6 rounded-full px-2 text-[11px]" onClick={onSaved}>
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  if (!question.answer) {
    return (
      <button
        className="mt-1.5 text-[11px] text-bolt-accent underline"
        onClick={onStartEdit}
      >
        + Ajouter une réponse modèle
      </button>
    );
  }

  return (
    <div className="mt-2 group/ans relative">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Réponse</label>
      <div
        className={`mt-0.5 rounded-[8px] bg-emerald-50 border border-emerald-100 px-2.5 py-2 text-xs text-emerald-900 leading-relaxed ${
          question.question_type === 'code' ? 'font-mono whitespace-pre-wrap' : ''
        }`}
      >
        {question.question_type === 'drag_drop'
          ? (() => {
              try {
                const pairs = JSON.parse(question.answer) as { left: string; right: string }[];
                return (
                  <ul className="space-y-0.5">
                    {pairs.map((p, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-semibold">{p.left}</span>
                        <span className="text-emerald-600">→</span>
                        <span>{p.right}</span>
                      </li>
                    ))}
                  </ul>
                );
              } catch {
                return question.answer;
              }
            })()
          : question.answer}
      </div>
      <button
        onClick={onStartEdit}
        className="absolute right-1 top-5 hidden group-hover/ans:flex rounded-full p-1 hover:bg-emerald-100 text-emerald-700"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Question Card ─────────────────────────────────────────────────────────────

function QuestionCard({ question, courseId }: { question: CourseQBankQuestion; courseId: number }) {
  const updateMutation = useUpdateCourseQBankQuestion(courseId);
  const deleteMutation = useDeleteCourseQBankQuestion(courseId);
  const [expanded,     setExpanded]     = useState(false);
  const [editingAnswer, setEditingAnswer] = useState(false);

  const isApproved = question.is_approved;
  const bloom  = bloomConfig[question.bloom_level ?? ''];
  const diff   = diffConfig[question.difficulty ?? ''];

  const borderCls = isApproved
    ? 'border-emerald-200 bg-emerald-50/40'
    : 'border-yellow-200 bg-yellow-50/40';

  return (
    <div className={`rounded-[12px] border p-3 transition-all ${borderCls}`}>
      {/* Header row */}
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isApproved ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">
            <LatexRenderer text={question.question_text} />
          </p>
          {/* Tags */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="rounded-full bg-bolt-accent/10 px-2 py-0.5 text-[10px] font-semibold text-bolt-accent">
              {TYPE_LABELS[question.question_type]}
            </span>
            {bloom && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bloom.className}`}>
                <Layers className="inline h-2.5 w-2.5 mr-0.5" />{bloom.label}
              </span>
            )}
            {diff && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${diff.className}`}>
                <BarChart3 className="inline h-2.5 w-2.5 mr-0.5" />{diff.label}
              </span>
            )}
            {isApproved && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                ✓ Validée
              </span>
            )}
          </div>
        </div>
        <button
          className="shrink-0 rounded-full p-0.5 hover:bg-white/70"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 pl-4 space-y-2">
          {/* MCQ choices */}
          {question.question_type === 'mcq' && (
            <div className="space-y-1">
              {(['a', 'b', 'c'] as const).map((k) => {
                const text = question[`choice_${k}`];
                if (!text) return null;
                const isCorrect = question.correct_choice === k;
                return (
                  <div
                    key={k}
                    className={`flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm ${
                      isCorrect ? 'bg-emerald-100 font-semibold text-emerald-800' : 'bg-white/70'
                    }`}
                  >
                    <span className={`w-5 text-xs font-bold ${isCorrect ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                      {k.toUpperCase()}.
                    </span>
                    <span><LatexRenderer text={text} /></span>
                    {isCorrect && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-600" />}
                  </div>
                );
              })}
            </div>
          )}

          {/* True/False */}
          {question.question_type === 'true_false' && question.correct_choice && (
            <div className="rounded-[8px] bg-white/70 px-2.5 py-1.5 text-sm font-medium">
              Réponse correcte :{' '}
              <span className={question.correct_choice === 'true' ? 'text-emerald-700' : 'text-red-600'}>
                {question.correct_choice === 'true' ? '✓ Vrai' : '✗ Faux'}
              </span>
            </div>
          )}

          {/* Answer block (all types) */}
          <AnswerBlock
            question={question}
            courseId={courseId}
            editing={editingAnswer}
            onStartEdit={() => setEditingAnswer(true)}
            onSaved={() => setEditingAnswer(false)}
          />

          {/* Explanation (if separate) */}
          {question.explanation && question.explanation !== question.answer && (
            <div className="rounded-[8px] bg-white/60 px-2.5 py-1.5 text-xs text-muted-foreground">
              💡 <LatexRenderer text={question.explanation} />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {!isApproved ? (
              <Button
                size="sm"
                variant="outline"
                className="h-6 rounded-full border-emerald-400 px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-50"
                onClick={() => updateMutation.mutate({ questionId: question.id, data: { action: 'approve' } })}
                disabled={updateMutation.isPending}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" /> Valider
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-6 rounded-full border-yellow-400 px-2.5 text-[11px] text-yellow-700 hover:bg-yellow-50"
                onClick={() => updateMutation.mutate({ questionId: question.id, data: { action: 'reject' } })}
                disabled={updateMutation.isPending}
              >
                <XCircle className="mr-1 h-3 w-3" /> Retirer la validation
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 rounded-full px-2 text-[11px] text-red-500 hover:bg-red-50"
              onClick={() => { if (confirm('Supprimer cette question ?')) deleteMutation.mutate(question.id); }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AA Group ─────────────────────────────────────────────────────────────────

function AAGroup({
  aaCode,
  questions,
  courseId,
  defaultOpen,
}: {
  aaCode: string;
  questions: CourseQBankQuestion[];
  courseId: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const approved = questions.filter((q) => q.is_approved).length;

  return (
    <div className="rounded-[14px] border border-bolt-line bg-white overflow-hidden">
      {/* Group header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 rounded-full bg-bolt-accent/10 px-2.5 py-1 text-xs font-semibold text-bolt-accent">
            <GraduationCap className="h-3 w-3" />
            {aaCode}
          </div>
          <span className="text-xs text-muted-foreground">
            {questions.length} question{questions.length > 1 ? 's' : ''}
            {' · '}
            <span className="text-emerald-600 font-medium">{approved} validée{approved > 1 ? 's' : ''}</span>
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-bolt-line/50 pt-3">
          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} courseId={courseId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ groups }: { groups: Record<string, CourseQBankQuestion[]> }) {
  const all = Object.values(groups).flat();
  const total    = all.length;
  const approved = all.filter((q) => q.is_approved).length;

  if (!total) return null;

  const byType = all.reduce<Record<string, number>>((acc, q) => {
    acc[q.question_type] = (acc[q.question_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-gray-50 border border-bolt-line/60 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        <span className="font-semibold text-bolt-ink">{total}</span> question{total > 1 ? 's' : ''}
        {' · '}
        <span className="text-emerald-600 font-semibold">{approved} validée{approved > 1 ? 's' : ''}</span>
        {' · '}
        <span className="text-yellow-600">{total - approved} en attente</span>
      </span>
      <div className="flex flex-wrap gap-1">
        {Object.entries(byType).map(([type, count]) => (
          <span key={type} className="rounded-full bg-bolt-accent/10 px-2 py-0.5 text-[10px] font-semibold text-bolt-accent">
            {TYPE_LABELS[type as QuestionType] ?? type} ×{count}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CourseQuestionBankPage() {
  const params   = useParams<{ id: string }>();
  const courseId = Number(params.id);
  const router   = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const { data, isLoading } = useCourseQBank(courseId);
  const [activeForm, setActiveForm] = useState<'generate' | 'manual' | null>(null);

  // Redirect students — question bank is for teachers only
  useEffect(() => {
    if (!authLoading && user && !user.is_teacher && !user.is_superuser) {
      router.replace(`/courses/${courseId}`);
    }
  }, [user, authLoading, router, courseId]);

  if (authLoading || (!user?.is_teacher && !user?.is_superuser)) return null;

  const groups   = data?.groups ?? {};
  const aaCodes  = data?.aa_codes ?? [];
  const hasData  = Object.keys(groups).length > 0;

  return (
    <div className="min-h-screen bg-gray-50/50 px-4 py-6 md:px-8">
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-bolt-accent" />
            <h1 className="text-xl font-bold text-bolt-ink">Banque de questions</h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Questions organisées par Acquis d'Apprentissage. Validez-les pour les utiliser dans les quizz.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={activeForm === 'generate' ? 'default' : 'outline'}
            className="rounded-full px-4 text-sm"
            onClick={() => setActiveForm(activeForm === 'generate' ? null : 'generate')}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Générer (IA)
          </Button>
          <Button
            variant={activeForm === 'manual' ? 'default' : 'outline'}
            className="rounded-full px-4 text-sm"
            onClick={() => setActiveForm(activeForm === 'manual' ? null : 'manual')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Créer manuellement
          </Button>
        </div>
      </div>

      {/* Generation form */}
      {activeForm === 'generate' && (
        <div className="mb-6">
          <GenerateForm courseId={courseId} onClose={() => setActiveForm(null)} />
        </div>
      )}

      {/* Manual create form */}
      {activeForm === 'manual' && (
        <div className="mb-6">
          <ManualCreateForm courseId={courseId} onClose={() => setActiveForm(null)} />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-[14px]" />)}
        </div>
      )}

      {/* Stats */}
      {!isLoading && hasData && (
        <div className="mb-4">
          <StatsBar groups={groups} />
        </div>
      )}

      {/* AA Groups */}
      {!isLoading && (
        <div className="space-y-3">
          {hasData ? (
            aaCodes.map((aa, idx) => (
              <AAGroup
                key={aa}
                aaCode={aa}
                questions={groups[aa] ?? []}
                courseId={courseId}
                defaultOpen={idx === 0}
              />
            ))
          ) : (
            <div className="rounded-[16px] border border-dashed border-bolt-line bg-white p-10 text-center">
              <Database className="mx-auto mb-3 h-10 w-10 text-bolt-accent/30" />
              <p className="text-sm font-medium text-bolt-ink mb-1">Banque de questions vide</p>
              <p className="text-xs text-muted-foreground mb-4">
                Générez des questions QCM, Vrai/Faux, Drag & Drop, questions ouvertes ou code pratique.
                <br />Elles seront organisées par AA et vous pourrez les valider avant utilisation.
              </p>
              <Button size="sm" className="rounded-full" onClick={() => setActiveForm('generate')}>
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Générer les premières questions
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
