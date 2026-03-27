'use client';

import { useState } from 'react';
import { Wand2, ChevronDown, ChevronUp, FlaskConical, BookOpen, Tag, Sparkles, Loader2, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ImprovementProposal, GeneratedQuestion } from '@/lib/types/course';
import { useGenerateExamQuestions } from '@/lib/hooks/useCourses';

interface Props {
  proposals: ImprovementProposal[];
  courseId: number;
  examId: number;
}

const BLOOM_COLORS: Record<string, string> = {
  remembering:   'bg-blue-100 text-blue-700',
  understanding: 'bg-green-100 text-green-700',
  applying:      'bg-yellow-100 text-yellow-700',
  analyzing:     'bg-orange-100 text-orange-700',
  evaluating:    'bg-red-100 text-red-700',
  creating:      'bg-purple-100 text-purple-700',
};
const BLOOM_LABELS: Record<string, string> = {
  remembering: 'Mémorisation', understanding: 'Compréhension',
  applying: 'Application', analyzing: 'Analyse',
  evaluating: 'Évaluation', creating: 'Création',
};
const DIFF_COLORS: Record<string, string> = {
  Fondamental:    'bg-green-100 text-green-700',
  Intermédiaire:  'bg-yellow-100 text-yellow-700',
  Avancé:         'bg-red-100 text-red-700',
  facile:         'bg-green-100 text-green-700',
  moyen:          'bg-yellow-100 text-yellow-700',
  difficile:      'bg-red-100 text-red-700',
};

const TYPE_COLORS: Record<string, string> = {
  qcm:      'bg-sky-100 text-sky-700',
  ouvert:   'bg-indigo-100 text-indigo-700',
  pratique: 'bg-orange-100 text-orange-700',
  vrai_faux: 'bg-teal-100 text-teal-700',
};
const TYPE_LABELS: Record<string, string> = {
  qcm: 'QCM', ouvert: 'Ouverte', pratique: 'Pratique', vrai_faux: 'Vrai/Faux',
};

const FOCUS_OPTIONS: { key: 'bloom' | 'aa' | 'difficulty' | 'practical'; label: string; desc: string }[] = [
  { key: 'aa',         label: 'AAs non couverts',      desc: 'Cible les acquis d\'apprentissage manquants' },
  { key: 'bloom',      label: 'Équilibre cognitif',    desc: 'Renforce les niveaux de Bloom sous-représentés' },
  { key: 'difficulty', label: 'Équilibre difficulté',  desc: 'Mix 30% Fondamental / 40% Intermédiaire / 30% Avancé' },
  { key: 'practical',  label: 'Questions pratiques',   desc: 'Études de cas, calculs, code, manipulation' },
];

function ProposalCard({ p, i, expanded, onToggle }: {
  p: ImprovementProposal; i: number; expanded: boolean; onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/50 to-white overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-violet-50/50 transition-colors">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {p.aa && <Badge variant="outline" className="text-xs border-violet-200 text-violet-700"><Tag className="h-2.5 w-2.5 mr-1" />{p.aa}</Badge>}
              {p.bloom_level && <Badge className={`text-xs ${BLOOM_COLORS[p.bloom_level] ?? 'bg-gray-100 text-gray-600'}`}>{BLOOM_LABELS[p.bloom_level] ?? p.bloom_level}</Badge>}
              {p.difficulty && <Badge className={`text-xs ${DIFF_COLORS[p.difficulty] ?? 'bg-gray-100 text-gray-600'}`}>{p.difficulty}</Badge>}
              {p.is_practical && <Badge className="text-xs bg-orange-100 text-orange-700"><FlaskConical className="h-2.5 w-2.5 mr-1" />Pratique</Badge>}
              {p.question_type === 'mcq' ? <Badge className="text-xs bg-sky-100 text-sky-700">QCM</Badge>
                : <Badge className="text-xs bg-indigo-100 text-indigo-700"><BookOpen className="h-2.5 w-2.5 mr-1" />Ouverte</Badge>}
            </div>
            <p className="text-sm font-medium text-gray-800 line-clamp-2">{p.question_text}</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-violet-100 pt-3">
          <div>
            <p className="text-xs font-semibold text-violet-700 mb-1">Texte complet</p>
            <p className="text-sm text-gray-700 leading-relaxed">{p.question_text}</p>
          </div>
          {p.rationale && (
            <div className="rounded-lg bg-violet-50 border border-violet-100 p-3">
              <p className="text-xs font-semibold text-violet-700 mb-1"><Wand2 className="h-3 w-3 inline mr-1" />Pourquoi cette question ?</p>
              <p className="text-xs text-violet-600 leading-relaxed">{p.rationale}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GeneratedCard({ q, i }: { q: GeneratedQuestion; i: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/40 to-white overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-emerald-50/40 transition-colors">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {q.aa_targeted && <Badge variant="outline" className="text-xs border-emerald-200 text-emerald-700"><Tag className="h-2.5 w-2.5 mr-1" />{q.aa_targeted}</Badge>}
              {q.bloom_level && <Badge className={`text-xs ${BLOOM_COLORS[q.bloom_level] ?? 'bg-gray-100'}`}>{BLOOM_LABELS[q.bloom_level] ?? q.bloom_level}</Badge>}
              {q.difficulty && <Badge className={`text-xs ${DIFF_COLORS[q.difficulty] ?? 'bg-gray-100'}`}>{q.difficulty}</Badge>}
              {q.type && <Badge className={`text-xs ${TYPE_COLORS[q.type] ?? 'bg-gray-100'}`}>{TYPE_LABELS[q.type] ?? q.type}</Badge>}
              <Badge variant="outline" className="text-xs">{q.points} pt{q.points > 1 ? 's' : ''}</Badge>
            </div>
            <p className="text-sm font-medium text-gray-800 line-clamp-2">{q.text}</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-emerald-100 pt-3">
          <p className="text-sm text-gray-700 leading-relaxed">{q.text}</p>
          {q.options && q.options.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-emerald-700">Options :</p>
              {q.options.map((opt, j) => <p key={j} className="text-xs text-gray-600 pl-2">{opt}</p>)}
            </div>
          )}
          {q.answer_hint && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1"><CheckCircle className="h-3 w-3 inline mr-1" />Éléments de réponse</p>
              <p className="text-xs text-emerald-600 leading-relaxed">{q.answer_hint}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExamImprovementSection({ proposals, courseId, examId }: Props) {
  const [expanded, setExpanded] = useState<number[]>([0]);
  const [showAll, setShowAll] = useState(false);
  const [focus, setFocus] = useState<'bloom' | 'aa' | 'difficulty' | 'practical'>('aa');
  const [count, setCount] = useState(5);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);

  const generator = useGenerateExamQuestions(courseId);

  const toggle = (i: number) =>
    setExpanded(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

  const displayed = showAll ? proposals : proposals.slice(0, 3);

  const handleGenerate = () => {
    generator.mutate({ examId, count, focus }, {
      onSuccess: (qs) => setGeneratedQuestions(qs),
    });
  };

  return (
    <div className="space-y-6">
      {/* Propositions IA issues de l'analyse */}
      {proposals && proposals.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1 w-6 rounded-full bg-violet-500" />
              <h3 className="text-base font-semibold">✨ Propositions d&apos;amélioration</h3>
            </div>
            <Badge variant="outline" className="text-xs">
              {proposals.length} question{proposals.length > 1 ? 's' : ''} suggérée{proposals.length > 1 ? 's' : ''}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Générées par <span className="font-semibold text-violet-600">Gemini 2.5 Pro</span> pour harmoniser l&apos;épreuve selon les AA ciblés et l&apos;équilibre cognitif souhaité.
          </p>
          <div className="space-y-3">
            {displayed.map((p, i) => (
              <ProposalCard key={i} p={p} i={i} expanded={expanded.includes(i)} onToggle={() => toggle(i)} />
            ))}
          </div>
          {proposals.length > 3 && (
            <button type="button" onClick={() => setShowAll(s => !s)}
              className="w-full text-xs text-bolt-accent hover:underline py-1">
              {showAll ? '▲ Afficher moins'
                : `▼ Voir les ${proposals.length - 3} autre${proposals.length - 3 > 1 ? 's' : ''} proposition${proposals.length - 3 > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {/* Générateur de questions supplémentaires */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-emerald-800">Générer des questions supplémentaires</h3>
          <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Gemini 2.5 Pro</Badge>
        </div>
        <p className="text-xs text-emerald-700">Utilisez le modèle Gemini le plus puissant pour créer de nouvelles questions ciblées selon les lacunes détectées.</p>

        {/* Focus */}
        <div className="grid grid-cols-2 gap-2">
          {FOCUS_OPTIONS.map(opt => (
            <button key={opt.key} type="button"
              onClick={() => setFocus(opt.key)}
              className={`rounded-lg border p-2.5 text-left transition-all ${
                focus === opt.key
                  ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                  : 'border-bolt-line bg-white text-muted-foreground hover:border-emerald-200'
              }`}>
              <p className="text-xs font-semibold">{opt.label}</p>
              <p className="text-xs opacity-70 mt-0.5 hidden sm:block">{opt.desc}</p>
            </button>
          ))}
        </div>

        {/* Nombre */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground shrink-0">Nombre de questions :</span>
          <div className="flex items-center gap-1">
            {[3, 5, 7, 10].map(n => (
              <button key={n} type="button"
                onClick={() => setCount(n)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                  count === n ? 'bg-emerald-500 text-white' : 'border border-bolt-line text-muted-foreground hover:border-emerald-300'
                }`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={generator.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto">
          {generator.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gemini 2.5 Pro en cours...</>
            : <><Sparkles className="h-4 w-4 mr-2" />Générer {count} question{count > 1 ? 's' : ''}</>}
        </Button>
      </div>

      {/* Questions générées */}
      {generatedQuestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1 w-6 rounded-full bg-emerald-500" />
              <h3 className="text-base font-semibold">Questions générées</h3>
            </div>
            <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 border">
              {generatedQuestions.length} question{generatedQuestions.length > 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="space-y-3">
            {generatedQuestions.map((q, i) => <GeneratedCard key={i} q={q} i={i} />)}
          </div>
        </div>
      )}
    </div>
  );
}
