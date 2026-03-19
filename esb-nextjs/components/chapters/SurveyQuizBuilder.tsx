'use client';

import { useState, useMemo, useEffect } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';
import { useBankQuestions, useSurveyJson, useSaveSurveyJson } from '@/lib/hooks/useReferences';
import { BankQuestion } from '@/lib/types/references';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Save, Eye, EyeOff, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SurveyChoice {
  value: string;
  text: string;
}

interface SurveyElement {
  type: string;
  name: string;
  title: string;
  _bankQuestionId: number;
  points: number;
  choices?: SurveyChoice[];
  correctAnswer?: string;
  commentPlaceholder?: string;
  [key: string]: unknown;
}

interface SurveyPage {
  elements: SurveyElement[];
}

interface SurveyJsonObject {
  title?: string;
  pages: SurveyPage[];
  showProgressBar?: string;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function convertToSurveyElement(q: BankQuestion): SurveyElement {
  const base = {
    name: `q_${q.id}`,
    title: q.question_text,
    _bankQuestionId: q.id,
    points: q.points ?? 1.0,
  };

  switch (q.question_type) {
    case 'mcq': {
      const choices: SurveyChoice[] = [];
      if (q.choice_a) choices.push({ value: 'A', text: q.choice_a });
      if (q.choice_b) choices.push({ value: 'B', text: q.choice_b });
      if (q.choice_c) choices.push({ value: 'C', text: q.choice_c });
      if (q.choice_d) choices.push({ value: 'D', text: q.choice_d });
      return { ...base, type: 'radiogroup', choices, correctAnswer: q.correct_choice ?? undefined };
    }
    case 'true_false':
      return {
        ...base,
        type: 'radiogroup',
        choices: [
          { value: 'A', text: 'Vrai' },
          { value: 'B', text: 'Faux' },
        ],
        correctAnswer: q.correct_choice ?? undefined,
      };
    case 'open_ended':
      return { ...base, type: 'comment' };
    case 'code':
      return { ...base, type: 'comment', commentPlaceholder: '// Écrivez votre code ici' };
    case 'drag_drop': {
      const items: SurveyChoice[] = [];
      if (q.choice_a) items.push({ value: 'A', text: q.choice_a });
      if (q.choice_b) items.push({ value: 'B', text: q.choice_b });
      if (q.choice_c) items.push({ value: 'C', text: q.choice_c });
      if (q.choice_d) items.push({ value: 'D', text: q.choice_d });
      return { ...base, type: 'ranking', choices: items };
    }
    default:
      return { ...base, type: 'comment' };
  }
}

const TYPE_LABELS: Record<string, string> = {
  mcq: 'QCM',
  true_false: 'V/F',
  open_ended: 'Ouvert',
  code: 'Code',
  drag_drop: 'Ordre',
};

const EMPTY_SURVEY: SurveyJsonObject = {
  title: '',
  pages: [{ elements: [] }],
  showProgressBar: 'top',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface SurveyQuizBuilderProps {
  sectionId: number;
  quizId: number;
}

export default function SurveyQuizBuilder({ sectionId }: SurveyQuizBuilderProps) {
  const { data: bankData, isLoading: bankLoading } = useBankQuestions(sectionId);
  const { data: surveyData, isLoading: surveyLoading } = useSurveyJson(sectionId);
  const saveMutation = useSaveSurveyJson(sectionId);

  const [surveyJson, setSurveyJson] = useState<SurveyJsonObject>(EMPTY_SURVEY);
  const [search, setSearch] = useState('');
  const [filterAA, setFilterAA] = useState('all');
  const [filterBloom, setFilterBloom] = useState('all');
  const [filterDiff, setFilterDiff] = useState('all');
  const [preview, setPreview] = useState(false);

  // Load existing survey JSON from API
  useEffect(() => {
    if (surveyData?.survey_json) {
      setSurveyJson(surveyData.survey_json as SurveyJsonObject);
    }
  }, [surveyData]);

  const bankQuestions = bankData?.questions ?? [];

  const aaCodes = useMemo(
    () => [...new Set(bankQuestions.map((q) => q.aa_code).filter(Boolean))].sort() as string[],
    [bankQuestions]
  );
  const bloomLevels = useMemo(
    () => [...new Set(bankQuestions.map((q) => q.bloom_level).filter(Boolean))].sort() as string[],
    [bankQuestions]
  );

  const filtered = useMemo(() => {
    return bankQuestions.filter((q) => {
      if (search && !q.question_text.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterAA !== 'all' && q.aa_code !== filterAA) return false;
      if (filterBloom !== 'all' && q.bloom_level !== filterBloom) return false;
      if (filterDiff !== 'all' && q.difficulty !== filterDiff) return false;
      return true;
    });
  }, [bankQuestions, search, filterAA, filterBloom, filterDiff]);

  const currentElements = surveyJson.pages[0]?.elements ?? [];
  const addedIds = useMemo(
    () => new Set(currentElements.map((el) => el._bankQuestionId)),
    [currentElements]
  );

  const addQuestion = (q: BankQuestion) => {
    if (addedIds.has(q.id)) {
      toast.info('Question déjà ajoutée au quiz');
      return;
    }
    const element = convertToSurveyElement(q);
    setSurveyJson((prev) => ({
      ...prev,
      pages: [{ elements: [...(prev.pages[0]?.elements ?? []), element] }],
    }));
  };

  const removeQuestion = (bankQuestionId: number) => {
    setSurveyJson((prev) => ({
      ...prev,
      pages: [
        {
          elements: (prev.pages[0]?.elements ?? []).filter(
            (el) => el._bankQuestionId !== bankQuestionId
          ),
        },
      ],
    }));
  };

  const handleSave = () => {
    saveMutation.mutate(surveyJson as unknown as Record<string, unknown>);
  };

  const previewModel = useMemo(() => {
    if (!preview) return null;
    try {
      const m = new Model(surveyJson);
      m.showProgressBar = 'top';
      m.showCompletedPage = true;
      return m;
    } catch {
      return null;
    }
  }, [preview, surveyJson]);

  if (surveyLoading || bankLoading) {
    return <Skeleton className="h-64 w-full rounded-[12px]" />;
  }

  return (
    <div className="flex gap-3 h-[600px] overflow-hidden">
      {/* ── Left Panel: Bank Questions ─────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col border border-bolt-line rounded-[12px] bg-white overflow-hidden">
        <div className="p-3 border-b border-bolt-line bg-gray-50">
          <p className="text-xs font-semibold text-bolt-ink mb-2">
            Banque de questions ({bankQuestions.length})
          </p>
          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="h-7 pl-6 rounded-full text-xs"
            />
          </div>
          {/* Filters */}
          <div className="flex flex-col gap-1">
            {aaCodes.length > 0 && (
              <select
                value={filterAA}
                onChange={(e) => setFilterAA(e.target.value)}
                className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] w-full"
              >
                <option value="all">Tous les AA</option>
                {aaCodes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <select
              value={filterBloom}
              onChange={(e) => setFilterBloom(e.target.value)}
              className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] w-full"
            >
              <option value="all">Tous niveaux Bloom</option>
              {bloomLevels.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              value={filterDiff}
              onChange={(e) => setFilterDiff(e.target.value)}
              className="h-6 rounded-full border border-bolt-line bg-white px-2 text-[11px] w-full"
            >
              <option value="all">Toutes difficultés</option>
              <option value="easy">Facile</option>
              <option value="medium">Moyen</option>
              <option value="hard">Difficile</option>
            </select>
          </div>
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">Aucune question</p>
          ) : (
            filtered.map((q) => {
              const isAdded = addedIds.has(q.id);
              return (
                <div
                  key={q.id}
                  className={`rounded-[8px] border p-2 text-xs transition-colors ${
                    isAdded
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-bolt-line bg-white hover:border-bolt-accent/30'
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-2 text-bolt-ink leading-tight">{q.question_text}</p>
                      <div className="mt-1 flex gap-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">
                          {TYPE_LABELS[q.question_type] ?? q.question_type}
                        </Badge>
                        {q.aa_code && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {q.aa_code}
                          </Badge>
                        )}
                        {q.difficulty && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {q.difficulty}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addQuestion(q)}
                      disabled={isAdded}
                      className={`shrink-0 rounded-full w-6 h-6 flex items-center justify-center transition-colors ${
                        isAdded
                          ? 'bg-emerald-100 text-emerald-600 cursor-default'
                          : 'bg-bolt-accent/10 text-bolt-accent hover:bg-bolt-accent hover:text-white'
                      }`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Panel: Survey Builder / Preview ──────────────────── */}
      <div className="flex-1 flex flex-col border border-bolt-line rounded-[12px] bg-white overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 border-b border-bolt-line bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-bolt-ink">
              {preview
                ? 'Aperçu'
                : `Survey (${currentElements.length} question${currentElements.length > 1 ? 's' : ''})`}
            </span>
            {!preview && currentElements.length > 0 && (
              <button
                type="button"
                onClick={() => setSurveyJson(EMPTY_SURVEY)}
                className="text-[11px] text-red-500 hover:underline"
              >
                Tout effacer
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setPreview((v) => !v)}
            >
              {preview ? (
                <EyeOff className="mr-1 h-3 w-3" />
              ) : (
                <Eye className="mr-1 h-3 w-3" />
              )}
              {preview ? 'Éditer' : 'Aperçu'}
            </Button>
            <Button
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              <Save className="mr-1 h-3 w-3" />
              {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {preview ? (
            previewModel ? (
              <Survey model={previewModel} />
            ) : (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                Chargement de l&apos;aperçu...
              </div>
            )
          ) : currentElements.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Plus className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Aucune question ajoutée</p>
              <p className="text-xs mt-1">Cliquez sur &quot;+&quot; dans la banque de questions</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
                Questions dans le quiz
              </p>
              {currentElements.map((el, idx) => (
                <div
                  key={el.name}
                  className="flex items-start gap-2 rounded-[8px] border border-bolt-line p-2.5 text-xs bg-white"
                >
                  <span className="shrink-0 w-5 h-5 rounded-full bg-bolt-accent/10 text-bolt-accent flex items-center justify-center text-[10px] font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium line-clamp-2 text-bolt-ink">{el.title}</p>
                    <div className="mt-1 flex gap-1">
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        {el.type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {el.points} pt{el.points > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(el._bankQuestionId)}
                    className="shrink-0 rounded-full p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
