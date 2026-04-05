'use client';



import React from 'react';

import { useParams, useRouter } from 'next/navigation';

import { useState, useCallback, useEffect } from 'react';

import {

  useTnExam,

  useAnalyzeTnExam,

  useSaveTnExamAnalysis,

  useTnExamValidation,

  useCourse,

  useGenerateCurativeQuestions,

} from '@/lib/hooks/useCourses';

import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';

import { Skeleton } from '@/components/ui/skeleton';

import { Progress } from '@/components/ui/progress';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableHeader,

  TableRow,

} from '@/components/ui/table';

import { Input } from '@/components/ui/input';

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from '@/components/ui/select';

import {

  ArrowLeft,

  Brain,

  FileBarChart2,

  Play,

  Save,

  RotateCcw,

  Download,

  CheckCircle2,

  XCircle,

  AlertTriangle,

  Clock,

  BookOpen,

  Target,

  Loader2,

  Zap,

  Lightbulb,

  BarChart3,

  Bot,

  FileCode2,

  ChevronDown,

  ChevronUp,

  Upload,

  Pencil,

  FileText,

  Calculator,

  Laptop,

  Wifi,

  Users,

  Calendar,

  Globe,
  GraduationCap,
  Wand2,

} from 'lucide-react';

import {

  Chart as ChartJS,

  CategoryScale,

  LinearScale,

  BarElement,

  ArcElement,

  RadialLinearScale,

  PointElement,

  LineElement,

  Title,

  Tooltip as ChartTooltip,

  Legend as ChartLegend,

  Filler,

} from 'chart.js';

import { Bar as ChartBar, Doughnut, PolarArea, Radar } from 'react-chartjs-2';



ChartJS.register(

  CategoryScale, LinearScale, BarElement, ArcElement,

  RadialLinearScale, PointElement, LineElement,

  Title, ChartTooltip, ChartLegend, Filler

);

import { format } from 'date-fns';

import { fr } from 'date-fns/locale';

import { toast } from 'sonner';

import {

  TnExamDocument,

  TnExamQuestion,

  ValidationCriterion,

  ExamHeaderData,

  ExtractedQuestion,

  QuestionSourceMatch,

  ProposedQuestion,

  ExerciseGenConfig,

} from '@/lib/types/course';

import { ExamLatexEditor } from '@/components/courses/ExamLatexEditor';

import { ExamMCPPanel } from '@/components/courses/ExamMCPPanel';
import { CorrectionTab } from '@/components/courses/CorrectionTab';

import { tnExamsApi } from '@/lib/api/courses';



// ─── Constants ────────────────────────────────────────────────────────────────────────────



const BLOOM_LEVELS = [

  'Mémoriser',

  'Comprendre',

  'Appliquer',

  'Analyser',

  'Évaluer',

  'Créer',

];

const DIFFICULTIES = ['Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile'];

const QUESTION_TYPES = ['QCM', 'Ouvert', 'Pratique', 'Vrai/Faux', 'Calcul', 'Étude de cas'];



const BLOOM_COLORS: Record<string, string> = {

  Mémoriser: '#3b82f6',

  Comprendre: '#22c55e',

  Appliquer: '#eab308',

  Analyser: '#f97316',

  Évaluer: '#ef4444',

  Créer: '#a855f7',

  // legacy aliases

  Mémorisation: '#3b82f6',

  Compréhension: '#22c55e',

  Application: '#eab308',

  Analyse: '#f97316',

  Évaluation: '#ef4444',

  Création: '#a855f7',

};

const DIFF_COLORS: Record<string, string> = {

  'Très facile': '#22c55e',

  Facile: '#86efac',

  Moyen: '#eab308',

  Difficile: '#f97316',

  'Très difficile': '#ef4444',

  // legacy aliases

  Fondamental: '#22c55e',

  Intermédiaire: '#eab308',

  Avancé: '#ef4444',

};



const PIE_PALETTE = [

  '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#eab308',

  '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#6366f1',

];



// ─── Analysis Progress Steps ──────────────────────────────────────────────────────────────────────────────



const ANALYSIS_STEPS = [

  { label: 'Extraction du texte PDF', icon: '\ud83d\udcc4' },

  { label: 'Identification des questions', icon: '\u2753' },

  { label: 'Extraction des barèmes', icon: '\u2696\ufe0f' },

  { label: 'Classification Bloom', icon: '\ud83e\udde0' },

  { label: "Alignement Acquis d'Apprentissage", icon: '\ud83c\udfaf' },

  { label: 'Évaluation de la difficulté', icon: '\ud83d\udcca' },

  { label: 'Estimation des durées', icon: '\u23f1\ufe0f' },

  { label: 'Vérification des sources documentaires', icon: '\ud83d\udcda' },

  { label: 'Génération des recommandations', icon: '\ud83d\udca1' },

  { label: 'Compilation des résultats', icon: '\u2705' },

];



// ─── Helpers ──────────────────────────────────────────────────────────────────────────────────



function StatusBadge({ status }: { status: 'PASS' | 'WARNING' | 'FAIL' }) {

  if (status === 'PASS')

    return (

      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">

        <CheckCircle2 className="h-3 w-3" /> OK

      </Badge>

    );

  if (status === 'WARNING')

    return (

      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1">

        <AlertTriangle className="h-3 w-3" /> Avertissement

      </Badge>

    );

  return (

    <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">

      <XCircle className="h-3 w-3" /> Échec

    </Badge>

  );

}



// Converts an ExtractedQuestion (from QuestionsTab) to TnExamQuestion (used by AnalyseAITab)
function convertExtractedToTnExam(q: ExtractedQuestion): TnExamQuestion {
  return {
    id: q.id,
    text: q.text,
    points: q.points ?? undefined,
    Bloom_Level: q.bloom_level,
    Difficulty: q.difficulty,
    Type: q.question_type,
    estimated_time_min: q.estimated_time_min ?? undefined,
  };
}



function DifficultyBadge({ value }: { value?: string }) {

  const colors: Record<string, string> = {

    'Très facile': 'bg-green-100 text-green-800',

    Facile: 'bg-emerald-100 text-emerald-800',

    Moyen: 'bg-yellow-100 text-yellow-800',

    Difficile: 'bg-orange-100 text-orange-800',

    'Très difficile': 'bg-red-100 text-red-800',

    // legacy

    Fondamental: 'bg-green-100 text-green-800',

    Intermédiaire: 'bg-yellow-100 text-yellow-800',

    Avancé: 'bg-red-100 text-red-800',

  };

  return (

    <Badge variant="outline" className={colors[value ?? ''] ?? ''}>

      {value ?? '—'}

    </Badge>

  );

}



// ─── Analysis Progress Overlay ───────────────────────────────────────────────────────────────────────────────────────



function AnalysisProgressOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {

  const [step, setStep] = useState(0);



  useEffect(() => {

    if (!visible) {

      setStep(0);

      return;

    }

    const DELAYS = [0, 2000, 4500, 7000, 10000, 13000, 15500, 18000, 21000, 24000];

    const timers = DELAYS.map((d, i) => setTimeout(() => setStep(i + 1), d));

    return () => timers.forEach(clearTimeout);

  }, [visible]);



  if (!visible) return null;



  const progress = Math.round((step / ANALYSIS_STEPS.length) * 100);



  return (

    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border relative">

        {/* Close button */}

        <button

          onClick={onClose}

          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"

          title="Fermer"

        >

          <XCircle className="h-5 w-5" />

        </button>



                <div className="flex items-center gap-3 mb-5">

          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">

            <Brain className="h-5 w-5 text-primary animate-pulse" />

          </div>

          <div>

            <h3 className="font-semibold">Analyse IA en cours</h3>

            <p className="text-xs text-muted-foreground">Veuillez patienter…</p>

          </div>

        </div>



        <Progress value={progress} className="h-2 mb-5" />



        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">

          {ANALYSIS_STEPS.map((s, i) => {

            const done = i < step;

            const active = i === step;

            return (

              <div

                key={i}

                className={`flex items-center gap-3 text-sm transition-all ${

                  done

                    ? 'text-green-700'

                    : active

                    ? 'text-primary font-medium'

                    : 'text-muted-foreground'

                }`}

              >

                <span className="text-base w-6 text-center">

                  {done ? '\u2705' : active ? '\u23f3' : s.icon}

                </span>

                <span className={done ? 'line-through opacity-60' : ''}>{s.label}</span>

                {active && <Loader2 className="h-3 w-3 animate-spin ml-auto shrink-0" />}

              </div>

            );

          })}

        </div>



        <p className="text-xs text-center text-muted-foreground mt-4">

          {progress}% — Cette opération peut prendre 30 à 60 secondes

        </p>

        <p className="text-xs text-center text-muted-foreground mt-1">

          Vous pouvez fermer ce panneau — l&apos;analyse continue en arrière-plan.

        </p>

      </div>

    </div>

  );

}



// \u2500\u2500\u2500 Inline Charts (Chart.js) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** Bloom horizontal bar chart using Chart.js */
function BloomBarChart({ data }: { data: Record<string, number> }) {
  const ORDER = ['Mémoriser', 'Comprendre', 'Appliquer', 'Analyser', 'Évaluer', 'Créer'];
  const labels = ORDER.filter((k) => data[k] != null);
  const values = labels.map((k) => data[k] ?? 0);
  const colors = labels.map((k) => BLOOM_COLORS[k] ?? '#6b7280');

  if (!labels.length) return null;

  const chartData = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors.map(c => c + 'cc'),
      borderColor: colors,
      borderWidth: 1.5,
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  const options: any = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.parsed.x}% des questions`,
        },
      },
    },
    scales: {
      x: {
        min: 0, max: 100,
        ticks: { callback: (v: any) => `${v}%`, font: { size: 11 } },
        grid: { color: '#f3f4f6' },
      },
      y: { ticks: { font: { size: 12, weight: 600 } }, grid: { display: false } },
    },
  };

  return (
    <div style={{ height: labels.length * 44 + 20 }}>
      <ChartBar data={chartData} options={options} />
    </div>
  );
}

/** HOT vs LOT doughnut */
function HOTLOTChart({ data }: { data: Record<string, number> }) {
  const LOT_KEYS = ['Mémoriser', 'Comprendre', 'Appliquer', 'Mémorisation', 'Compréhension', 'Application'];
  const HOT_KEYS = ['Analyser', 'Évaluer', 'Créer', 'Analyse', 'Évaluation', 'Création'];
  const lot = Object.entries(data).filter(([k]) => LOT_KEYS.includes(k)).reduce((s, [, v]) => s + v, 0);
  const hot = Object.entries(data).filter(([k]) => HOT_KEYS.includes(k)).reduce((s, [, v]) => s + v, 0);
  const total = lot + hot;
  if (total === 0) return <p className="text-xs text-muted-foreground italic text-center py-8">Donn\xe9es insuffisantes</p>;

  const lotPct = Math.round((lot / total) * 100);
  const hotPct = 100 - lotPct;

  const chartData = {
    labels: [`LOT (${lotPct}%)`, `HOT (${hotPct}%)`],
    datasets: [{
      data: [lotPct, hotPct],
      backgroundColor: ['#60a5fa99', '#a855f799'],
      borderColor: ['#3b82f6', '#9333ea'],
      borderWidth: 2,
      hoverOffset: 8,
    }],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
      tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed}%` } },
    },
  };

  return (
    <div className="relative" style={{ height: 200 }}>
      <Doughnut data={chartData} options={options} />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: '-10px' }}>
        <span className="text-xl font-bold text-purple-700">{hotPct}%</span>
        <span className="text-[10px] text-muted-foreground font-medium">HOT</span>
      </div>
    </div>
  );
}

/** Difficulty doughnut */
function DifficultyDonut({ data }: { data: Record<string, number> }) {
  const ORDER = ['Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile'];
  const labels = ORDER.filter((k) => data[k] != null && data[k] > 0);
  if (!labels.length) return null;

  const values = labels.map((k) => data[k]);
  const colors = labels.map((k) => DIFF_COLORS[k] ?? '#6b7280');

  const chartData = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors.map((c) => c + 'cc'),
      borderColor: colors,
      borderWidth: 2,
      hoverOffset: 8,
    }],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } },
      tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed}%` } },
    },
  };

  const dominant = labels.reduce((a, b) => (data[b] > data[a] ? b : a), labels[0]);

  return (
    <div className="relative" style={{ height: 200 }}>
      <Doughnut data={chartData} options={options} />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: '-20px' }}>
        <span className="text-xs font-semibold" style={{ color: DIFF_COLORS[dominant] }}>{dominant}</span>
        <span className="text-lg font-bold" style={{ color: DIFF_COLORS[dominant] }}>{data[dominant]}%</span>
      </div>
    </div>
  );
}

/** Question types doughnut */
function TypeDonut({ data }: { data: Record<string, number> }) {
  const TYPE_COLORS: Record<string, string> = {
    'QCM': '#3b82f6', 'MCQ': '#3b82f6',
    'Ouvert': '#22c55e', 'Short Answer': '#22c55e', 'Essay': '#22c55e',
    'Pratique': '#f97316', 'Practical': '#f97316',
    'Calcul': '#a855f7',
    'Vrai/Faux': '#eab308',
    'Étude de cas': '#06b6d4', 'Case Study': '#06b6d4',
    'Rédactionnel': '#ec4899',
  };

  const labels = Object.keys(data).filter((k) => data[k] > 0);
  if (!labels.length) return null;

  const values = labels.map((k) => data[k]);
  const colors = labels.map((k, i) => TYPE_COLORS[k] ?? PIE_PALETTE[i % PIE_PALETTE.length]);

  const chartData = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors.map((c) => c + 'cc'),
      borderColor: colors,
      borderWidth: 2,
      hoverOffset: 8,
    }],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } },
      tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed}%` } },
    },
  };

  return (
    <div className="relative" style={{ height: 200 }}>
      <Doughnut data={chartData} options={options} />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: '-20px' }}>
        <span className="text-xs text-muted-foreground">Types</span>
        <span className="text-lg font-bold">{labels.length}</span>
      </div>
    </div>
  );
}

/** AA per-question coverage - horizontal bar */
function AAAlignmentChart({
  aaPercentages,
  aaMissing,
}: {
  aaPercentages: Record<string, number>;
  aaMissing: number[];
}) {
  const coveredNums = Object.keys(aaPercentages).map(Number).sort((a, b) => a - b);
  const allNums = [...new Set([...coveredNums, ...aaMissing])].sort((a, b) => a - b);
  if (!allNums.length) return null;

  const labels = allNums.map((n) => `AA#${n}`);
  const values = allNums.map((n) => aaPercentages[String(n)] ?? 0);
  const bgColors = allNums.map((n) =>
    (aaPercentages[String(n)] ?? 0) === 0 ? '#fca5a599' : '#4ade8099'
  );
  const borderColors = allNums.map((n) =>
    (aaPercentages[String(n)] ?? 0) === 0 ? '#ef4444' : '#22c55e'
  );

  const chartData = {
    labels,
    datasets: [{
      label: 'Couverture (%)',
      data: values,
      backgroundColor: bgColors,
      borderColor: borderColors,
      borderWidth: 1.5,
      borderRadius: 5,
      borderSkipped: false,
    }],
  };

  const options: any = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            ctx.parsed.x === 0 ? ' Non couvert \u2717' : ` ${ctx.parsed.x}% des questions`,
        },
      },
    },
    scales: {
      x: {
        min: 0, max: 100,
        ticks: { callback: (v: any) => `${v}%`, font: { size: 11 } },
        grid: { color: '#f3f4f6' },
      },
      y: { ticks: { font: { size: 12, weight: 600 } }, grid: { display: false } },
    },
  };

  return (
    <div style={{ height: allNums.length * 42 + 30 }}>
      <ChartBar data={chartData} options={options} />
    </div>
  );
}

/** AA Comparison: course importance vs exam coverage */
function AAComparisonChart({
  aaPercentages,
  aaMissing,
  aaDistribution,
}: {
  aaPercentages: Record<string, number>;
  aaMissing: number[];
  aaDistribution: Array<{ number: number; description: string; percent: number }>;
}) {
  const allNums = [...new Set([
    ...Object.keys(aaPercentages).map(Number),
    ...aaMissing,
    ...aaDistribution.map((d) => d.number),
  ])].sort((a, b) => a - b);

  if (!allNums.length) return null;

  const labels = allNums.map((n) => `AA#${n}`);
  const courseImportance = allNums.map((n) => aaDistribution.find((d) => d.number === n)?.percent ?? 0);
  const examCoverage = allNums.map((n) => aaPercentages[String(n)] ?? 0);
  const examColors = allNums.map((n) => {
    const cv = aaPercentages[String(n)] ?? 0;
    const ci = aaDistribution.find((d) => d.number === n)?.percent ?? 0;
    if (cv === 0) return '#fca5a599';
    return Math.abs(cv - ci) <= 12 ? '#4ade8099' : '#fb923c99';
  });
  const examBorders = allNums.map((n) => {
    const cv = aaPercentages[String(n)] ?? 0;
    const ci = aaDistribution.find((d) => d.number === n)?.percent ?? 0;
    if (cv === 0) return '#ef4444';
    return Math.abs(cv - ci) <= 12 ? '#22c55e' : '#f97316';
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Importance cours',
        data: courseImportance,
        backgroundColor: '#93c5fd88',
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: "Couverture épreuve",
        data: examCoverage,
        backgroundColor: examColors,
        borderColor: examBorders,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  const descriptions = Object.fromEntries(allNums.map((n) => {
    const d = aaDistribution.find((x) => x.number === n);
    return [`AA#${n}`, d?.description ?? ''];
  }));

  const options: any = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { font: { size: 11 }, padding: 12, boxWidth: 12, boxHeight: 8 },
      },
      tooltip: {
        callbacks: {
          title: (items: any[]) => {
            const label = items[0]?.label ?? '';
            const desc = descriptions[label];
            return desc ? `${label}: ${desc.slice(0, 60)}\u2026` : label;
          },
          label: (ctx: any) =>
            ` ${ctx.dataset.label}: ${ctx.parsed.x}%`,
        },
      },
    },
    scales: {
      x: {
        min: 0, max: 100,
        ticks: { callback: (v: any) => `${v}%`, font: { size: 11 } },
        grid: { color: '#f3f4f6' },
      },
      y: { ticks: { font: { size: 12, weight: 600 } }, grid: { display: false } },
    },
  };

  const aligned = allNums.filter((n) => {
    const cv = aaPercentages[String(n)] ?? 0;
    const ci = aaDistribution.find((d) => d.number === n)?.percent ?? 0;
    return cv > 0 && Math.abs(cv - ci) <= 12;
  }).length;

  return (
    <div>
      <div style={{ height: allNums.length * 52 + 50 }}>
        <ChartBar data={chartData} options={options} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
        <div className="rounded-lg bg-green-50 border border-green-100 p-2">
          <p className="font-bold text-green-700 text-base">{aligned}</p>
          <p className="text-muted-foreground">AA alignés</p>
        </div>
        <div className="rounded-lg bg-orange-50 border border-orange-100 p-2">
          <p className="font-bold text-orange-700 text-base">
            {allNums.filter((n) => { const cv = aaPercentages[String(n)] ?? 0; const ci = aaDistribution.find(d=>d.number===n)?.percent??0; return cv>0 && Math.abs(cv-ci)>12; }).length}
          </p>
          <p className="text-muted-foreground">AA avec écart</p>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-100 p-2">
          <p className="font-bold text-red-700 text-base">{aaMissing.length}</p>
          <p className="text-muted-foreground">AA non couverts</p>
        </div>
      </div>
    </div>
  );
}

/** Bloom stacked bar strip */
function BloomStackedBar({ data }: { data: Record<string, number> }) {
  const BLOOM_BG: Record<string, string> = {
    'Mémorisation': 'bg-blue-400', 'Mémoriser': 'bg-blue-400',
    'Compréhension': 'bg-green-400', 'Comprendre': 'bg-green-400',
    'Application': 'bg-yellow-400', 'Appliquer': 'bg-yellow-400',
    'Analyse': 'bg-orange-400', 'Analyser': 'bg-orange-400',
    'Évaluation': 'bg-red-400', 'Évaluer': 'bg-red-400',
    'Création': 'bg-purple-400', 'Créer': 'bg-purple-400',
  };
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex rounded-full overflow-hidden h-3 gap-px">
        {entries.map(([name, value]) => (
          <div key={name} className={`${BLOOM_BG[name] ?? 'bg-gray-400'} transition-all`}
            style={{ width: `${value}%` }} title={`${name}: ${value}%`} />
        ))}
      </div>
    </div>
  );
}

// ─── New evaluation charts ──────────────────────────────────────────────────

function DurationBarChart({ estimated, buffer, declared }: {
  estimated: number; buffer: number; declared: number | null;
}) {
  const datasets: any[] = [
    { label: 'Estimée', data: [estimated], backgroundColor: '#3b82f699', borderColor: '#3b82f6', borderWidth: 2, borderRadius: 6 },
    { label: 'Avec marge (+10%)', data: [buffer], backgroundColor: '#f9731699', borderColor: '#f97316', borderWidth: 2, borderRadius: 6 },
  ];
  if (declared != null) datasets.push({ label: 'Déclarée', data: [declared], backgroundColor: '#22c55e99', borderColor: '#22c55e', borderWidth: 2, borderRadius: 6 });
  return (
    <ChartBar
      data={{ labels: ['Durée (minutes)'], datasets }}
      options={{
        indexAxis: 'y' as const, responsive: true,
        plugins: { legend: { position: 'bottom' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw} min` } } },
        scales: { x: { beginAtZero: true, title: { display: true, text: 'Minutes' } } },
      }}
      height={110}
    />
  );
}

function PointsPerExerciseChart({ questions }: { questions: any[] }) {
  const ex: Record<string, number> = {};
  questions.forEach((q) => {
    const t = (q as any).exercise_title ?? `Exercice ${(q as any).exercise_number ?? 1}`;
    ex[t] = (ex[t] ?? 0) + ((q as any).points ?? 0);
  });
  const labels = Object.keys(ex);
  const data = Object.values(ex);
  if (!labels.length) return null;
  return (
    <ChartBar
      data={{ labels, datasets: [{ label: 'Points', data, backgroundColor: PIE_PALETTE.slice(0, labels.length).map((c) => c + '99'), borderColor: PIE_PALETTE.slice(0, labels.length), borderWidth: 2, borderRadius: 6 }] }}
      options={{ responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.raw} pts` } } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Points' } } } }}
      height={200}
    />
  );
}

const IDEAL_DIFFICULTY: Record<string, number> = { 'Très facile': 10, Facile: 20, Moyen: 40, Difficile: 20, 'Très difficile': 10 };

function DifficultyBalanceChart({ data }: { data: Record<string, number> }) {
  const labels = Object.keys(IDEAL_DIFFICULTY);
  return (
    <ChartBar
      data={{ labels, datasets: [
        { label: 'Répartition réelle', data: labels.map((l) => data[l] ?? 0), backgroundColor: '#3b82f699', borderColor: '#3b82f6', borderWidth: 2, borderRadius: 4 },
        { label: 'Distribution idéale', data: labels.map((l) => IDEAL_DIFFICULTY[l]), backgroundColor: '#22c55e44', borderColor: '#22c55e', borderWidth: 2, borderRadius: 4 },
      ] }}
      options={{ responsive: true, plugins: { legend: { position: 'bottom' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw}%` } } }, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '%' } } } }}
      height={220}
    />
  );
}

function BloomRadarChart({ bloomPercentages }: { bloomPercentages: Record<string, number> }) {
  const BLOOM_LABELS = ['Mémorisation', 'Compréhension', 'Application', 'Analyse', 'Évaluation', 'Création'];
  const KEY_MAP: Record<string, string> = {
    'Mémorisation': 'Mémorisation', 'mémorisation': 'Mémorisation', 'Remember': 'Mémorisation', 'remember': 'Mémorisation',
    'Compréhension': 'Compréhension', 'compréhension': 'Compréhension', 'Understand': 'Compréhension', 'understand': 'Compréhension',
    'Application': 'Application', 'application': 'Application', 'Apply': 'Application', 'apply': 'Application',
    'Analyse': 'Analyse', 'analyse': 'Analyse', 'Analyze': 'Analyse', 'analyze': 'Analyse',
    'Évaluation': 'Évaluation', 'évaluation': 'Évaluation', 'Evaluate': 'Évaluation', 'evaluate': 'Évaluation',
    'Création': 'Création', 'création': 'Création', 'Create': 'Création', 'create': 'Création',
  };
  const normalized: Record<string, number> = {};
  for (const [k, v] of Object.entries(bloomPercentages)) {
    const mapped = KEY_MAP[k] ?? k;
    normalized[mapped] = (normalized[mapped] ?? 0) + v;
  }
  const data = BLOOM_LABELS.map((l) => normalized[l] ?? 0);
  return (
    <Radar
      data={{
        labels: BLOOM_LABELS,
        datasets: [{
          label: 'Bloom (%)', data,
          backgroundColor: 'rgba(99,102,241,0.18)',
          borderColor: '#6366f1', borderWidth: 2,
          pointBackgroundColor: '#6366f1', pointRadius: 4,
        }],
      }}
      options={{
        responsive: true,
        scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20, font: { size: 10 } }, pointLabels: { font: { size: 11 } } } },
        plugins: { legend: { display: false } },
      }}
    />
  );
}

function SourceCoverageDonut({ rate }: { rate: number }) {
  const pct = Math.min(100, Math.round(rate > 1 ? rate : rate * 100));
  return (
    <div className="relative flex justify-center">
      <div style={{ maxWidth: 200 }}>
        <Doughnut
          data={{ labels: ['Avec sources', 'Sans sources'], datasets: [{ data: [pct, 100 - pct], backgroundColor: ['#22c55e99', '#e2e8f0'], borderColor: ['#22c55e', '#cbd5e1'], borderWidth: 2 }] }}
          options={{ cutout: '70%', responsive: true, plugins: { legend: { position: 'bottom' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.raw}%` } } } }}
        />
        <div className="absolute inset-0 flex items-center justify-center pb-6">
          <div className="text-center"><p className="text-2xl font-bold">{pct}%</p><p className="text-[10px] text-muted-foreground">sources</p></div>
        </div>
      </div>
    </div>
  );
}

// ─── LaTeX builder (based on template.tex structure) ──────────────────────────────────────────



function escapeLatex(str: string): string {

  return str

    .replace(/\\/g, '\\textbackslash{}')

    .replace(/&/g, '\\&')

    .replace(/%/g, '\\%')

    .replace(/\$/g, '\\$')

    .replace(/#/g, '\\#')

    .replace(/_/g, '\\_')

    .replace(/\{/g, '\\{')

    .replace(/\}/g, '\\}')

    .replace(/~/g, '\\textasciitilde{}')

    .replace(/\^/g, '\\textasciicircum{}');

}



function boolToYesNo(val: boolean | null | undefined): string {

  if (val === true) return '\\ding{51}~Oui';

  if (val === false) return '\\ding{55}~Non';

  return '\\ding{113}~Oui \\quad \\ding{113}~Non';

}



function buildLatexFromQuestions(

  examTitle: string,

  meta: Record<string, any>,

  questions: any[]

): string {

  // Group by exercise

  const groups: Record<number, { title: string; qs: any[] }> = {};

  for (const q of questions) {

    const exNum = q.exercise_number ?? 1;

    const exTitle = q.exercise_title ?? `Exercice ${exNum}`;

    if (!groups[exNum]) groups[exNum] = { title: exTitle, qs: [] };

    groups[exNum].qs.push(q);

  }

  const sortedKeys = Object.keys(groups).map(Number).sort();



  const courseName = escapeLatex(meta.exam_name ?? examTitle);

  const className = escapeLatex(meta.class_name ?? '');

  const language = escapeLatex(meta.language ?? 'Français');

  const duration = meta.declared_duration_min ? `${meta.declared_duration_min} min` : '';

  const examDate = escapeLatex(meta.exam_date ?? '');

  const instructors = Array.isArray(meta.instructors)

    ? escapeLatex(meta.instructors.join(', '))

    : escapeLatex(meta.instructors ?? '');



  const exercises = sortedKeys.map((exNum) => {

    const { title, qs } = groups[exNum];

    const exPoints = qs.reduce((s: number, q: any) => s + (parseFloat(q.points) || 0), 0);

    const items = qs.map((q: any) => {

      const text = escapeLatex((q['Text'] ?? q.text ?? q.question_text ?? '(question)').trim());

      const pts = q.points != null && q.points > 0

        ? ` \\hfill(${q.points} pt${q.points > 1 ? 's' : ''})`

        : '';

      return `  \\item ${text}${pts}`;

    }).join('\n');

    const sectionTitle = escapeLatex(title) + (exPoints > 0 ? ` — ${exPoints} pts` : '');

    return `\\section*{${sectionTitle}}\n\n\\begin{enumerate}[label=\\textbf{\\arabic*.}]\n${items}\n\\end{enumerate}`;

  });



  const totalPts = questions.reduce((s: number, q: any) => s + (parseFloat(q.points) || 0), 0);



  return `\\documentclass[11pt,a4paper]{article}



%=================================

% ENCODAGE ET LANGUE

%=================================

\\usepackage[T1]{fontenc}

\\usepackage[utf8]{inputenc}

\\usepackage[french]{babel}



%=================================

% PACKAGES

%=================================

\\usepackage{geometry}

\\usepackage{array}

\\usepackage{fancyhdr}

\\usepackage{lastpage}

\\usepackage{graphicx}

\\usepackage[table]{xcolor}

\\usepackage{tabularx}

\\usepackage{booktabs}

\\usepackage{tikzpagenodes}

\\usepackage{eso-pic}

\\usepackage{helvet}

\\usepackage{pifont}

\\usepackage{enumitem}

\\usepackage{amsmath,amssymb}

\\renewcommand{\\familydefault}{\\sfdefault}



%=================================

% MISE EN PAGE

%=================================

\\geometry{top=2cm,bottom=2cm,left=2cm,right=2cm}

\\renewcommand{\\arraystretch}{1.5}

\\setlength{\\arrayrulewidth}{0.6pt}

\\setlength{\\parindent}{0pt}



%=================================

% COULEURS CHARTE

%=================================

\\definecolor{schoolgray}{RGB}{80,80,80}

\\definecolor{schoollightgray}{RGB}{245,245,245}

\\definecolor{schoolred}{RGB}{128,24,40}

\\definecolor{schoolborder}{RGB}{180,180,180}



%=================================

% MACROS

%=================================

\\newcommand{\\yesbox}{\\ding{113}~Oui \\quad \\ding{113}~Non}

\\newcommand{\\institutionname}{\\textbf{ESPRIT SCHOOL OF BUSINESS}}

\\newcommand{\\facultyname}{\\textit{Examination Department}}



%=================================

% HEADER GRAPHICS

%=================================

\\AddToShipoutPictureBG*{%

  \\AtPageUpperLeft{%

    \\begin{tikzpicture}[remember picture,overlay]

      \\fill[schoolred] (0,0) rectangle (\\paperwidth,-0.5cm);

      \\fill[schoolgray] (0,-0.5cm) rectangle (\\paperwidth,-0.9cm);

    \\end{tikzpicture}%

  }%

}



%=================================

% FOOTER

%=================================

\\pagestyle{fancy}

\\fancyhf{}

\\rhead{\\textcolor{schoolgray}{\\small Page \\thepage\\,/\\pageref{LastPage}}}

\\renewcommand{\\headrulewidth}{0pt}



\\begin{document}



%=================================

% HEADER

%=================================



\\vspace*{-0.7cm}



\\noindent

\\begin{minipage}[c]{0.18\\textwidth}

    % \\includegraphics[width=\\linewidth]{Logo.png}

\\end{minipage}

\\hfill

\\begin{minipage}[c]{0.78\\textwidth}

    {\\color{schoolred}\\fontsize{18}{20}\\selectfont\\bfseries \\institutionname}\\\\[0.3em]

    {\\color{schoolgray}\\large \\facultyname}\\\\[0.4em]

    {\\color{schoolgray}Semester \\underline{\\hspace{1.5cm}} \\quad Session \\underline{\\hspace{1.5cm}} \\quad Year \\underline{\\hspace{1.5cm}}}

\\end{minipage}



\\vspace{0.4em}



{\\color{schoolred}\\rule{\\textwidth}{1.2pt}}

\\vspace{0.4em}

{\\color{schoolborder}\\rule{\\textwidth}{0.5pt}}



\\vspace{1em}



\\begin{center}

    {\\Large\\bfseries\\color{schoolgray}EXAM / EXAMEN}

\\end{center}



\\vspace{1em}



%=================================

% TABLE 1 — EXAM INFO

%=================================



{\\rowcolors{2}{schoollightgray}{white}

\\begin{tabularx}{\\textwidth}{|>{\\bfseries\\color{schoolgray}}p{0.4\\textwidth}|X|}

\\hline

Course / Cours & ${courseName} \\\\ \\hline

Class / Classe & ${className} \\\\ \\hline

Language / Langue & ${language} \\\\ \\hline

Duration / Dur\\'ee & ${duration} \\\\ \\hline

Date & ${examDate} \\\\ \\hline

Instructor(s) & ${instructors} \\\\ \\hline

\\end{tabularx}}



\\vspace{0.4em}



%=================================

% TABLE 2 — CONDITIONS

%=================================



{\\rowcolors{2}{schoollightgray}{white}

\\begin{tabularx}{\\textwidth}{|>{\\bfseries\\color{schoolgray}}p{0.4\\textwidth}|X|}

\\hline

Answer on exam sheet & ${boolToYesNo(meta.answer_on_sheet)} \\\\ \\hline

Documents allowed & ${boolToYesNo(meta.documents_allowed)} \\\\ \\hline

Calculator allowed & ${boolToYesNo(meta.calculator_allowed)} \\\\ \\hline

Computer allowed & ${boolToYesNo(meta.computer_allowed)} \\\\ \\hline

Internet allowed & ${boolToYesNo(meta.internet_allowed)} \\\\ \\hline

Validated by all instructors & \\yesbox \\\\ \\hline

\\end{tabularx}}



\\vspace{1em}



%=================================

% STUDENT INFO

%=================================



{\\rowcolors{2}{schoollightgray}{white}

\\begin{tabularx}{\\textwidth}{|>{\\bfseries\\color{schoolgray}}p{0.3\\textwidth}|X|}

\\hline

Name / Nom & \\\\ \\hline

Student ID / Matricule & \\\\ \\hline

Group / Groupe & \\\\ \\hline

Room / Salle & \\\\ \\hline

Signature & \\\\ \\hline

\\end{tabularx}}



\\vspace{0.6em}



%=================================

% INSTRUCTIONS

%=================================



{\\color{schoolred}\\large\\bfseries Instructions / Consignes}



\\vspace{0.4em}

\\color{schoolgray}

\\begin{itemize}

    \\item Lire attentivement toutes les questions.

    \\item Aucun document sauf si autorisé.

    \\item Toute fraude entraîne l'exclusion immédiate.

\\end{itemize}

\\color{black}



\\vspace{1em}



%=================================

% EXERCISES

%=================================



${exercises.join('\n\n')}



${totalPts > 0 ? `\\vspace{2em}\n\\hrule\n\\vspace{0.5em}\n{\\small\\textbf{Total : ${totalPts} points}}` : ''}



\\end{document}`;

}





// ─── Curative Generation Section ────────────────────────────────────────────────────────────────────



function CurativeGenerationSection({
  courseId,
  examId,
  aaPercentages,
  aaMissing,
  bloomPercentages,
  recommendations,
  onAddToLatex,
  onOpenLatex,
  exercises = [],
}: {
  courseId: number;
  examId: number;
  aaPercentages: Record<string, number>;
  aaMissing: number[];
  bloomPercentages: Record<string, number>;
  recommendations: string[];
  onAddToLatex: (questionText: string) => void;
  onOpenLatex: () => void;
  exercises?: Array<{ exercise_number: number; exercise_title: string }>;
}) {
  // ---- Setup state ----
  const [exerciseTitle, setExerciseTitle] = useState('');
  const [exerciseMinutes, setExerciseMinutes] = useState(20);
  const [questionCount, setQuestionCount] = useState(3);
  const [context, setContext] = useState('');

  // Derive suggested values from recommendations / data
  const suggestedBloom = (() => {
    for (const reco of recommendations) {
      for (const level of BLOOM_LEVELS) {
        if (reco.toLowerCase().includes(level.toLowerCase())) return level;
      }
    }
    const entries = Object.entries(bloomPercentages);
    if (!entries.length) return 'Analyser';
    return entries.sort((a, b) => a[1] - b[1])[0][0];
  })();

  const suggestedDifficulty = (() => {
    for (const reco of recommendations) {
      for (const d of DIFFICULTIES) {
        if (reco.toLowerCase().includes(d.toLowerCase())) return d;
      }
    }
    return 'Moyen';
  })();

  // Default global settings (applied to all questions initially)
  const [globalBloom, setGlobalBloom] = useState(suggestedBloom);
  const [globalDifficulty, setGlobalDifficulty] = useState(suggestedDifficulty);
  const [globalAA, setGlobalAA] = useState<string>(
    aaMissing.length > 0 ? String(aaMissing[0]) : (Object.keys(aaPercentages)[0] ?? '')
  );
  const [globalType, setGlobalType] = useState('Ouvert');

  // Per-question editable state (populated after generation)
  const [qEdits, setQEdits] = useState<Array<{
    text: string;
    bloom_level: string;
    difficulty: string;
    question_type: string;
    aa: string;
  }>>([]);

  const [savedProposal, setSavedProposal] = useState(false);
  const generateMutation = useGenerateCurativeQuestions(courseId, examId);

  const allAAs = [
    ...aaMissing.map((n) => ({ value: String(n), label: `AA#${n} (manquant)`, isMissing: true })),
    ...Object.keys(aaPercentages)
      .filter((k) => !aaMissing.includes(Number(k)))
      .map((k) => ({ value: k, label: `AA#${k} (${aaPercentages[k]}%)`, isMissing: false })),
  ];

  // Sync qEdits when AI returns questions
  useEffect(() => {
    if (generateMutation.data?.questions) {
      setQEdits(
        generateMutation.data.questions.map((q: any) => ({
          text: q.text ?? '',
          bloom_level: q.bloom_level ?? globalBloom,
          difficulty: q.difficulty ?? globalDifficulty,
          question_type: q.question_type ?? globalType,
          aa: q.aa ? String(q.aa) : globalAA,
        }))
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateMutation.data]);

  const handleGenerate = () => {
    generateMutation.mutate({
      bloom_level: globalBloom,
      difficulty: globalDifficulty,
      target_aa: globalAA ? Number(globalAA) : undefined,
      question_type: globalType,
      context: context || undefined,
      count: questionCount,
      exercise_mode: 'new',
      exercise_minutes: exerciseMinutes,
    });
  };

  const handleInsertToLatex = () => {
    if (!qEdits.length) return;
    const title = exerciseTitle.trim() || `Exercice ${exercises.length + 1}`;
    const minutesLine = exerciseMinutes > 0 ? `\n\\textit{Durée estimée : ${exerciseMinutes} min}\n` : '';
    const items = qEdits.map((q) => `  \\item ${q.text}`).join('\n');
    const latexBlock = `\\section*{${title}}${minutesLine}\n\\begin{enumerate}\n${items}\n\\end{enumerate}\n`;
    onAddToLatex(latexBlock);
    onOpenLatex();
    toast.success('Exercice inséré dans le LaTeX');
  };

  const updateEdit = (i: number, field: string, val: string) =>
    setQEdits(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));

  return (
    <div className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-amber-50">
        <Zap className="h-4 w-4 text-amber-600" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">Génération curative — Nouvel exercice</h3>
          <p className="text-xs text-amber-700">Configurez l'exercice, générez les questions, puis insérez dans le LaTeX</p>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5">
            <p className="text-xs font-semibold text-amber-700 mb-1">💡 Lacunes détectées :</p>
            <ul className="space-y-0.5">
              {recommendations.slice(0, 3).map((r, i) => (
                <li key={i} className="text-xs text-amber-700 flex gap-1.5">
                  <span className="shrink-0">•</span><span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* === STEP 1: Exercise setup === */}
        <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/50">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">① Paramètres de l'exercice</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className="text-xs text-muted-foreground block mb-1">Titre de l'exercice (optionnel)</label>
              <Input
                placeholder="ex: Exercice sur les pointeurs"
                value={exerciseTitle}
                onChange={(e) => setExerciseTitle(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Durée estimée (minutes)</label>
              <Input
                type="number" min={5} max={120} step={5}
                value={exerciseMinutes}
                onChange={(e) => setExerciseMinutes(Math.max(5, Math.min(120, parseInt(e.target.value) || 20)))}
                className="h-8 text-sm text-center"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nombre de questions</label>
              <Input
                type="number" min={1} max={10}
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
                className="h-8 text-sm text-center"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Contexte / thème (optionnel)</label>
            <Input
              placeholder="ex: Algorithmes de tri, gestion de mémoire, etc."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Global defaults for the exercise */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Paramètres par défaut pour cet exercice :</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Bloom</label>
                <Select value={globalBloom} onValueChange={setGlobalBloom}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{BLOOM_LEVELS.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Difficulté</label>
                <Select value={globalDifficulty} onValueChange={setGlobalDifficulty}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{DIFFICULTIES.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Type</label>
                <Select value={globalType} onValueChange={setGlobalType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{QUESTION_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">AA ciblé</label>
                <Select value={globalAA} onValueChange={setGlobalAA}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="AA…" /></SelectTrigger>
                  <SelectContent>
                    {allAAs.map(a => (
                      <SelectItem key={a.value} value={a.value} className="text-xs">
                        <span className={a.isMissing ? 'text-red-600 font-medium' : ''}>{a.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {generateMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération en cours…</>
              : <><Zap className="h-4 w-4" /> Générer {questionCount} question{questionCount > 1 ? 's' : ''} ({exerciseMinutes} min)</>
            }
          </Button>
        </div>

        {/* === STEP 2: Per-question editing === */}
        {qEdits.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider flex-1">② Ajustez chaque question</p>
              <Badge variant="outline" className="text-xs">{qEdits.length} question{qEdits.length > 1 ? 's' : ''}</Badge>
            </div>

            {qEdits.map((qe, i) => {
              const rawQ = generateMutation.data?.questions?.[i];
              return (
                <div key={i} className="border border-blue-100 rounded-xl p-4 bg-blue-50/30 space-y-3 shadow-sm">
                  {/* Question header */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="text-xs font-semibold text-blue-800">Question {i + 1}</span>
                  </div>

                  {/* Editable question text */}
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Texte de la question</label>
                    <textarea
                      className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                      value={qe.text}
                      onChange={(e) => updateEdit(i, 'text', e.target.value)}
                      placeholder="Texte de la question…"
                    />
                  </div>

                  {/* Rationale */}
                  {rawQ?.rationale && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-blue-300 pl-2">
                      {rawQ.rationale}
                    </p>
                  )}

                  {/* Per-question selectors */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Bloom</label>
                      <Select value={qe.bloom_level} onValueChange={(v) => updateEdit(i, 'bloom_level', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{BLOOM_LEVELS.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Difficulté</label>
                      <Select value={qe.difficulty} onValueChange={(v) => updateEdit(i, 'difficulty', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{DIFFICULTIES.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Type</label>
                      <Select value={qe.question_type} onValueChange={(v) => updateEdit(i, 'question_type', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{QUESTION_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">AA cible</label>
                      <Select value={qe.aa} onValueChange={(v) => updateEdit(i, 'aa', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allAAs.map(a => (
                            <SelectItem key={a.value} value={a.value} className="text-xs">
                              <span className={a.isMissing ? 'text-red-600 font-medium' : ''}>{a.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Live badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-blue-100">
                    <Badge className="text-xs bg-blue-100 text-blue-700">{qe.bloom_level}</Badge>
                    <Badge className="text-xs bg-orange-100 text-orange-700">{qe.difficulty}</Badge>
                    <Badge variant="outline" className="text-xs">{qe.question_type}</Badge>
                    {qe.aa && <Badge className="text-xs bg-green-100 text-green-700">AA#{qe.aa}</Badge>}
                  </div>
                </div>
              );
            })}

            {/* === STEP 3: Validate and insert === */}
            <div className="border border-green-200 rounded-lg p-3 bg-green-50/40 space-y-2">
              <p className="text-xs font-bold text-green-800 uppercase tracking-wider">③ Valider et insérer dans le LaTeX</p>
              <p className="text-xs text-green-700">
                Cela va créer une section <code className="bg-white px-1 rounded">\section*{'{}'}</code> avec un <code className="bg-white px-1 rounded">\begin{'{enumerate}'}</code> contenant toutes les questions.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleInsertToLatex}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <FileCode2 className="h-4 w-4" /> Insérer l'exercice dans le LaTeX
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-9 text-xs"
                  onClick={async () => {
                    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
                    const res = await fetch(
                      `${API_URL}/api/v1/courses/${courseId}/tn-exams/${examId}/save-proposal`,
                      {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          questions: qEdits,
                          description: `Exercice: ${exerciseTitle || 'Sans titre'} (${exerciseMinutes} min, ${qEdits.length} questions)`,
                          created_at: new Date().toISOString(),
                        }),
                      }
                    );
                    if (res.ok) { toast.success('Proposition sauvegardée'); setSavedProposal(true); }
                    else toast.error('Erreur lors de la sauvegarde');
                  }}
                >
                  <Save className="h-3 w-3" /> Sauvegarder la proposition
                </Button>
                {savedProposal && (
                  <Badge className="text-xs bg-green-100 text-green-700 border-green-200 gap-1 h-9 px-3">
                    <CheckCircle2 className="h-3 w-3" /> Sauvegardé
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {generateMutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded p-2">Erreur lors de la génération. Vérifiez la connexion et réessayez.</p>
        )}
      </div>
    </div>
  );
}
// \u2500\u2500\u2500 Evaluation Score Cards \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function computeScores({
  bloomPercentages,
  difficultyPercentages,
  aaPercentages,
  aaMissing,
  typePercentages,
  totalAA,
  sourceCoverageRate,
}: {
  bloomPercentages: Record<string, number>;
  difficultyPercentages: Record<string, number>;
  aaPercentages: Record<string, number>;
  aaMissing: number[];
  typePercentages: Record<string, number>;
  totalAA: number;
  sourceCoverageRate: number;
}) {
  const coveredAA = Object.keys(aaPercentages).length;
  const totalAACount = coveredAA + aaMissing.length;
  const aaCoverageScore = totalAACount > 0 ? Math.round((coveredAA / totalAACount) * 100) : 100;

  const HOT_KEYS = ['Analyser', 'Évaluer', 'Créer', 'Analyse', 'Évaluation', 'Création'];
  const hotPct = Object.entries(bloomPercentages)
    .filter(([k]) => HOT_KEYS.includes(k))
    .reduce((s, [, v]) => s + v, 0);
  const bloomScore = Math.min(100, Math.round(hotPct * 1.5 + 30));

  const ideal: Record<string, number> = { 'Très facile': 10, 'Facile': 20, 'Moyen': 40, 'Difficile': 20, 'Très difficile': 10 };
  let diffPenalty = 0;
  Object.entries(ideal).forEach(([k, idealPct]) => {
    const actual = difficultyPercentages[k] ?? 0;
    diffPenalty += Math.abs(actual - idealPct);
  });
  const difficultyScore = Math.max(0, Math.round(100 - diffPenalty / 2));

  const typeCount = Object.keys(typePercentages).length;
  const typeScore = Math.min(100, typeCount * 20);

  const sourceScore = Math.round(sourceCoverageRate);

  const overall = Math.round(
    aaCoverageScore * 0.30 +
    bloomScore * 0.25 +
    difficultyScore * 0.20 +
    typeScore * 0.10 +
    sourceScore * 0.15
  );

  return { aaCoverageScore, bloomScore, difficultyScore, typeScore, sourceScore, overall, hotPct: Math.round(hotPct), coveredAA, totalAACount };
}

function ScoreCard({
  title,
  score,
  subtitle,
  icon,
  colorClass,
}: {
  title: string;
  score: number;
  subtitle: string;
  icon: React.ReactNode;
  colorClass: string;
}) {
  const getColor = (s: number) => s >= 75 ? 'text-green-600' : s >= 50 ? 'text-yellow-600' : 'text-red-600';
  const getBg = (s: number) => s >= 75 ? 'bg-green-50 border-green-200' : s >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
  const getBar = (s: number) => s >= 75 ? 'bg-green-500' : s >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className={`rounded-xl border p-4 ${getBg(score)}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${colorClass}`}>{icon}</div>
        <span className={`text-2xl font-black ${getColor(score)}`}>{score}</span>
      </div>
      <p className="text-sm font-semibold text-foreground mb-0.5">{title}</p>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
      <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${getBar(score)} transition-all duration-700`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function EvaluationScoreCards({
  bloomPercentages,
  difficultyPercentages,
  aaPercentages,
  aaMissing,
  typePercentages,
  totalAA,
  sourceCoverageRate,
}: {
  bloomPercentages: Record<string, number>;
  difficultyPercentages: Record<string, number>;
  aaPercentages: Record<string, number>;
  aaMissing: number[];
  typePercentages: Record<string, number>;
  totalAA: number;
  sourceCoverageRate: number;
}) {
  const scores = computeScores({
    bloomPercentages, difficultyPercentages, aaPercentages,
    aaMissing, typePercentages, totalAA, sourceCoverageRate,
  });

  const getOverallLabel = (s: number) =>
    s >= 80 ? '\ud83d\udfe2 Excellent' : s >= 65 ? '\ud83d\udfe1 Satisfaisant' : s >= 50 ? '\ud83d\udfe0 À améliorer' : '\ud83d\udd34 Insuffisant';

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-indigo-50 to-white">
        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Évaluation globale de l&apos;épreuve</h3>
          <p className="text-[10px] text-muted-foreground">Score calculé automatiquement sur 5 dimensions</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-2xl font-black text-indigo-700">{scores.overall}</span>
          <span className="text-xs text-muted-foreground">/100</span>
          <Badge className={`text-xs ml-1 ${scores.overall >= 80 ? 'bg-green-100 text-green-800' : scores.overall >= 65 ? 'bg-yellow-100 text-yellow-800' : scores.overall >= 50 ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>
            {getOverallLabel(scores.overall)}
          </Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-5">
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                scores.overall >= 80 ? 'bg-green-500' : scores.overall >= 65 ? 'bg-yellow-500' : scores.overall >= 50 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${scores.overall}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ScoreCard
            title="Couverture AA"
            score={scores.aaCoverageScore}
            subtitle={`${scores.coveredAA}/${scores.totalAACount} AA couverts`}
            icon={<Target className="h-4 w-4 text-green-600" />}
            colorClass="bg-green-100"
          />
          <ScoreCard
            title="Niveau Bloom"
            score={scores.bloomScore}
            subtitle={`${scores.hotPct}% de HOT questions`}
            icon={<Brain className="h-4 w-4 text-purple-600" />}
            colorClass="bg-purple-100"
          />
          <ScoreCard
            title="Équilibre Difficulté"
            score={scores.difficultyScore}
            subtitle="Distribution idéale: 10-20-40-20-10"
            icon={<BarChart3 className="h-4 w-4 text-orange-600" />}
            colorClass="bg-orange-100"
          />
          <ScoreCard
            title="Variété des Types"
            score={scores.typeScore}
            subtitle={`${Object.keys(typePercentages).length} type(s) de questions`}
            icon={<BookOpen className="h-4 w-4 text-blue-600" />}
            colorClass="bg-blue-100"
          />
          <ScoreCard
            title="Sources documentaires"
            score={scores.sourceScore}
            subtitle="% questions reliées aux cours"
            icon={<FileBarChart2 className="h-4 w-4 text-teal-600" />}
            colorClass="bg-teal-100"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Header Tab ───────────────────────────────────────────────────────────────────────────────────

function HeaderTab({
  exam,
  courseId,
  examId,
  onHeaderUpdated,
}: {
  exam: TnExamDocument;
  courseId: number;
  examId: number;
  onHeaderUpdated: () => void;
}) {
  const headerData: ExamHeaderData | null = (exam.analysis_results as any)?.exam_header ?? null;
  const [isExtracting, setIsExtracting] = useState(false);

  // On mount: load from localStorage if DB data is not available yet
  useEffect(() => {
    if (headerData) {
      // Sync DB data → localStorage
      const storageKey = `exam_header_${courseId}_${examId}`;
      localStorage.setItem(storageKey, JSON.stringify(headerData));
      console.log(`[EXAM HEADER] Loaded from DB for exam ${examId}:`, headerData);
    } else {
      // Try loading from localStorage as fallback
      const storageKey = `exam_header_${courseId}_${examId}`;
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        console.log(`[EXAM HEADER] Loaded from localStorage for exam ${examId}:`, JSON.parse(cached));
      }
    }
  }, [headerData, courseId, examId]);

  const handleExtractHeader = async () => {
    setIsExtracting(true);
    try {
      const response = await tnExamsApi.extractHeader(courseId, examId);
      const extracted = response.data.header;

      // ── Save to localStorage ──
      const storageKey = `exam_header_${courseId}_${examId}`;
      localStorage.setItem(storageKey, JSON.stringify(extracted));

      // ── Console log ──
      console.log(`[EXAM HEADER] Extraction réussie pour exam ${examId}:`, extracted);
      console.table({
        'Nom épreuve': extracted.exam_name ?? '-',
        'Classe': extracted.class_name ?? '-',
        'Durée (min)': extracted.declared_duration_min ?? '-',
        'Date': extracted.exam_date ?? '-',
        'Nb pages': extracted.num_pages ?? '-',
        'Langue': extracted.language ?? '-',
        'Enseignant(s)': extracted.instructors?.join(', ') ?? '-',
        'Documents': extracted.documents_allowed ?? '-',
        'Calculatrice': extracted.calculator_allowed ?? '-',
        'Internet': extracted.internet_allowed ?? '-',
        'PC': extracted.computer_allowed ?? '-',
      });

      toast.success("En-tête extrait avec succès !");
      onHeaderUpdated(); // Refresh from DB
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Erreur lors de l'extraction";
      console.error('[EXAM HEADER] Extraction failed:', err);
      toast.error(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  const formatDuration = (minutes?: number | null) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h${mins.toString().padStart(2, '0')}`;
    if (hours > 0) return `${hours}h`;
    return `${mins} min`;
  };

  const BooleanBadge = ({ value, label }: { value?: boolean | null; label: string }) => {
    if (value === null || value === undefined) {
      return (
        <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-sm text-gray-500">{label}</span>
          <span className="ml-auto text-xs text-gray-400 italic">Non renseigné</span>
        </div>
      );
    }
    return (
      <div className={`flex items-center justify-between p-3 rounded-lg border ${
        value ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
      }`}>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-1.5">
          {value ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-700">Autorisé</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-semibold text-red-700">Non autorisé</span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Extraction Card */}
      <Card className="border-2 border-indigo-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-7 h-7 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">En-tête de l&apos;épreuve</h2>
                <p className="text-sm text-indigo-100">Extraction automatique par IA</p>
              </div>
            </div>
            <Button
              onClick={handleExtractHeader}
              disabled={isExtracting}
              variant="secondary"
              className="bg-white text-indigo-600 hover:bg-indigo-50 font-semibold shadow-md"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extraction en cours...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  {headerData ? 'Réextraire les informations' : 'Extraire les informations du header'}
                </>
              )}
            </Button>
          </div>
        </div>

        <CardContent className="p-6">
          {!headerData ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucune information extraite</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Cliquez sur &quot;Extraire les informations du header&quot; pour analyser l&apos;en-tête de l&apos;épreuve.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* General Info Grid */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Informations générales
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Exam Name */}
                  <div className="col-span-full p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-medium text-indigo-600 uppercase">Nom de l&apos;épreuve</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">
                      {headerData.exam_name || <span className="text-gray-400 italic font-normal">Non renseigné</span>}
                    </p>
                  </div>

                  {/* Class */}
                  <div className="p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-gray-500 uppercase">Classe</span>
                    </div>
                    <p className="text-base font-semibold text-gray-900">
                      {headerData.class_name || <span className="text-gray-400 italic font-normal">Non renseigné</span>}
                    </p>
                  </div>

                  {/* Duration */}
                  <div className="p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-gray-500 uppercase">Durée</span>
                    </div>
                    <p className="text-base font-semibold text-indigo-600">
                      {formatDuration(headerData.declared_duration_min) || <span className="text-gray-400 italic font-normal">Non renseigné</span>}
                    </p>
                  </div>

                  {/* Date */}
                  <div className="p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-gray-500 uppercase">Date</span>
                    </div>
                    <p className="text-base font-semibold text-gray-900">
                      {headerData.exam_date || <span className="text-gray-400 italic font-normal">Non renseigné</span>}
                    </p>
                  </div>

                  {/* Number of Pages */}
                  <div className="p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-gray-500 uppercase">Nombre de pages</span>
                    </div>
                    <p className="text-base font-semibold text-gray-900">
                      {headerData.num_pages ?? <span className="text-gray-400 italic font-normal">Non renseigné</span>}
                    </p>
                  </div>

                  {/* Language */}
                  <div className="p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Globe className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-gray-500 uppercase">Langue</span>
                    </div>
                    <p className="text-base font-semibold text-gray-900">
                      {headerData.language || <span className="text-gray-400 italic font-normal">Non renseigné</span>}
                    </p>
                  </div>

                  {/* Instructors */}
                  <div className="col-span-full p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-gray-500 uppercase">Enseignant(s)</span>
                    </div>
                    {headerData.instructors && headerData.instructors.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {headerData.instructors.map((name, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">Non renseigné</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  🔐 Autorisations
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <BooleanBadge
                    value={headerData.documents_allowed}
                    label="📚 Documents autorisés"
                  />
                  <BooleanBadge
                    value={headerData.calculator_allowed}
                    label="🧮 Calculatrice autorisée"
                  />
                  <BooleanBadge
                    value={headerData.internet_allowed}
                    label="📡 Internet autorisé"
                  />
                  <BooleanBadge
                    value={headerData.computer_allowed}
                    label="💻 PC autorisé"
                  />
                </div>
              </div>

              {/* Footer note */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  💡 <strong>Note :</strong> Les informations sont extraites automatiquement de l&apos;en-tête du PDF.
                  Les résultats sont sauvegardés dans la base de données pour une utilisation ultérieure.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Questions Tab ────────────────────────────────────────────────────────────────────────────────────

const BLOOM_BADGE_COLORS: Record<string, string> = {
  'Mémoriser': 'bg-blue-100 text-blue-800',
  'Comprendre': 'bg-green-100 text-green-800',
  'Appliquer': 'bg-yellow-100 text-yellow-800',
  'Analyser': 'bg-orange-100 text-orange-800',
  'Évaluer': 'bg-red-100 text-red-800',
  'Créer': 'bg-purple-100 text-purple-800',
};

const DIFF_BADGE_COLORS: Record<string, string> = {
  'Très facile': 'bg-emerald-100 text-emerald-800',
  'Facile': 'bg-green-100 text-green-800',
  'Moyen': 'bg-yellow-100 text-yellow-800',
  'Difficile': 'bg-orange-100 text-orange-800',
  'Très difficile': 'bg-red-100 text-red-800',
};

function SourceMatchingSection({ courseId, examId, questions }: {
  courseId: number; examId: number; questions: ExtractedQuestion[];
}) {
  // Per-question match state: questionId -> { loading, sources, done }
  const [matchState, setMatchState] = useState<Record<number, {
    loading: boolean;
    done: boolean;
    sources: Array<{
      document_id: number;
      document_name: string;
      chapter_id?: number | null;
      chapter_name?: string | null;
      chapter_order?: number | null;
      page: number;
      section?: string | null;
      excerpt?: string | null;
      similarity?: number | null;
    }>;
  }>>({});

  const handleMatchQuestion = async (q: ExtractedQuestion) => {
    const qId = q.id ?? q.question_number;
    setMatchState(prev => ({ ...prev, [qId]: { loading: true, done: false, sources: [] } }));
    try {
      const response = await tnExamsApi.matchQuestion(courseId, examId, q.text ?? '');
      setMatchState(prev => ({
        ...prev,
        [qId]: { loading: false, done: true, sources: response.data.sources ?? [] },
      }));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur RAG');
      setMatchState(prev => ({ ...prev, [qId]: { loading: false, done: false, sources: [] } }));
    }
  };

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-8 text-center">
        <Brain className="h-12 w-12 text-indigo-300 mx-auto mb-3" />
        <p className="text-sm text-indigo-600 font-medium">Extrayez d&apos;abord les questions pour accéder à la correspondance.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-indigo-200 bg-gradient-to-r from-indigo-100 to-indigo-50">
        <BookOpen className="w-5 h-5 text-indigo-600 shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-indigo-900">Correspondance Questions — Documents</h3>
          <p className="text-[11px] text-indigo-600">Pour chaque question, cliquez sur « Correspondance » pour détecter le chapitre, document et page via RAG</p>
        </div>
        <Badge className="ml-auto bg-indigo-100 text-indigo-700 border-indigo-200 text-xs">
          {questions.length} question{questions.length > 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-indigo-100 border-b border-indigo-200">
              <th className="px-4 py-2.5 text-left font-semibold text-indigo-800 w-12">Q#</th>
              <th className="px-4 py-2.5 text-left font-semibold text-indigo-800 w-24">Exercice</th>
              <th className="px-4 py-2.5 text-left font-semibold text-indigo-800">Question (extrait)</th>
              <th className="px-4 py-2.5 text-left font-semibold text-indigo-800 w-28">Type</th>
              <th className="px-4 py-2.5 text-center font-semibold text-indigo-800 w-28">Correspondance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-100">
            {questions.map((q) => {
              const qId = (q.id ?? q.question_number) as number;
              const state = matchState[qId];
              return (
                <React.Fragment key={qId}>
                  <tr className="bg-white hover:bg-indigo-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700">
                      Q{q.question_number}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      Ex.{q.exercise_number}
                      {q.exercise_title && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[80px]" title={q.exercise_title}>
                          {q.exercise_title}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-xs">
                      <span className="line-clamp-2" title={q.text}>{q.text ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {q.question_type && (
                        <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-300">{q.question_type}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={state?.loading}
                        onClick={() => handleMatchQuestion(q)}
                        className="text-[11px] gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-semibold h-7 px-2.5"
                      >
                        {state?.loading ? (
                          <><Loader2 className="h-3 w-3 animate-spin" />Recherche…</>
                        ) : state?.done ? (
                          <><RotateCcw className="h-3 w-3" />Relancer</>
                        ) : (
                          <><Brain className="h-3 w-3" />Correspondance</>
                        )}
                      </Button>
                    </td>
                  </tr>
                  {state?.done && (
                    <tr className="bg-indigo-50/60">
                      <td colSpan={5} className="px-6 py-3">
                        {state.sources.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">Aucune source identifiée dans les documents du cours.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {state.sources.map((src, si) => (
                              <div key={si} className="flex items-start gap-2 bg-white border border-indigo-100 rounded-lg px-3 py-2 text-xs shadow-sm min-w-[200px] max-w-[320px]">
                                <FileText className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-slate-800 truncate" title={src.document_name}>{src.document_name}</p>
                                  {src.chapter_name && (
                                    <p className="text-indigo-600 flex items-center gap-1 mt-0.5">
                                      <BookOpen className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{src.chapter_name}</span>
                                    </p>
                                  )}
                                  {src.section && src.section !== src.chapter_name && (
                                    <p className="text-slate-500 truncate pl-4">» {src.section}</p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-[10px] px-1.5 h-4">p. {src.page}</Badge>
                                    <span className="text-[10px] text-green-600 font-medium">{Math.round((src.similarity ?? 0) * 100)}%</span>
                                  </div>
                                  {src.excerpt && (
                                    <p className="text-slate-400 text-[10px] mt-1 line-clamp-2 italic">{src.excerpt}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuestionsTab({
  exam,
  courseId,
  examId,
  onQuestionsUpdated,
}: {
  exam: TnExamDocument;
  courseId: number;
  examId: number;
  onQuestionsUpdated: () => void;
}) {
  const questions: ExtractedQuestion[] = (exam.analysis_results as any)?.extracted_questions ?? [];
  const [isExtracting, setIsExtracting] = useState(false);

  // On mount: sync to localStorage
  useEffect(() => {
    const storageKey = `exam_questions_${courseId}_${examId}`;
    if (questions.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(questions));
      console.log(`[EXAM QUESTIONS] Loaded from DB for exam ${examId}:`, questions);
    } else {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        console.log(`[EXAM QUESTIONS] Loaded from localStorage for exam ${examId}:`, JSON.parse(cached));
      }
    }
  }, [questions, courseId, examId]);

  const handleExtractQuestions = async () => {
    setIsExtracting(true);
    try {
      const response = await tnExamsApi.extractQuestions(courseId, examId);
      const extracted = response.data.questions;

      // Save to localStorage
      const storageKey = `exam_questions_${courseId}_${examId}`;
      localStorage.setItem(storageKey, JSON.stringify(extracted));

      // Console log
      console.log(`[EXAM QUESTIONS] Extraction réussie pour exam ${examId}: ${extracted.length} questions`);
      console.table(extracted.map((q) => ({
        '#': q.question_number,
        'Exercice': q.exercise_title,
        'Texte': q.text?.substring(0, 60) + '...',
        'Figure': q.has_figure ? '📊 Oui' : 'Non',
        'Points': q.points ?? '-',
        'Type': q.question_type,
        'Difficulté': q.difficulty,
        'Bloom': q.bloom_level,
        'Temps (min)': q.estimated_time_min ?? '-',
      })));

      toast.success(`${extracted.length} questions extraites avec succès !`);
      onQuestionsUpdated();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Erreur lors de l'extraction";
      console.error('[EXAM QUESTIONS] Extraction failed:', err);
      toast.error(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  // Stats
  const totalPoints = questions.reduce((s, q) => s + (q.points ?? 0), 0);
  const totalTime = questions.reduce((s, q) => s + (q.estimated_time_min ?? 0), 0);
  const figureCount = questions.filter((q) => q.has_figure).length;

  // Group by exercise
  const exercises: Record<number, { title: string; questions: ExtractedQuestion[] }> = {};
  questions.forEach((q) => {
    const n = q.exercise_number ?? 1;
    if (!exercises[n]) exercises[n] = { title: q.exercise_title ?? `Exercice ${n}`, questions: [] };
    exercises[n].questions.push(q);
  });
  const sortedExercises = Object.keys(exercises).map(Number).sort();

  return (
    <div className="space-y-6">
      <Card className="border-2 border-amber-200 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="w-7 h-7 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">Questions de l&apos;épreuve</h2>
                <p className="text-sm text-amber-100">Extraction des formules LaTeX, figures, barème, Bloom, difficulté, temps</p>
              </div>
            </div>
            <Button
              onClick={handleExtractQuestions}
              disabled={isExtracting}
              variant="secondary"
              className="bg-white text-amber-700 hover:bg-amber-50 font-semibold shadow-md"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extraction en cours...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  {questions.length > 0 ? 'Réextraire les questions' : 'Extraire les questions'}
                </>
              )}
            </Button>
          </div>
        </div>

        <CardContent className="p-6">
          {questions.length === 0 ? (
            <div className="text-center py-12">
              <Target className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucune question extraite</h3>
              <p className="text-sm text-muted-foreground">
                Cliquez sur &quot;Extraire les questions&quot; pour analyser l&apos;épreuve.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <p className="text-2xl font-bold text-amber-700">{questions.length}</p>
                  <p className="text-xs text-amber-600">Questions</p>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-700">{sortedExercises.length}</p>
                  <p className="text-xs text-blue-600">Exercices</p>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">{totalPoints > 0 ? totalPoints : '—'}</p>
                  <p className="text-xs text-green-600">Points total</p>
                </div>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-center">
                  <p className="text-2xl font-bold text-purple-700">{totalTime > 0 ? `${totalTime}` : '—'}</p>
                  <p className="text-xs text-purple-600">Temps estimé (min)</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <p className="text-2xl font-bold text-slate-700">{figureCount}</p>
                  <p className="text-xs text-slate-600">Avec figures</p>
                </div>
              </div>

              {/* Questions Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-16">#</TableHead>
                      <TableHead className="min-w-[300px]">Question</TableHead>
                      <TableHead className="w-16">📊</TableHead>
                      <TableHead className="w-20">Points</TableHead>
                      <TableHead className="w-32">Type</TableHead>
                      <TableHead className="w-28">Difficulté</TableHead>
                      <TableHead className="w-28">Bloom</TableHead>
                      <TableHead className="w-24">AAs</TableHead>
                      <TableHead className="w-24">Temps</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedExercises.map((exNum) => {
                      const { title, questions: exQs } = exercises[exNum];
                      const exPts = exQs.reduce((s, q) => s + (q.points ?? 0), 0);
                      const exTime = exQs.reduce((s, q) => s + (q.estimated_time_min ?? 0), 0);
                      return (
                        <React.Fragment key={exNum}>
                          <TableRow className="bg-amber-50/50 border-t-2 border-amber-200">
                            <TableCell colSpan={9} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-amber-800">{title}</span>
                                {exPts > 0 && <Badge className="bg-amber-100 text-amber-800 text-xs">{exPts} pts</Badge>}
                                {exTime > 0 && <Badge variant="outline" className="text-xs">~{exTime} min</Badge>}
                                <Badge variant="secondary" className="text-xs">{exQs.length} Q</Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                          {exQs.map((q, idx) => (
                            <TableRow key={q.id ?? idx} className="hover:bg-slate-50/50">
                              <TableCell className="font-mono text-sm text-muted-foreground">{q.question_number}</TableCell>
                              <TableCell className="text-sm">
                                <div className="whitespace-pre-wrap break-words max-w-md">{q.text}</div>
                              </TableCell>
                              <TableCell className="text-center">
                                {q.has_figure ? (
                                  <span title="Contient une figure">📊</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-semibold text-sm">
                                {q.points != null ? `${q.points} pts` : <span className="text-gray-400">—</span>}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs whitespace-nowrap">{q.question_type}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={`text-xs whitespace-nowrap ${DIFF_BADGE_COLORS[q.difficulty] ?? 'bg-gray-100 text-gray-800'}`}>
                                  {q.difficulty}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={`text-xs whitespace-nowrap ${BLOOM_BADGE_COLORS[q.bloom_level] ?? 'bg-gray-100 text-gray-800'}`}>
                                  {q.bloom_level}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {q.aa_numbers && q.aa_numbers.length > 0 ? (
                                  <div className="flex flex-wrap gap-0.5">
                                    {q.aa_numbers.map((n) => (
                                      <Badge key={n} className="text-[10px] px-1 py-0 bg-teal-100 text-teal-700 border-teal-200">AA{n}</Badge>
                                    ))}
                                  </div>
                                ) : <span className="text-gray-300 text-xs">—</span>}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {q.estimated_time_min != null ? `${q.estimated_time_min} min` : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Footer */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  💡 <strong>Note :</strong> Les questions sont extraites directement depuis les images du PDF.
                  Les formules mathématiques sont converties en notation LaTeX. Les résultats sont sauvegardés en base de données.
                </p>
              </div>

              {/* RAG Source Matching */}
              <SourceMatchingSection courseId={courseId} examId={examId} questions={questions} />

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Analyse AI Tab ───────────────────────────────────────────────────────────────────────────────────



function AnalyseAITab({

  exam,

  courseId,

  examId,

  onReanalyze,

}: {

  exam: TnExamDocument;

  courseId: number;

  examId: number;

  onReanalyze: () => void;

}) {

  const ar = exam.analysis_results;

  // Questions extracted via the QuestionsTab (Gemini 2.5 Pro Vision)
  const extractedFromTab = (exam.analysis_results as any)?.extracted_questions as ExtractedQuestion[] | undefined;

  const router = useRouter();

  const analyzeMutation = useAnalyzeTnExam(courseId);

  const saveMutation = useSaveTnExamAnalysis(courseId, examId);

  const { data: courseDetails } = useCourse(courseId);

  const aaDistribution: Array<{ number: number; description: string; percent: number }> =

    (courseDetails as any)?.tn_aa_distribution ?? [];



  // Local editable state — synced via useEffect when exam data changes after analysis

  const [editedQuestions, setEditedQuestions] = useState<TnExamQuestion[]>(

    (ar?.questions as TnExamQuestion[]) ?? []

  );

  const [editedDuration, setEditedDuration] = useState<string>(

    String((ar?.exam_metadata as any)?.declared_duration_min ?? ar?.declared_duration_min ?? '')

  );

  // Editable metadata fields

  const [editedMeta, setEditedMeta] = useState<Record<string, any>>((ar?.exam_metadata as any) ?? {});

  const [dirty, setDirty] = useState(false);

  const [showOverlay, setShowOverlay] = useState(false);

  // LaTeX source upload

  const [latexSourceFile, setLatexSourceFile] = useState<File | null>(null);

  const [latexSourceUploading, setLatexSourceUploading] = useState(false);

  const [latexSourceUploaded, setLatexSourceUploaded] = useState(

    !!(exam as any).metadata?.latex_source_path

  );



  // Critical fix: sync state when exam changes after analysis completes

  useEffect(() => {

    let questions = (exam.analysis_results?.questions as TnExamQuestion[]) ?? [];

    // If full analysis has no questions yet, inject from QuestionsTab extraction (Gemini 2.5 Pro Vision)
    if (questions.length === 0 && extractedFromTab && extractedFromTab.length > 0) {
      questions = extractedFromTab.map(convertExtractedToTnExam);
    }

    setEditedQuestions(questions);

    const metaData = (exam.analysis_results?.exam_metadata as any) ?? {};

    // Merge exam_header data into metadata (header fills empty fields, metadata keeps priority for existing values)
    const headerData = (exam.analysis_results as any)?.exam_header ?? {};
    const mergedMeta: Record<string, any> = { ...headerData };
    // Metadata from analysis overrides header for non-empty values
    for (const [key, value] of Object.entries(metaData)) {
      if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        mergedMeta[key] = value;
      }
    }

    const dur = mergedMeta.declared_duration_min ?? metaData.declared_duration_min ?? exam.analysis_results?.declared_duration_min ?? '';

    setEditedDuration(String(dur));

    setEditedMeta(mergedMeta);

    setDirty(false);

    if (exam.analysis_results) {

      setLatexContent(buildLatexFromQuestions(exam.title ?? 'Épreuve', mergedMeta, questions));

    }

  }, [exam.id, exam.updated_at]);



  const updateQuestion = useCallback(

    (index: number, field: keyof TnExamQuestion, value: unknown) => {

      setEditedQuestions((prev) => {

        const next = [...prev];

        next[index] = { ...next[index], [field]: value };

        return next;

      });

      setDirty(true);

    },

    []

  );



  const updateMeta = useCallback((field: string, value: unknown) => {

    setEditedMeta((prev) => ({ ...prev, [field]: value }));

    setDirty(true);

  }, []);



  const handleLatexSourceUpload = async () => {

    if (!latexSourceFile) return;

    setLatexSourceUploading(true);

    try {

      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

      const formData = new FormData();

      formData.append('file', latexSourceFile);

      const res = await fetch(

        `${API_URL}/api/v1/courses/${courseId}/tn-exams/${examId}/upload-latex-source`,

        { method: 'POST', credentials: 'include', body: formData }

      );

      if (!res.ok) throw new Error('Upload failed');

      setLatexSourceUploaded(true);

      setLatexSourceFile(null);

      toast.success('Fichier LaTeX source uploadé — relancez l\'analyse pour améliorer l\'extraction');

    } catch {

      toast.error('Erreur lors de l\'upload du fichier LaTeX');

    } finally {

      setLatexSourceUploading(false);

    }

  };



  const handleSave = async () => {

    const fullMeta = {

      ...editedMeta,

      declared_duration_min: editedDuration ? Number(editedDuration) : undefined,

    };

    await saveMutation.mutateAsync({

      exam_metadata: fullMeta,

      questions: editedQuestions,

    });

    setDirty(false);

    toast.success('Modifications sauvegardées');

  };



  const handleAnalyze = async () => {

    setShowOverlay(true);

    try {

      await analyzeMutation.mutateAsync(examId);

      onReanalyze();

      toast.success('Analyse terminée avec succès');

    } catch (err: any) {

      toast.error(err?.response?.data?.error || "Erreur lors de l'analyse");

    } finally {

      setShowOverlay(false);

    }

  };



  const meta = editedMeta; // alias for backward compat with any remaining references

  const timeAnalysis = ar?.time_analysis as any;

  const bloomPercentages = (ar?.bloom_percentages as Record<string, number>) ?? {};

  const difficultyPercentages = (ar?.difficulty_percentages as Record<string, number>) ?? {};

  const aaPercentages = (ar?.aa_percentages as Record<string, number>) ?? {};

  const recommendations = (ar?.recommendations as string[]) ?? [];

  const strengths = (ar?.strengths as string[]) ?? [];

  const improvementProposals = (ar?.improvement_proposals as any[]) ?? [];



  const typePercentages: Record<string, number> = (() => {

    const qs = editedQuestions.length > 0 ? editedQuestions : ((ar?.questions as any[]) ?? []);

    if (!qs.length) return {};

    const counts: Record<string, number> = {};

    for (const q of qs) {

      const t = (q as any)['Type'] ?? (q as any).Type ?? 'Non défini';

      if (t) counts[t] = (counts[t] ?? 0) + 1;

    }

    const total = qs.length;

    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / total) * 100)]));

  })();
  const sourceCoverageRate = (ar?.source_coverage_rate as number) ?? 0;



  const [showLatex, setShowLatex] = useState(false);

  const [latexContent, setLatexContent] = useState<string>(() =>

    buildLatexFromQuestions(exam.title ?? 'Épreuve', (ar?.exam_metadata as any) ?? {}, (ar?.questions as any[]) ?? [])

  );

  const [latexVersion, setLatexVersion] = useState(0);

  const [showMcp, setShowMcp] = useState(false);



  const onAddToLatex = useCallback((questionText: string) => {

    setLatexContent((prev) => {

      const endIdx = prev.lastIndexOf('\\end{enumerate}');

      if (endIdx !== -1) {

        return prev.slice(0, endIdx) + `  \\item ${questionText}\n` + prev.slice(endIdx);

      }

      return prev;

    });

    setLatexVersion((v) => v + 1);

    setShowLatex(true);

  }, []);



  // Rebuild latex when showLatex opens or questions change

  useEffect(() => {

    if (showLatex) {

      const built = buildLatexFromQuestions(exam.title ?? 'Épreuve', meta, editedQuestions);

      setLatexContent((prev) => prev.length > 200 ? prev : built);

    }

  // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [showLatex]);

  // ─── Dynamic Synthesis — derived from Header + Questions tabs ─────────────────────────────
  const headerData: ExamHeaderData | null = (exam.analysis_results as any)?.exam_header ?? null;

  // Questions source: prefer extracted from QuestionsTab, fall back to editedQuestions
  const synthQuestions: Array<{ bloom?: string; difficulty?: string; type?: string; points?: number; exercise_number?: number; aa_numbers?: number[] }> =
    extractedFromTab && extractedFromTab.length > 0
      ? extractedFromTab.map((q) => ({
          bloom: q.bloom_level ?? undefined,
          difficulty: q.difficulty ?? undefined,
          type: q.question_type ?? undefined,
          points: q.points ?? undefined,
          exercise_number: q.exercise_number ?? undefined,
          aa_numbers: q.aa_numbers ?? undefined,
        }))
      : editedQuestions.map((q) => ({
          bloom: q.Bloom_Level,
          difficulty: q.Difficulty,
          type: q.Type,
          points: q.points,
          exercise_number: (q as any).Exercise_Number as number | undefined,
          aa_numbers: (q as any).aa_numbers as number[] | undefined,
        }));

  const synthExercises = new Set(synthQuestions.map((q) => q.exercise_number).filter(Boolean)).size;
  const synthTotalPoints = synthQuestions.reduce((s, q) => s + (q.points ?? 0), 0);

  const synthCountBy = (field: keyof typeof synthQuestions[0]) => {
    const counts: Record<string, number> = {};
    for (const q of synthQuestions) {
      const v = String(q[field] ?? 'N/A');
      counts[v] = (counts[v] ?? 0) + 1;
    }
    return counts;
  };
  const synthBloom = synthCountBy('bloom');
  const synthDiff = synthCountBy('difficulty');
  const synthType = synthCountBy('type');

  // AA coverage: use AI analysis if available, else derive from aa_numbers in extracted questions
  const coveredAANumbersFromQuestions = new Set(
    synthQuestions.flatMap((q) => q.aa_numbers ?? [])
  );
  const synthAACoverage = aaDistribution.length > 0
    ? aaDistribution.map((aa) => {
        const coveredByAI = Object.keys(aaPercentages).includes(String(aa.number));
        const coveredByExtract = coveredAANumbersFromQuestions.has(aa.number);
        const covered = coveredByAI || coveredByExtract;
        // Count questions that explicitly reference this AA
        const qCount = synthQuestions.filter((q) => q.aa_numbers?.includes(aa.number)).length;
        const pct = aaPercentages[String(aa.number)] ?? (synthQuestions.length > 0 ? Math.round(qCount / synthQuestions.length * 100) : 0);
        return { ...aa, covered, pct, qCount };
      })
    : [];

  // Helper to render a small distribution list
  const SynthDistRow = ({ label, color, count, total }: { label: string; color: string; count: number; total: number }) => (
    <div className="flex items-center gap-2 text-xs">
      <span className={`shrink-0 w-2 h-2 rounded-full ${color}`} />
      <span className="text-slate-600 flex-1 truncate">{label}</span>
      <span className="font-semibold text-slate-800">{count}</span>
      <div className="w-16 bg-slate-100 rounded-full h-1.5 shrink-0">
        <div className={`h-1.5 rounded-full ${color.replace('bg-', 'bg-')}`} style={{ width: `${total > 0 ? Math.round(count / total * 100) : 0}%` }} />
      </div>
      <span className="text-slate-400 w-7 text-right">{total > 0 ? Math.round(count / total * 100) : 0}%</span>
    </div>
  );

  const hasSynthData = headerData || synthQuestions.length > 0;

  // Shared JSX node — shown in both empty state and full state
  const SynthesisSection = hasSynthData ? (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-slate-700 to-slate-600 text-white">
        <Brain className="h-4 w-4 shrink-0" />
        <h3 className="text-sm font-bold tracking-wide">Synthèse Dynamique — Données des onglets précédents</h3>
        <Badge className="ml-auto bg-white/20 text-white border-0 text-[10px]">Temps réel</Badge>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

        {/* ── Header Info ── */}
        {headerData && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">📋 En-tête de l&apos;examen</p>
            <div className="space-y-2">
              {headerData.exam_name && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">Nom</span>
                  <span className="text-xs font-semibold text-slate-800">{headerData.exam_name}</span>
                </div>
              )}
              {headerData.class_name && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">Classe</span>
                  <span className="text-xs font-semibold text-slate-800">{headerData.class_name}</span>
                </div>
              )}
              {headerData.exam_date && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">Date</span>
                  <span className="text-xs font-semibold text-slate-800">{headerData.exam_date}</span>
                </div>
              )}
              {headerData.declared_duration_min && (
                <div className="flex items-start gap-2">
                  <Clock className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                  <span className="text-xs text-slate-500 w-20 shrink-0">Durée déclarée</span>
                  <span className="text-xs font-bold text-blue-700">{headerData.declared_duration_min} min</span>
                </div>
              )}
              {headerData.exam_type && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">Type</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{headerData.exam_type}</Badge>
                </div>
              )}
              {headerData.department && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">Département</span>
                  <span className="text-xs font-semibold text-slate-800">{headerData.department}</span>
                </div>
              )}
              {headerData.instructors && headerData.instructors.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">Enseignant(s)</span>
                  <span className="text-xs font-semibold text-slate-800">{headerData.instructors.join(', ')}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: 'Calculatrice', val: headerData.calculator_allowed },
                  { label: 'Ordinateur', val: headerData.computer_allowed },
                  { label: 'Internet', val: headerData.internet_allowed },
                  { label: 'Documents', val: headerData.documents_allowed },
                ].filter((r) => r.val !== null && r.val !== undefined).map((r) => (
                  <Badge key={r.label} className={`text-[10px] px-1.5 py-0 ${r.val ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                    {r.val ? '✓' : '✗'} {r.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Questions Stats ── */}
        {synthQuestions.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">📝 Statistiques Questions</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 text-center">
                <p className="text-xl font-bold text-blue-700">{synthExercises || '—'}</p>
                <p className="text-[10px] text-blue-500">Exercices</p>
              </div>
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-center">
                <p className="text-xl font-bold text-indigo-700">{synthQuestions.length}</p>
                <p className="text-[10px] text-indigo-500">Questions</p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
                <p className="text-xl font-bold text-emerald-700">{synthTotalPoints > 0 ? synthTotalPoints : '—'}</p>
                <p className="text-[10px] text-emerald-500">Points total</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Bloom</p>
              {Object.entries(synthBloom).filter(([k]) => k !== 'N/A').sort((a, b) => b[1] - a[1]).slice(0, 5).map(([lvl, cnt]) => (
                <SynthDistRow key={lvl} label={lvl} count={cnt} total={synthQuestions.length}
                  color={BLOOM_BADGE_COLORS[lvl as keyof typeof BLOOM_BADGE_COLORS]?.split(' ')[0]?.replace('text-', 'bg-') ?? 'bg-slate-400'} />
              ))}
            </div>
            <div className="space-y-1.5 mt-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Difficulté</p>
              {Object.entries(synthDiff).filter(([k]) => k !== 'N/A').sort((a, b) => b[1] - a[1]).map(([lvl, cnt]) => (
                <SynthDistRow key={lvl} label={lvl} count={cnt} total={synthQuestions.length}
                  color={DIFF_BADGE_COLORS[lvl as keyof typeof DIFF_BADGE_COLORS]?.split(' ')[0]?.replace('text-', 'bg-') ?? 'bg-slate-400'} />
              ))}
            </div>
            {Object.keys(synthType).some((k) => k !== 'N/A') && (
              <div className="space-y-1.5 mt-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Type</p>
                {Object.entries(synthType).filter(([k]) => k !== 'N/A').sort((a, b) => b[1] - a[1]).map(([t, cnt]) => (
                  <SynthDistRow key={t} label={t} count={cnt} total={synthQuestions.length} color="bg-purple-400" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AA Alignment ── */}
        {aaDistribution.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">🎯 Couverture des AA du cours</p>
            <div className="space-y-2">
              {synthAACoverage.map((aa) => (
                <div key={aa.number} className="rounded-lg border px-3 py-2 flex items-center gap-2"
                  style={{ borderColor: aa.covered ? '#bbf7d0' : '#fecaca', background: aa.covered ? '#f0fdf4' : '#fef2f2' }}>
                  <span className={`text-lg font-bold w-6 text-center ${aa.covered ? 'text-green-600' : 'text-red-400'}`}>
                    {aa.covered ? '✓' : '✗'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-slate-700 truncate">AA{aa.number} — {aa.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${aa.covered ? 'bg-green-500' : 'bg-red-300'}`}
                          style={{ width: `${Math.min(aa.pct, 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 w-8 text-right">{aa.pct}%</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <Badge className={`text-[10px] px-1.5 py-0 ${aa.covered ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-600 border-red-200'}`}>
                      {aa.percent}% cours
                    </Badge>
                    {(aa as any).qCount > 0 && (
                      <span className="text-[9px] text-teal-600 font-semibold">{(aa as any).qCount} Q</span>
                    )}
                  </div>
                </div>
              ))}
              {synthAACoverage.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Lancez l&apos;analyse pour voir la couverture</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // Empty state


  if (!ar) {

    return (

      <>

        <AnalysisProgressOverlay visible={showOverlay} onClose={() => setShowOverlay(false)} />

        {SynthesisSection}

        <div className="flex flex-col items-center justify-center py-20 gap-4">

          <Brain className="h-16 w-16 text-muted-foreground" />

          <h3 className="text-xl font-semibold">Analyse non effectuée</h3>

          <p className="text-muted-foreground text-center max-w-sm">
            Lancez l&apos;analyse IA pour extraire les questions, barèmes, niveaux Bloom et aligner
            avec les Acquis d&apos;Apprentissage.
          </p>

          {extractedFromTab && extractedFromTab.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <Target className="h-4 w-4 shrink-0" />
              <span>
                <strong>{extractedFromTab.length} questions</strong> extraites disponibles — elles seront pré-chargées dès que l&apos;analyse sera lancée.
              </span>
            </div>
          )}

          <Button

            onClick={handleAnalyze}

            disabled={analyzeMutation.isPending}

            size="lg"

            className="gap-2"

          >

            {analyzeMutation.isPending ? (

              <Loader2 className="h-4 w-4 animate-spin" />

            ) : (

              <Play className="h-4 w-4" />

            )}

            {analyzeMutation.isPending ? 'Analyse en cours…' : "Lancer l'analyse"}

          </Button>

        </div>

      </>

    );

  }



  const coveredCount = Object.keys(aaPercentages).length;

  const missingCount = ((ar.aa_missing as number[]) ?? []).length;

  const coveragePct = coveredCount + missingCount > 0

    ? Math.round((coveredCount / (coveredCount + missingCount)) * 100)

    : 100;



  return (

    <>

      <AnalysisProgressOverlay visible={showOverlay} onClose={() => setShowOverlay(false)} />

      {SynthesisSection}

      <div className="space-y-6">

        {/* ── 1. Action bar ── */}

        <div className="flex flex-wrap items-center gap-3 pb-4 border-b">

          <Button

            onClick={handleAnalyze}

            disabled={analyzeMutation.isPending}

            variant="outline"

            size="sm"

            className="gap-2"

          >

            {analyzeMutation.isPending ? (

              <Loader2 className="h-4 w-4 animate-spin" />

            ) : (

              <RotateCcw className="h-4 w-4" />

            )}

            {analyzeMutation.isPending ? 'Analyse…' : "Relancer l'analyse"}

          </Button>

          {dirty && (

            <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm" className="gap-2">

              {saveMutation.isPending ? (

                <Loader2 className="h-4 w-4 animate-spin" />

              ) : (

                <Save className="h-4 w-4" />

              )}

              Sauvegarder

            </Button>

          )}

          {dirty && (

            <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">

              Modifications non sauvegardées

            </Badge>

          )}

          {/* Import button — visible when extraction results are available */}
          {extractedFromTab && extractedFromTab.length > 0 && (
            <Button
              onClick={() => {
                const imported = extractedFromTab.map(convertExtractedToTnExam);
                setEditedQuestions(imported);
                setDirty(true);
                toast.success(`${imported.length} questions importées depuis l'extraction (Gemini Vision)`);
              }}
              variant="outline"
              size="sm"
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 ml-auto"
            >
              <Download className="h-4 w-4" />
              Importer questions extraites ({extractedFromTab.length})
            </Button>
          )}

        </div>



        {/* ── 2. KPI row ── */}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">

            <p className="text-xs text-muted-foreground">Questions</p>

            <p className="text-xl font-bold mt-1">{ar.total_questions ?? editedQuestions.length}</p>

          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">

            <p className="text-xs text-muted-foreground">Barème total</p>

            <p className="text-xl font-bold mt-1">

              {ar.total_max_points != null ? `${ar.total_max_points} pts` : '—'}

            </p>

          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">

            <p className="text-xs text-muted-foreground">Durée déclarée</p>

            <p className="text-xl font-bold mt-1">{editedDuration ? `${editedDuration} min` : '—'}</p>

          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">

            <p className="text-xs text-muted-foreground">Durée estimée</p>

            <p className="text-xl font-bold mt-1">

              {timeAnalysis ? `${timeAnalysis.total_estimated_min} min` : '—'}

            </p>

          </div>

        </div>



        {/* ── 3. Time verdict banner ── */}

        {timeAnalysis && (

          <div

            className={`rounded-xl border p-4 flex items-center gap-3 ${

              timeAnalysis.verdict === 'TROP_LONG'

                ? 'border-red-200 bg-red-50'

                : timeAnalysis.verdict === 'TROP_COURT'

                ? 'border-yellow-200 bg-yellow-50'

                : 'border-green-200 bg-green-50'

            }`}

          >

            <Clock

              className={`h-5 w-5 shrink-0 ${

                timeAnalysis.verdict === 'TROP_LONG'

                  ? 'text-red-500'

                  : timeAnalysis.verdict === 'TROP_COURT'

                  ? 'text-yellow-500'

                  : 'text-green-500'

              }`}

            />

            <div className="flex-1 min-w-0">

              <p className="text-sm font-semibold">{timeAnalysis.verdict_label ?? timeAnalysis.verdict}</p>

              <p className="text-xs text-muted-foreground mt-0.5">

                Estimé (avec buffer): {timeAnalysis.total_with_buffer_min} min · Sans buffer:{' '}

                {timeAnalysis.total_estimated_min} min · Déclaré:{' '}

                {timeAnalysis.declared_duration_min ?? '—'} min

              </p>

            </div>

            {timeAnalysis.delta_min != null && (

              <Badge

                className={

                  timeAnalysis.verdict === 'TROP_LONG'

                    ? 'bg-red-100 text-red-800 border-red-200'

                    : timeAnalysis.verdict === 'TROP_COURT'

                    ? 'bg-yellow-100 text-yellow-800 border-yellow-200'

                    : 'bg-green-100 text-green-800 border-green-200'

                }

              >

                Δ {timeAnalysis.delta_min > 0 ? '+' : ''}{timeAnalysis.delta_min} min

              </Badge>

            )}

          </div>

        )}



        {/* ── 4. Metadata card (editable) ── */}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

          <div className="flex items-center gap-2 px-4 py-3 border-b bg-slate-50">

            <BookOpen className="h-4 w-4 text-muted-foreground" />

            <h3 className="text-sm font-semibold"> de l&apos;épreuve</h3>

            <Badge variant="outline" className="ml-auto text-xs gap-1"><Pencil className="h-3 w-3" />Modifiable</Badge>

          </div>

          <div className="p-4 space-y-4">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

              <div>

                <label className="text-xs text-muted-foreground block mb-1">Nom de l&apos;épreuve</label>

                <Input

                  value={editedMeta.exam_name ?? ''}

                  onChange={(e) => updateMeta('exam_name', e.target.value)}

                  className="h-8 text-sm"

                  placeholder="Ex: Algèbre 1"

                />

              </div>

              <div>

                <label className="text-xs text-muted-foreground block mb-1">Classe / Promotion</label>

                <Input

                  value={editedMeta.class_name ?? ''}

                  onChange={(e) => updateMeta('class_name', e.target.value)}

                  className="h-8 text-sm"

                  placeholder="Ex: L1 Info"

                />

              </div>

              <div>

                <label className="text-xs text-muted-foreground block mb-1">Durée déclarée (min)</label>

                <Input

                  type="number"

                  value={editedDuration}

                  onChange={(e) => { setEditedDuration(e.target.value); setDirty(true); }}

                  className="h-8 text-sm"

                />

              </div>

              <div>

                <label className="text-xs text-muted-foreground block mb-1">Date de l&apos;épreuve</label>

                <Input

                  value={editedMeta.exam_date ?? ''}

                  onChange={(e) => updateMeta('exam_date', e.target.value)}

                  className="h-8 text-sm"

                  placeholder="JJ/MM/AAAA"

                />

              </div>

            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

              <div>

                <label className="text-xs text-muted-foreground block mb-1">Enseignant(s)</label>

                <Input

                  value={Array.isArray(editedMeta.instructors) ? editedMeta.instructors.join(', ') : (editedMeta.instructors ?? '')}

                  onChange={(e) => updateMeta('instructors', e.target.value ? e.target.value.split(',').map((s: string) => s.trim()) : [])}

                  className="h-8 text-sm"

                  placeholder="Nom, Prénom (séparés par virgule)"

                />

              </div>

              <div>

                <label className="text-xs text-muted-foreground block mb-1">Département</label>

                <Input

                  value={editedMeta.department ?? ''}

                  onChange={(e) => updateMeta('department', e.target.value)}

                  className="h-8 text-sm"

                />

              </div>

              <div>

                <label className="text-xs text-muted-foreground block mb-1">Langue</label>

                <Select value={editedMeta.language ?? ''} onValueChange={(v) => updateMeta('language', v)}>

                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Langue" /></SelectTrigger>

                  <SelectContent>

                    {['Français', 'Arabe', 'Anglais', 'Mixte'].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}

                  </SelectContent>

                </Select>

              </div>

              <div>

                <label className="text-xs text-muted-foreground block mb-1">Nb. de pages</label>

                <Input

                  type="number"

                  value={editedMeta.num_pages ?? ''}

                  onChange={(e) => updateMeta('num_pages', e.target.value ? Number(e.target.value) : null)}

                  className="h-8 text-sm"

                />

              </div>

            </div>

            {/* Autorisations (editable) */}
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground font-semibold mb-2">🔐 Autorisations &amp; Type</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Type d&apos;examen</label>
                  <Select value={editedMeta.exam_type ?? ''} onValueChange={(v) => updateMeta('exam_type', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      {['Examen', 'DS', 'Test', 'TP', 'Rattrapage', 'QCM', 'Mixte', 'Autre'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">📚 Documents</label>
                  <Select value={editedMeta.documents_allowed == null ? 'null' : String(editedMeta.documents_allowed)} onValueChange={(v) => updateMeta('documents_allowed', v === 'null' ? null : v === 'true')}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">✅ Autorisé</SelectItem>
                      <SelectItem value="false">❌ Non autorisé</SelectItem>
                      <SelectItem value="null">— Non renseigné</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">🧮 Calculatrice</label>
                  <Select value={editedMeta.calculator_allowed == null ? 'null' : String(editedMeta.calculator_allowed)} onValueChange={(v) => updateMeta('calculator_allowed', v === 'null' ? null : v === 'true')}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">✅ Autorisée</SelectItem>
                      <SelectItem value="false">❌ Non autorisée</SelectItem>
                      <SelectItem value="null">— Non renseigné</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">📡 Internet</label>
                  <Select value={editedMeta.internet_allowed == null ? 'null' : String(editedMeta.internet_allowed)} onValueChange={(v) => updateMeta('internet_allowed', v === 'null' ? null : v === 'true')}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">✅ Autorisé</SelectItem>
                      <SelectItem value="false">❌ Non autorisé</SelectItem>
                      <SelectItem value="null">— Non renseigné</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">💻 PC</label>
                  <Select value={editedMeta.computer_allowed == null ? 'null' : String(editedMeta.computer_allowed)} onValueChange={(v) => updateMeta('computer_allowed', v === 'null' ? null : v === 'true')}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">✅ Autorisé</SelectItem>
                      <SelectItem value="false">❌ Non autorisé</SelectItem>
                      <SelectItem value="null">— Non renseigné</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">📝 Réponses</label>
                  <Select value={editedMeta.answer_on_sheet == null ? 'null' : String(editedMeta.answer_on_sheet)} onValueChange={(v) => updateMeta('answer_on_sheet', v === 'null' ? null : v === 'true')}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Sur feuille d&apos;examen</SelectItem>
                      <SelectItem value="false">Copie séparée</SelectItem>
                      <SelectItem value="null">— Non renseigné</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* LaTeX source upload */}

            <div className="pt-2 border-t">

              <p className="text-xs text-muted-foreground mb-2 font-medium">

                Fichier LaTeX source <span className="text-slate-400 font-normal">(optionnel — améliore la qualité d&apos;extraction des questions et formules)</span>

              </p>

              <div className="flex items-center gap-2">

                <label className="flex items-center gap-2 cursor-pointer">

                  <input

                    type="file"

                    accept=".tex"

                    className="hidden"

                    onChange={(e) => setLatexSourceFile(e.target.files?.[0] ?? null)}

                  />

                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" asChild>

                    <span><Upload className="h-3 w-3" />{latexSourceFile ? latexSourceFile.name : 'Choisir un fichier .tex'}</span>

                  </Button>

                </label>

                {latexSourceFile && (

                  <Button

                    size="sm"

                    className="h-8 text-xs gap-1.5"

                    onClick={handleLatexSourceUpload}

                    disabled={latexSourceUploading}

                  >

                    {latexSourceUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}

                    Uploader

                  </Button>

                )}

                {latexSourceUploaded && !latexSourceFile && (

                  <Badge className="text-xs bg-green-100 text-green-700 border-green-200">✓ Source LaTeX disponible</Badge>

                )}

              </div>

            </div>

          </div>

        </div>



        {/* ── 5. Questions table ── */}

        {editedQuestions.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-amber-50 to-white">
              <Target className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold">Tableau récapitulatif des questions</h3>
              <Badge variant="secondary" className="ml-auto text-xs">{editedQuestions.length} questions</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-16">#</TableHead>
                    <TableHead className="min-w-[300px]">Question</TableHead>
                    <TableHead className="w-16">📊</TableHead>
                    <TableHead className="w-24">Points</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead className="w-28">Difficulté</TableHead>
                    <TableHead className="w-28">Bloom</TableHead>
                    <TableHead className="w-24">Temps</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const groups: Record<number, { title: string; questions: typeof editedQuestions }> = {};
                    editedQuestions.forEach((q) => {
                      const exNum = (q as any).exercise_number ?? 1;
                      const exTitle = (q as any).exercise_title ?? `Exercice ${exNum}`;
                      if (!groups[exNum]) groups[exNum] = { title: exTitle, questions: [] };
                      groups[exNum].questions.push(q);
                    });
                    const sortedKeys = Object.keys(groups).map(Number).sort();
                    return sortedKeys.map((exNum) => {
                      const { title, questions: exQs } = groups[exNum];
                      const exPts = exQs.reduce((s, q) => s + (q.points ?? 0), 0);
                      const exTime = exQs.reduce((s, q) => s + (q.estimated_time_min ?? 0), 0);
                      return (
                        <React.Fragment key={exNum}>
                          <TableRow className="bg-amber-50/60 border-t-2 border-amber-200">
                            <TableCell colSpan={8} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-amber-800">{title}</span>
                                {exPts > 0 && <Badge className="bg-amber-100 text-amber-800 text-xs border-0">{exPts} pts</Badge>}
                                {exTime > 0 && <Badge variant="outline" className="text-xs">~{exTime} min</Badge>}
                                <Badge variant="secondary" className="text-xs">{exQs.length} Q</Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                          {exQs.map((q, idx) => {
                            const bloom = (q as any).Bloom_Level ?? (q as any).bloom_level ?? '';
                            const diff = (q as any).Difficulty ?? (q as any).difficulty ?? '';
                            const qType = (q as any)['Type'] ?? (q as any).question_type ?? '';
                            const qNum = (q as any).question_number ?? String(idx + 1);
                            const hasFig = (q as any).has_figure;
                            return (
                              <TableRow key={(q as any).id ?? idx} className="hover:bg-slate-50/50">
                                <TableCell className="font-mono text-sm text-muted-foreground">{qNum}</TableCell>
                                <TableCell className="text-sm">
                                  <div className="whitespace-pre-wrap break-words max-w-md">{(q as any).text ?? q.question_text ?? '—'}</div>
                                </TableCell>
                                <TableCell className="text-center">
                                  {hasFig ? <span title="Contient une figure">📊</span> : <span className="text-gray-300">—</span>}
                                </TableCell>
                                <TableCell className="font-semibold text-sm">
                                  {q.points != null ? `${q.points} pts` : <span className="text-gray-400">—</span>}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs whitespace-nowrap">{qType || '—'}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`text-xs whitespace-nowrap ${DIFF_BADGE_COLORS[diff] ?? 'bg-gray-100 text-gray-700'}`}>{diff || '—'}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`text-xs whitespace-nowrap ${BLOOM_BADGE_COLORS[bloom] ?? 'bg-gray-100 text-gray-700'}`}>{bloom || '—'}</Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                  {q.estimated_time_min != null ? `${q.estimated_time_min} min` : '—'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </React.Fragment>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
        )}




        {/* \u2500\u2500 5b. Evaluation Score Cards \u2500\u2500 */}
        {(Object.keys(bloomPercentages).length > 0 || Object.keys(aaPercentages).length > 0) && (
          <EvaluationScoreCards
            bloomPercentages={bloomPercentages}
            difficultyPercentages={difficultyPercentages}
            aaPercentages={aaPercentages}
            aaMissing={(ar?.aa_missing as number[]) ?? []}
            typePercentages={typePercentages}
            totalAA={Object.keys(aaPercentages).length + ((ar?.aa_missing as number[]) ?? []).length}
            sourceCoverageRate={sourceCoverageRate}
          />
        )}
        {/* ── 6. Analytics section ── */}

        {(Object.keys(bloomPercentages).length > 0 ||

          Object.keys(difficultyPercentages).length > 0 ||

          Object.keys(aaPercentages).length > 0) && (

          <div className="space-y-4">



            {/* ─ Bloom Taxonomy ─ */}

            {Object.keys(bloomPercentages).length > 0 && (

              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

                <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-white">

                  <BarChart3 className="h-4 w-4 text-primary" />

                  <h3 className="text-sm font-semibold">Taxonomie de Bloom</h3>

                  <div className="ml-auto flex items-center gap-2">

                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">LOT</Badge>

                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">HOT</Badge>

                  </div>

                </div>

                <div className="p-5">

                  <BloomStackedBar data={bloomPercentages} />

                  <div className="mt-5">

                    <BloomBarChart data={bloomPercentages} />

                  </div>

                </div>

              </div>

            )}



            {/* ─ HOT/LOT + Difficulty + Types ─ */}

            {(Object.keys(bloomPercentages).length > 0 || Object.keys(difficultyPercentages).length > 0 || Object.keys(typePercentages).length > 0) && (

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">



                {/* HOT vs LOT */}

                {Object.keys(bloomPercentages).length > 0 && (

                  <div className="rounded-xl border border-purple-100 bg-white shadow-sm overflow-hidden">

                    <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-white">

                      <Brain className="h-4 w-4 text-purple-600" />

                      <div>

                        <h3 className="text-sm font-semibold">HOT vs LOT</h3>

                        <p className="text-[10px] text-muted-foreground">Ordre supérieur vs inférieur</p>

                      </div>

                    </div>

                    <div className="p-4">

                      <HOTLOTChart data={bloomPercentages} />

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">

                        <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 text-center">

                          <p className="font-semibold text-blue-700">LOT</p>

                          <p className="text-[10px] text-muted-foreground mt-0.5">Mémoriser · Comprendre · Appliquer</p>

                        </div>

                        <div className="rounded-lg bg-purple-50 border border-purple-100 p-2 text-center">

                          <p className="font-semibold text-purple-700">HOT</p>

                          <p className="text-[10px] text-muted-foreground mt-0.5">Analyser · Évaluer · Créer</p>

                        </div>

                      </div>

                    </div>

                  </div>

                )}



                {/* Difficulty */}

                {Object.keys(difficultyPercentages).length > 0 && (

                  <div className="rounded-xl border border-orange-100 bg-white shadow-sm overflow-hidden">

                    <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-orange-50 to-white">

                      <Target className="h-4 w-4 text-orange-500" />

                      <h3 className="text-sm font-semibold">Niveau de difficulté</h3>

                    </div>

                    <div className="p-4">

                      <DifficultyDonut data={difficultyPercentages} />

                    </div>

                  </div>

                )}



                {/* Types */}

                {Object.keys(typePercentages).length > 0 && (

                  <div className="rounded-xl border border-blue-100 bg-white shadow-sm overflow-hidden">

                    <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-white">

                      <BookOpen className="h-4 w-4 text-blue-500" />

                      <h3 className="text-sm font-semibold">Types de questions</h3>

                    </div>

                    <div className="p-4">

                      <TypeDonut data={typePercentages} />

                    </div>

                  </div>

                )}

              </div>

            )}



            {/* ─ AA Alignment ─ */}

            {(Object.keys(aaPercentages).length > 0 || ((ar?.aa_missing as number[]) ?? []).length > 0) && (

              <div className="rounded-xl border border-green-100 bg-white shadow-sm overflow-hidden">

                <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-green-50 to-white">

                  <Target className="h-4 w-4 text-green-600" />

                  <div>

                    <h3 className="text-sm font-semibold">Alignement aux Acquis d&apos;Apprentissage</h3>

                    <p className="text-[10px] text-muted-foreground">Couverture des AA du cours par l&apos;épreuve</p>

                  </div>

                  <div className="ml-auto flex items-center gap-2">

                    <Badge className="text-xs bg-green-100 text-green-700 border-green-200">

                      {Object.keys(aaPercentages).length} couverts

                    </Badge>

                    {((ar?.aa_missing as number[]) ?? []).length > 0 && (

                      <Badge className="text-xs bg-red-100 text-red-700 border-red-200">

                        {((ar?.aa_missing as number[]) ?? []).length} manquants

                      </Badge>

                    )}

                  </div>

                </div>

                <div className="p-5">

                  {/* Coverage progress bar */}

                  <div className="mb-4">

                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">

                      <span className="font-medium">Couverture globale</span>

                      <span className="font-bold text-green-700">{coveragePct}%</span>

                    </div>

                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">

                      <div

                        className="h-full rounded-full transition-all duration-500"

                        style={{

                          width: `${coveragePct}%`,

                          background: coveragePct >= 80 ? '#22c55e' : coveragePct >= 50 ? '#f59e0b' : '#ef4444',

                        }}

                      />

                    </div>

                  </div>

                  {/* Alignment bar chart */}

                  <AAAlignmentChart

                    aaPercentages={aaPercentages}

                    aaMissing={(ar?.aa_missing as number[]) ?? []}

                  />



                  {/* Comparison with course AA distribution */}

                  {aaDistribution.length > 0 && (

                    <div className="border-t pt-5 mt-3">

                      <div className="flex items-center gap-2 mb-4">

                        <BookOpen className="h-4 w-4 text-blue-500" />

                        <div>

                          <h4 className="text-sm font-semibold">Comparaison avec l&apos;importance dans le cours</h4>

                          <p className="text-[10px] text-muted-foreground">🔵 Poids dans le cours &nbsp;·&nbsp; 🟢 Couverture alignée &nbsp;·&nbsp; 🟠 Couverture avec écart &nbsp;·&nbsp; 🔴 Non couvert</p>

                        </div>

                      </div>

                      <AAComparisonChart

                        aaPercentages={aaPercentages}

                        aaMissing={(ar?.aa_missing as number[]) ?? []}

                        aaDistribution={aaDistribution}

                      />

                    </div>

                  )}

                </div>

              </div>

            )}



          </div>

        )}



        {/* ── 7. Curative Generation ── */}

        {ar && (

          <CurativeGenerationSection

            courseId={courseId}

            examId={examId}

            aaPercentages={aaPercentages}

            aaMissing={(ar.aa_missing as number[]) ?? []}

            bloomPercentages={bloomPercentages}

            recommendations={recommendations}

            onAddToLatex={onAddToLatex}

            onOpenLatex={() => setShowLatex(true)}

            exercises={(() => {

              const seen = new Set<number>();

              const result: Array<{exercise_number: number; exercise_title: string}> = [];

              for (const q of editedQuestions) {

                const num = (q as any).exercise_number ?? 1;

                if (!seen.has(num)) {

                  seen.add(num);

                  result.push({ exercise_number: num, exercise_title: (q as any).exercise_title ?? `Exercice ${num}` });

                }

              }

              return result;

            })()}

          />

        )}



        {/* ── 8. AA Alignment ── */}

        {(coveredCount > 0 || missingCount > 0) && (

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

            <div className="flex items-center gap-2 px-4 py-3 border-b bg-slate-50">

              <Target className="h-4 w-4 text-muted-foreground" />

              <h3 className="text-sm font-semibold">Alignement aux Acquis d&apos;Apprentissage</h3>

              <Badge variant="secondary" className="ml-auto text-xs">{coveragePct}% couvert</Badge>

            </div>

            <div className="p-4 space-y-4">

              <div>

                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">

                  <span>{coveredCount} AA couverts</span>

                  <span>{missingCount} non couverts</span>

                </div>

                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">

                  <div

                    className="h-full bg-green-500 rounded-full transition-all"

                    style={{ width: `${coveragePct}%` }}

                  />

                </div>

              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">

                {Object.entries(aaPercentages).map(([aa, pct]) => (

                  <div key={aa} className="flex items-center gap-2 text-sm">

                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />

                    <span className="font-medium">{aa}</span>

                    <span className="text-muted-foreground ml-auto">{pct}% des questions</span>

                  </div>

                ))}

                {((ar.aa_missing as number[]) ?? []).map((aaNum) => (

                  <div key={aaNum} className="flex items-center gap-2 text-sm">

                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />

                    <span className="font-medium">AA#{aaNum}</span>

                    <span className="text-muted-foreground ml-auto">Non couvert</span>

                  </div>

                ))}

              </div>

            </div>

          </div>

        )}



        {/* ── 8. Insights 3-col ── */}

        {(strengths.length > 0 || recommendations.length > 0 || (ar as any).overall_interpretation) && (

          <div className="grid gap-4 md:grid-cols-3">

            {/* Green — Interprétation */}

            <div className="rounded-xl border border-green-200 bg-green-50 p-4">

              <div className="flex items-center gap-2 mb-3">

                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />

                <h4 className="text-sm font-semibold text-green-900">Interprétation générale</h4>

              </div>

              {(ar as any).overall_interpretation ? (

                <p className="text-sm text-green-800">{(ar as any).overall_interpretation}</p>

              ) : strengths.length > 0 ? (

                <ul className="space-y-1.5">

                  {strengths.map((s, i) => (

                    <li key={i} className="flex gap-2 text-sm text-green-800">

                      <span className="text-green-600 mt-0.5 shrink-0">✓</span>

                      <span>{s}</span>

                    </li>

                  ))}

                </ul>

              ) : (

                <p className="text-sm text-green-700 italic">Aucune interprétation disponible.</p>

              )}

            </div>



            {/* Yellow — Recommandations */}

            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">

              <div className="flex items-center gap-2 mb-3">

                <Zap className="h-4 w-4 text-yellow-600 shrink-0" />

                <h4 className="text-sm font-semibold text-yellow-900">Recommandations</h4>

              </div>

              {recommendations.length > 0 ? (

                <ul className="space-y-1.5">

                  {recommendations.map((r, i) => (

                    <li key={i} className="flex gap-2 text-sm text-yellow-800">

                      <span className="text-yellow-600 mt-0.5 shrink-0">•</span>

                      <span>{r}</span>

                    </li>

                  ))}

                </ul>

              ) : (

                <p className="text-sm text-yellow-700 italic">Aucune recommandation.</p>

              )}

            </div>



            {/* Blue — Propositions (summary or placeholder) */}

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">

              <div className="flex items-center gap-2 mb-3">

                <Lightbulb className="h-4 w-4 text-blue-600 shrink-0" />

                <h4 className="text-sm font-semibold text-blue-900">Propositions d&apos;amélioration</h4>

              </div>

              {improvementProposals.length > 0 ? (

                <p className="text-sm text-blue-800">

                  {improvementProposals.length} proposition{improvementProposals.length > 1 ? 's' : ''} générée{improvementProposals.length > 1 ? 's' : ''} — voir le détail ci-dessous.

                </p>

              ) : (

                <p className="text-sm text-blue-700 italic">Aucune proposition d&apos;amélioration.</p>

              )}

            </div>

          </div>

        )}



        {/* Improvement proposals detail */}

        {improvementProposals.length > 0 && (

          <div className="rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">

            <div className="flex items-center gap-2 px-4 py-3 border-b bg-blue-50">

              <Lightbulb className="h-4 w-4 text-blue-600" />

              <h3 className="text-sm font-semibold">Détail des propositions d&apos;amélioration</h3>

            </div>

            <div className="p-4 space-y-3">

              {improvementProposals.map((p: any, i: number) => (

                <div key={i} className="border border-blue-100 rounded-lg p-3 bg-blue-50/40">

                  <div className="flex flex-wrap gap-2 mb-2">

                    {p.aa && (

                      <Badge variant="outline" className="text-xs">{p.aa}</Badge>

                    )}

                    {p.bloom_level && (

                      <Badge className="text-xs bg-purple-100 text-purple-700">{p.bloom_level}</Badge>

                    )}

                    {p.difficulty && (

                      <Badge

                        className={`text-xs ${

                          p.difficulty === 'Fondamental'

                            ? 'bg-green-100 text-green-700'

                            : p.difficulty === 'Avancé'

                            ? 'bg-red-100 text-red-700'

                            : 'bg-yellow-100 text-yellow-700'

                        }`}

                      >

                        {p.difficulty}

                      </Badge>

                    )}

                    {p.question_type && (

                      <Badge variant="outline" className="text-xs text-sky-600">{p.question_type}</Badge>

                    )}

                  </div>

                  <p className="text-sm font-medium">{p.question_text}</p>

                  {p.rationale && (

                    <p className="text-xs text-muted-foreground mt-1 italic">{p.rationale}</p>

                  )}

                </div>

              ))}

            </div>

          </div>

        )}



        {/* ── 9. LaTeX Editor (collapsible) ── */}

        <div className="rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden">

          <button

            type="button"

            onClick={() => setShowLatex((v) => !v)}

            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/20 transition-colors"

          >

            <FileCode2 className="h-4 w-4 text-violet-600" />

            <h3 className="text-sm font-semibold">Éditeur LaTeX — Nouvelle proposition</h3>

            {showLatex ? (

              <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" />

            ) : (

              <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />

            )}

          </button>

          {showLatex && (

            <div className="border-t p-4">

              <ExamLatexEditor key={`latex-${latexVersion}`} courseId={courseId} examId={examId} initialLatex={latexContent} />

            </div>

          )}

        </div>



        {/* ── 10. MCP Panel (collapsible) ── */}

        <div className="rounded-xl border border-indigo-200 bg-white shadow-sm overflow-hidden">

          <button

            type="button"

            onClick={() => setShowMcp((v) => !v)}

            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/20 transition-colors"

          >

            <Bot className="h-4 w-4 text-indigo-600" />

            <h3 className="text-sm font-semibold">Analyse multi-agents MCP</h3>

            {showMcp ? (

              <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" />

            ) : (

              <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />

            )}

          </button>

          {showMcp && (

            <div className="border-t p-4">

              <ExamMCPPanel

                courseId={courseId}

                documentId={examId}

                documentTitle={exam.title ?? `Épreuve #${examId}`}

              />

            </div>

          )}

        </div>

      </div>

    </>

  );

}



// ─── Evaluation & Suggestions Tab ────────────────────────────────────────────────────────────────

function EvaluationTab({ exam, courseId, onAnalyze, isAnalyzing }: { exam: TnExamDocument; courseId: number; onAnalyze?: () => void; isAnalyzing?: boolean }) {
  const ar = exam.analysis_results;
  const { data: courseDetails } = useCourse(courseId);
  const aaDistribution: Array<{ number: number; description: string; percent: number }> =
    (courseDetails as any)?.tn_aa_distribution ?? [];

  const extractedRaw = (exam.analysis_results as any)?.extracted_questions as ExtractedQuestion[] | undefined;
  const fullQuestions = (ar?.questions as TnExamQuestion[]) ?? [];
  const displayQuestions: any[] = fullQuestions.length > 0
    ? fullQuestions
    : (extractedRaw ?? []).map(convertExtractedToTnExam);

  // ── Header data (from HeaderTab extraction) ──
  const evalHeaderData: ExamHeaderData | null = (exam.analysis_results as any)?.exam_header ?? null;

  const bloomPercentages = (ar?.bloom_percentages as Record<string, number>) ?? {};
  const difficultyPercentages = (ar?.difficulty_percentages as Record<string, number>) ?? {};
  const aaPercentages = (ar?.aa_percentages as Record<string, number>) ?? {};
  const recommendations = (ar?.recommendations as string[]) ?? [];
  const strengths = (ar?.strengths as string[]) ?? [];
  const improvementProposals = (ar?.improvement_proposals as any[]) ?? [];
  const timeAnalysis = ar?.time_analysis as any;
  const sourceCoverageRate = (ar?.source_coverage_rate as number) ?? 0;

  // ── Duration fallbacks: read from Header tab when AI analysis values are 0 or absent ──
  const declaredDuration: number | null =
    (timeAnalysis?.declared_duration_min != null && timeAnalysis.declared_duration_min > 0)
      ? timeAnalysis.declared_duration_min
      : (evalHeaderData?.declared_duration_min ?? null);

  const estimatedFromQuestions = (extractedRaw ?? displayQuestions).reduce(
    (s, q) => s + ((q as any).estimated_time_min ?? 0), 0
  );
  const totalEstimated: number =
    (timeAnalysis?.total_estimated_min != null && timeAnalysis.total_estimated_min > 0)
      ? timeAnalysis.total_estimated_min
      : estimatedFromQuestions;
  const totalWithBuffer: number =
    (timeAnalysis?.total_with_buffer_min != null && timeAnalysis.total_with_buffer_min > 0)
      ? timeAnalysis.total_with_buffer_min
      : Math.round(totalEstimated * 1.10); // 10% buffer, consistent with backend

  // Duration verdict (recomputed when coming from fallback)
  const durationVerdict: string = (() => {
    if (!declaredDuration) return '';
    if (totalWithBuffer <= declaredDuration) return 'OK';
    if (totalEstimated > declaredDuration * 1.1) return 'TROP_LONG';
    return 'OK';
  })();
  const effectiveVerdict = timeAnalysis?.verdict ?? durationVerdict;
  const showDurationSection = (totalEstimated > 0 || declaredDuration != null);

  const typePercentages: Record<string, number> = (() => {
    if (!displayQuestions.length) return {};
    const counts: Record<string, number> = {};
    for (const q of displayQuestions) {
      const t = (q as any)['Type'] ?? (q as any).question_type ?? 'Non défini';
      if (t) counts[t] = (counts[t] ?? 0) + 1;
    }
    const total = displayQuestions.length;
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / total) * 100)]));
  })();

  const coveredCount = Object.keys(aaPercentages).length;
  const missingCount = ((ar?.aa_missing as number[]) ?? []).length;
  const coveragePct = coveredCount + missingCount > 0
    ? Math.round((coveredCount / (coveredCount + missingCount)) * 100) : 100;

  // AA coverage computed from extracted questions aa_numbers (works without AI analysis)
  const extractedAACoveredNums = new Set(
    (extractedRaw ?? []).flatMap((q) => q.aa_numbers ?? [])
  );
  const evalAACoverage = aaDistribution.length > 0
    ? aaDistribution.map((aa) => {
        const coveredByAI = Object.keys(aaPercentages).includes(String(aa.number));
        const coveredByExtract = extractedAACoveredNums.has(aa.number);
        const covered = coveredByAI || coveredByExtract;
        const qCount = (extractedRaw ?? []).filter((q) => q.aa_numbers?.includes(aa.number)).length;
        const pct = aaPercentages[String(aa.number)] ?? (extractedRaw && extractedRaw.length > 0 ? Math.round(qCount / extractedRaw.length * 100) : 0);
        return { ...aa, covered, qCount, pct };
      })
    : [];

  // ── Compute distributions from extracted questions (fallback when no AI analysis) ──
  const totalExtracted = (extractedRaw ?? []).length;
  const bloomLocal: Record<string, number> = {};
  const diffLocal: Record<string, number> = {};
  const typeLocalFromExtract: Record<string, number> = {};

  for (const q of (extractedRaw ?? [])) {
    if (q.bloom_level && q.bloom_level !== 'N/A') bloomLocal[q.bloom_level] = (bloomLocal[q.bloom_level] ?? 0) + 1;
    if (q.difficulty && q.difficulty !== 'N/A') diffLocal[q.difficulty] = (diffLocal[q.difficulty] ?? 0) + 1;
    if (q.question_type && q.question_type !== 'N/A') typeLocalFromExtract[q.question_type] = (typeLocalFromExtract[q.question_type] ?? 0) + 1;
  }

  const toPercents = (counts: Record<string, number>, total: number) =>
    total > 0 ? Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round(v / total * 100)])) : {};

  // Effective distributions: AI analysis first, then local extraction-based
  const effectiveBloom = Object.keys(bloomPercentages).length > 0 ? bloomPercentages : toPercents(bloomLocal, totalExtracted);
  const effectiveDiff = Object.keys(difficultyPercentages).length > 0 ? difficultyPercentages : toPercents(diffLocal, totalExtracted);
  const effectiveType = Object.keys(typePercentages).length > 0 ? typePercentages : toPercents(typeLocalFromExtract, totalExtracted);
  const dataSourceLabel = ar && Object.keys(bloomPercentages).length > 0 ? 'Analyse IA complète' : 'Questions extraites';
  const dataIsFromAI = ar && Object.keys(bloomPercentages).length > 0;

  // Effective AA data from either AI analysis or extracted aa_numbers
  const extractedAACoveredNums2 = new Set((extractedRaw ?? []).flatMap((q) => q.aa_numbers ?? []));
  const aaFromExtracted: Record<string, number> = {};
  if (totalExtracted > 0) {
    for (const aaNum of extractedAACoveredNums2) {
      const qCount = (extractedRaw ?? []).filter((q) => q.aa_numbers?.includes(aaNum)).length;
      aaFromExtracted[String(aaNum)] = Math.round(qCount / totalExtracted * 100);
    }
  }
  const effectiveAAPercentages = Object.keys(aaPercentages).length > 0 ? aaPercentages : aaFromExtracted;
  const effectiveAAMissing = ((ar?.aa_missing as number[]) ?? []).length > 0
    ? (ar?.aa_missing as number[] ?? [])
    : aaDistribution.filter((aa) => !extractedAACoveredNums2.has(aa.number)).map((aa) => aa.number);
  const effectiveCoveredCount = Object.keys(effectiveAAPercentages).length;
  const effectiveMissingCount = effectiveAAMissing.length;
  const effectiveCoveragePct = effectiveCoveredCount + effectiveMissingCount > 0
    ? Math.round((effectiveCoveredCount / (effectiveCoveredCount + effectiveMissingCount)) * 100) : 0;

  const hasData = (ar && (Object.keys(bloomPercentages).length > 0 || displayQuestions.length > 0))
    || evalHeaderData !== null
    || (extractedRaw && extractedRaw.length > 0);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <BarChart3 className="h-16 w-16 text-muted-foreground" />
        <h3 className="text-xl font-semibold">Évaluation non disponible</h3>
        <p className="text-muted-foreground text-center max-w-sm">
          Lancez l&apos;analyse IA dans l&apos;onglet <strong>Analyse AI</strong> pour générer les graphiques et le diagnostic.
        </p>
        {extractedRaw && extractedRaw.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <Target className="h-4 w-4 shrink-0" />
            <span><strong>{extractedRaw.length} questions</strong> extraites — une analyse complète est nécessaire pour calculer les distributions.</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">

      {/* ══════════════════════════ SECTION 1 : Graphiques ══════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <div className="h-1 w-8 rounded-full bg-blue-500" />
          <h2 className="text-lg font-bold">Graphiques d&apos;évaluation</h2>
          <Badge variant="outline" className={`text-xs ml-auto ${dataIsFromAI ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
            {dataIsFromAI ? '✓ Analyse IA' : '⚡ Questions extraites'}
          </Badge>
        </div>
        <div className="space-y-5">

          {/* Prompt to run analysis if not done yet */}
          {!dataIsFromAI && onAnalyze && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 flex items-center gap-3">
              <Brain className="h-5 w-5 text-violet-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-violet-800">Affichage basé sur les questions extraites</p>
                <p className="text-xs text-violet-600 mt-0.5">Lancez l&apos;analyse IA complète pour obtenir des graphiques enrichis, un diagnostic approfondi et des suggestions personnalisées.</p>
              </div>
              <Button size="sm" className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white" onClick={onAnalyze} disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <><span className="animate-spin mr-1.5">⚙</span>Analyse…</>
                ) : (
                  <><Brain className="h-3.5 w-3.5 mr-1.5" />Lancer l&apos;analyse IA</>
                )}
              </Button>
            </div>
          )}

          {/* Score global */}
          {(Object.keys(effectiveBloom).length > 0 || Object.keys(effectiveAAPercentages).length > 0) && (
            <EvaluationScoreCards bloomPercentages={effectiveBloom} difficultyPercentages={effectiveDiff}
              aaPercentages={effectiveAAPercentages} aaMissing={effectiveAAMissing}
              typePercentages={typePercentages} totalAA={effectiveCoveredCount + effectiveMissingCount} sourceCoverageRate={sourceCoverageRate} />
          )}

          {/* Durée */}
          {showDurationSection && (
            <div className="rounded-xl border border-blue-100 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-white">
                <Clock className="h-4 w-4 text-blue-500" />
                <div><h3 className="text-sm font-semibold">Analyse de la durée</h3><p className="text-[10px] text-muted-foreground">Durée estimée vs déclarée</p></div>
                <div className="ml-auto">
                  {effectiveVerdict === 'OK' && <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">✅ Timing optimal</Badge>}
                  {effectiveVerdict === 'TROP_LONG' && <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">⚠️ Trop longue</Badge>}
                  {effectiveVerdict === 'TROP_COURT' && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">⚡ Trop courte</Badge>}
                  {!ar && evalHeaderData && <Badge variant="outline" className="text-xs text-slate-500">Depuis l&apos;en-tête</Badge>}
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-100"><p className="text-2xl font-bold text-blue-700">{totalEstimated > 0 ? totalEstimated : '—'}</p><p className="text-xs text-blue-600 mt-1">min estimées</p><p className="text-[9px] text-blue-400 mt-0.5">{ar?.time_analysis ? 'Analyse IA' : 'Gemini / question'}</p></div>
                  <div className="text-center p-3 rounded-lg bg-orange-50 border border-orange-100"><p className="text-2xl font-bold text-orange-700">{totalWithBuffer > 0 ? totalWithBuffer : '—'}</p><p className="text-xs text-orange-600 mt-1">min avec marge +25%</p></div>
                  <div className="text-center p-3 rounded-lg bg-green-50 border border-green-100"><p className="text-2xl font-bold text-green-700">{declaredDuration ?? '—'}</p><p className="text-xs text-green-600 mt-1">min déclarées</p></div>
                </div>
                {(totalEstimated > 0 || declaredDuration != null) && (
                  <DurationBarChart estimated={totalEstimated} buffer={totalWithBuffer} declared={declaredDuration} />
                )}
              </div>
            </div>
          )}

          {/* Bloom + HOT/LOT + Radar */}
          {Object.keys(effectiveBloom).length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-white">
                    <BarChart3 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Taxonomie de Bloom</h3>
                    <div className="ml-auto flex gap-1"><Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">LOT</Badge><Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">HOT</Badge></div>
                  </div>
                  <div className="p-5"><BloomStackedBar data={effectiveBloom} /><div className="mt-4"><BloomBarChart data={effectiveBloom} /></div></div>
                </div>
                <div className="rounded-xl border border-purple-100 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-white">
                    <Brain className="h-4 w-4 text-purple-600" /><div><h3 className="text-sm font-semibold">HOT vs LOT</h3><p className="text-[10px] text-muted-foreground">Ordre supérieur vs inférieur</p></div>
                  </div>
                  <div className="p-4">
                    <HOTLOTChart data={effectiveBloom} />
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 text-center"><p className="font-semibold text-blue-700">LOT</p><p className="text-[10px] text-muted-foreground mt-0.5">Mémoriser · Comprendre · Appliquer</p></div>
                      <div className="rounded-lg bg-purple-50 border border-purple-100 p-2 text-center"><p className="font-semibold text-purple-700">HOT</p><p className="text-[10px] text-muted-foreground mt-0.5">Analyser · Évaluer · Créer</p></div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Radar Bloom */}
              <div className="rounded-xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-indigo-50 to-white">
                  <BarChart3 className="h-4 w-4 text-indigo-500" />
                  <div><h3 className="text-sm font-semibold">Radar — Bloom multidimensionnel</h3><p className="text-[10px] text-muted-foreground">Distribution sur les 6 niveaux de la taxonomie</p></div>
                </div>
                <div className="p-5 flex justify-center">
                  <div className="w-full max-w-sm"><BloomRadarChart bloomPercentages={effectiveBloom} /></div>
                </div>
              </div>
            </div>
          )}

          {/* Difficulté vs Idéal + Types + Sources */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.keys(effectiveDiff).length > 0 && (
              <div className="rounded-xl border border-orange-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-orange-50 to-white">
                  <Target className="h-4 w-4 text-orange-500" /><div><h3 className="text-sm font-semibold">Difficulté vs Distribution idéale</h3><p className="text-[10px] text-muted-foreground">Idéal : 10%-20%-40%-20%-10%</p></div>
                </div>
                <div className="p-4"><DifficultyBalanceChart data={effectiveDiff} /></div>
              </div>
            )}
            {Object.keys(effectiveType).length > 0 && (
              <div className="rounded-xl border border-blue-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-white">
                  <BookOpen className="h-4 w-4 text-blue-500" /><h3 className="text-sm font-semibold">Types de questions</h3>
                </div>
                <div className="p-4"><TypeDonut data={effectiveType} /></div>
              </div>
            )}
            {sourceCoverageRate > 0 && (
              <div className="rounded-xl border border-teal-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-teal-50 to-white">
                  <FileBarChart2 className="h-4 w-4 text-teal-500" /><div><h3 className="text-sm font-semibold">Couverture documentaire</h3><p className="text-[10px] text-muted-foreground">% questions liées à des sources</p></div>
                </div>
                <div className="p-4"><SourceCoverageDonut rate={sourceCoverageRate} /></div>
              </div>
            )}
          </div>

          {/* Barème par exercice */}
          {displayQuestions.length > 0 && (
            <div className="rounded-xl border border-green-100 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-green-50 to-white">
                <Zap className="h-4 w-4 text-green-600" /><div><h3 className="text-sm font-semibold">Répartition du barème par exercice</h3><p className="text-[10px] text-muted-foreground">Points attribués par exercice</p></div>
              </div>
              <div className="p-5"><PointsPerExerciseChart questions={displayQuestions} /></div>
            </div>
          )}

          {/* AA Alignment */}
          {(Object.keys(effectiveAAPercentages).length > 0 || effectiveMissingCount > 0 || aaDistribution.length > 0) && (
            <div className="rounded-xl border border-green-100 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-green-50 to-white">
                <Target className="h-4 w-4 text-green-600" />
                <div><h3 className="text-sm font-semibold">Alignement Acquis d&apos;Apprentissage</h3><p className="text-[10px] text-muted-foreground">Couverture des AA du cours par l&apos;épreuve</p></div>
                <div className="ml-auto flex gap-2">
                  <Badge className="text-xs bg-green-100 text-green-700 border-green-200">{effectiveCoveredCount} couverts</Badge>
                  {effectiveMissingCount > 0 && <Badge className="text-xs bg-red-100 text-red-700 border-red-200">{effectiveMissingCount} manquants</Badge>}
                </div>
              </div>
              <div className="p-5">
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5"><span className="font-medium">Couverture globale</span><span className="font-bold text-green-700">{effectiveCoveragePct}%</span></div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${effectiveCoveragePct}%`, background: effectiveCoveragePct >= 80 ? '#22c55e' : effectiveCoveragePct >= 50 ? '#f59e0b' : '#ef4444' }} />
                  </div>
                </div>
                <AAAlignmentChart aaPercentages={effectiveAAPercentages} aaMissing={effectiveAAMissing} />
                {aaDistribution.length > 0 && (
                  <div className="border-t pt-5 mt-3">
                    <div className="flex items-center gap-2 mb-4"><BookOpen className="h-4 w-4 text-blue-500" /><div><h4 className="text-sm font-semibold">Comparaison avec l&apos;importance dans le cours</h4><p className="text-[10px] text-muted-foreground">🔵 Poids cours · 🟢 Aligné · 🟠 Écart · 🔴 Non couvert</p></div></div>
                    <AAComparisonChart aaPercentages={effectiveAAPercentages} aaMissing={effectiveAAMissing} aaDistribution={aaDistribution} />
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ══════════════════════════ SECTION 2 : Diagnostic ══════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <div className="h-1 w-8 rounded-full bg-violet-500" />
          <h2 className="text-lg font-bold">Diagnostic &amp; Suggestions</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Points forts */}
          <div className="rounded-xl border border-green-200 bg-green-50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-green-200 bg-green-100/50">
              <CheckCircle2 className="h-4 w-4 text-green-600" /><h3 className="text-sm font-semibold text-green-800">Points forts</h3>
              <Badge className="ml-auto text-xs bg-green-200 text-green-800 border-0">{strengths.length}</Badge>
            </div>
            <div className="p-4 space-y-2">
              {strengths.length > 0 ? strengths.map((s, i) => (
                <div key={i} className="flex gap-2 text-sm text-green-800"><span className="shrink-0 mt-0.5">✅</span><span>{s}</span></div>
              )) : <p className="text-sm text-green-600 italic">Lancez l&apos;analyse pour identifier les points forts.</p>}
            </div>
          </div>

          {/* Points à améliorer */}
          <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-orange-200 bg-orange-100/50">
              <AlertTriangle className="h-4 w-4 text-orange-600" /><h3 className="text-sm font-semibold text-orange-800">Points à améliorer</h3>
              <Badge className="ml-auto text-xs bg-orange-200 text-orange-800 border-0">{recommendations.length}</Badge>
            </div>
            <div className="p-4 space-y-2">
              {recommendations.length > 0 ? recommendations.map((r, i) => (
                <div key={i} className="flex gap-2 text-sm text-orange-800"><span className="shrink-0 mt-0.5">⚠️</span><span>{r}</span></div>
              )) : <p className="text-sm text-orange-600 italic">Aucune recommandation pour l&apos;instant.</p>}
            </div>
          </div>

          {/* Suggestions d'amélioration */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-200 bg-blue-100/50">
              <Lightbulb className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-semibold text-blue-800">Suggestions</h3>
              <Badge className="ml-auto text-xs bg-blue-200 text-blue-800 border-0">{improvementProposals.length}</Badge>
            </div>
            <div className="p-4 space-y-3">
              {improvementProposals.length > 0 ? improvementProposals.slice(0, 6).map((p: any, i: number) => (
                <div key={i} className="rounded-lg bg-white border border-blue-100 p-3 shadow-sm">
                  <div className="flex gap-1 flex-wrap mb-2">
                    {p.aa && <Badge variant="outline" className="text-xs">AA#{p.aa}</Badge>}
                    {p.bloom_level && <Badge className="text-xs bg-purple-100 text-purple-700 border-0">{p.bloom_level}</Badge>}
                    {p.difficulty && <Badge className="text-xs bg-orange-100 text-orange-700 border-0">{p.difficulty}</Badge>}
                    {p.question_type && <Badge variant="outline" className="text-xs">{p.question_type}</Badge>}
                  </div>
                  <p className="text-xs text-slate-700 line-clamp-3">{p.question_text}</p>
                  {p.rationale && <p className="text-[10px] text-slate-500 mt-1.5 italic border-t border-blue-50 pt-1.5">{p.rationale}</p>}
                </div>
              )) : <p className="text-sm text-blue-600 italic">Aucune suggestion disponible.</p>}
            </div>
          </div>
        </div>

        {/* AA Coverage breakdown */}
        {evalAACoverage.length > 0 && (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-teal-200 bg-teal-100/50">
              <Target className="h-4 w-4 text-teal-600" />
              <h3 className="text-sm font-semibold text-teal-800">Couverture des AAs du cours</h3>
              <Badge className="ml-auto text-xs bg-teal-200 text-teal-800 border-0">
                {evalAACoverage.filter((a) => a.covered).length}/{evalAACoverage.length} couverts
              </Badge>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {evalAACoverage.map((aa) => (
                <div key={aa.number} className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${aa.covered ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <span className={`text-base font-bold w-5 text-center shrink-0 ${aa.covered ? 'text-green-600' : 'text-red-400'}`}>{aa.covered ? '✓' : '✗'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate">AA{aa.number} — {aa.description}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="flex-1 bg-white/70 rounded-full h-1">
                        <div className={`h-1 rounded-full ${aa.covered ? 'bg-green-500' : 'bg-red-300'}`} style={{ width: `${Math.min(aa.pct, 100)}%` }} />
                      </div>
                      <span className="text-[9px] text-slate-500 shrink-0">{aa.qCount} Q</span>
                    </div>
                  </div>
                  {!aa.covered && (
                    <Badge className="text-[9px] px-1 py-0 bg-red-100 text-red-600 border-red-200 shrink-0">Non couvert</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verdict temporel */}
        {timeAnalysis && (
          <div className={`mt-5 rounded-xl border-2 p-5 ${timeAnalysis.verdict === 'OK' ? 'border-green-300 bg-green-50' : timeAnalysis.verdict === 'TROP_LONG' ? 'border-red-300 bg-red-50' : 'border-yellow-300 bg-yellow-50'}`}>
            <div className="flex items-start gap-3">
              <Clock className={`h-5 w-5 shrink-0 mt-0.5 ${timeAnalysis.verdict === 'OK' ? 'text-green-600' : timeAnalysis.verdict === 'TROP_LONG' ? 'text-red-600' : 'text-yellow-600'}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-sm">Verdict temporel</h4>
                  {timeAnalysis.verdict === 'OK' && <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">✅ Timing optimal</Badge>}
                  {timeAnalysis.verdict === 'TROP_LONG' && <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">⚠️ Épreuve trop longue</Badge>}
                  {timeAnalysis.verdict === 'TROP_COURT' && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">⚡ Durée sous-estimée</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Estimée : <strong>{timeAnalysis.total_estimated_min} min</strong> · Avec marge (+25%) : <strong>{timeAnalysis.total_with_buffer_min} min</strong> · Déclarée : <strong>{timeAnalysis.declared_duration_min ?? '—'} min</strong>
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}

// ─── Nouvelle Proposition Tab ──────────────────────────────────────────────────────────────────────────

const BLOOM_OPTIONS = ['Mémorisation', 'Compréhension', 'Application', 'Analyse', 'Évaluation', 'Création'];
const DIFF_OPTIONS = ['Fondamental', 'Intermédiaire', 'Avancé', 'Expert'];
const TYPE_OPTIONS = ['QCM', 'Ouvert', 'Pratique', 'Vrai/Faux', 'Calcul', 'Analyse'];

let _proposedIdCounter = 0;
const newPropId = () => `prop_${++_proposedIdCounter}_${Date.now()}`;

function PropositionTab({
  exam, courseId, examId, onSaved,
}: {
  exam: TnExamDocument; courseId: number; examId: number; onSaved: () => void;
}) {
  const extractedRaw = (exam.analysis_results as any)?.extracted_questions as ExtractedQuestion[] | undefined;
  const headerData: ExamHeaderData | null = (exam.analysis_results as any)?.exam_header ?? null;

  // ── Initialize proposed questions from extractedRaw ──
  const initQuestions = (): ProposedQuestion[] =>
    (extractedRaw ?? []).map((q) => ({
      local_id: newPropId(),
      exercise_number: q.exercise_number,
      exercise_title: q.exercise_title ?? `Exercice ${q.exercise_number}`,
      text: q.text,
      bloom: q.bloom_level,
      difficulty: q.difficulty,
      type: q.question_type,
      points: q.points ?? 1,
      estimated_time_min: q.estimated_time_min ?? undefined,
      has_figure: q.has_figure,
      aa_numbers: q.aa_numbers ?? undefined,
      source: 'extracted' as const,
      status: 'pending' as const,
    }));

  const [questions, setQuestions] = useState<ProposedQuestion[]>(initQuestions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ProposedQuestion>>({});

  // Generation state per exercise
  const [genConfigs, setGenConfigs] = useState<Record<number, ExerciseGenConfig>>({});
  const [generatingEx, setGeneratingEx] = useState<number | null>(null);

  // New exercise form
  const [newExTitle, setNewExTitle] = useState('');
  const [newExCount, setNewExCount] = useState(3);
  const [showAddExercise, setShowAddExercise] = useState(false);

  // LaTeX + save state
  const [showLatex, setShowLatex] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveMutation = useSaveTnExamAnalysis(courseId, examId);

  // ── Helpers ──
  const confirmedQuestions = questions.filter((q) => q.status === 'confirmed');
  const exerciseNumbers = [...new Set(questions.map((q) => q.exercise_number))].sort((a, b) => a - b);

  const buildMeta = () => ({
    exam_name: headerData?.exam_name ?? exam.title ?? 'Épreuve',
    class_name: headerData?.class_name ?? '',
    declared_duration_min: headerData?.declared_duration_min ?? null,
    exam_date: headerData?.exam_date ?? '',
    instructors: headerData?.instructors ?? [],
    language: headerData?.language ?? 'Français',
    exam_type: headerData?.exam_type ?? '',
  });

  const buildLatex = () => {
    const meta = buildMeta();
    const qs = confirmedQuestions.map((q, i) => ({
      id: i + 1,
      exercise_number: q.exercise_number,
      exercise_title: q.exercise_title,
      text: q.text,
      points: q.points,
    }));
    return buildLatexFromQuestions(meta.exam_name, meta, qs);
  };

  // ── Edit helpers ──
  const startEdit = (q: ProposedQuestion) => { setEditingId(q.local_id); setEditDraft({ ...q }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };
  const saveEdit = (id: string) => {
    setQuestions((prev) => prev.map((q) => q.local_id === id ? { ...q, ...editDraft, status: 'pending' } : q));
    setEditingId(null); setEditDraft({});
  };
  const confirmQ = (id: string) => setQuestions((prev) => prev.map((q) => q.local_id === id ? { ...q, status: 'confirmed' } : q));
  const unconfirmQ = (id: string) => setQuestions((prev) => prev.map((q) => q.local_id === id ? { ...q, status: 'pending' } : q));
  const deleteQ = (id: string) => setQuestions((prev) => prev.filter((q) => q.local_id !== id));

  // ── Generation config ──
  const initGenConfig = (exNum: number, exTitle: string, count: number): ExerciseGenConfig => ({
    exercise_number: exNum,
    exercise_title: exTitle,
    dependent: false,
    questions_config: Array.from({ length: count }, () => ({
      bloom: 'Compréhension', difficulty: 'Intermédiaire', type: 'Ouvert', points: 2,
    })),
  });

  const addNewExercise = () => {
    if (!newExTitle.trim()) { toast.error('Entrez un titre pour l\'exercice'); return; }
    const exNum = Math.max(0, ...exerciseNumbers) + 1;
    setGenConfigs((prev) => ({ ...prev, [exNum]: initGenConfig(exNum, newExTitle.trim(), newExCount) }));
    setNewExTitle(''); setNewExCount(3); setShowAddExercise(false);
  };

  const updateGenCount = (exNum: number, count: number) => {
    setGenConfigs((prev) => {
      const cfg = prev[exNum] ?? initGenConfig(exNum, `Exercice ${exNum}`, count);
      const qCfg = [...cfg.questions_config];
      while (qCfg.length < count) qCfg.push({ bloom: 'Compréhension', difficulty: 'Intermédiaire', type: 'Ouvert', points: 2 });
      return { ...prev, [exNum]: { ...cfg, questions_config: qCfg.slice(0, count) } };
    });
  };

  const handleGenerate = async (exNum: number) => {
    const cfg = genConfigs[exNum];
    if (!cfg) return;
    setGeneratingEx(exNum);
    try {
      const res = await tnExamsApi.generateExerciseQuestions(courseId, examId, cfg);
      const generated = res.data.questions.map((q) => ({
        local_id: newPropId(),
        exercise_number: exNum,
        exercise_title: cfg.exercise_title,
        text: q.text,
        bloom: q.bloom_level,
        difficulty: q.difficulty,
        type: q.question_type,
        points: q.points,
        estimated_time_min: q.estimated_time_min,
        aa_numbers: q.aa_numbers ?? undefined,
        rationale: q.rationale ?? undefined,
        source: 'generated' as const,
        status: 'pending' as const,
      }));
      setQuestions((prev) => [...prev, ...generated]);
      toast.success(`${generated.length} question${generated.length > 1 ? 's' : ''} générée${generated.length > 1 ? 's' : ''} !`);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        toast.error('Génération IA en cours de développement côté backend. Revenez bientôt !');
      } else {
        toast.error(err?.response?.data?.error || 'Erreur lors de la génération');
      }
    } finally { setGeneratingEx(null); }
  };

  const handleSave = async () => {
    if (confirmedQuestions.length === 0) { toast.error('Confirmez au moins une question avant de sauvegarder.'); return; }
    setIsSaving(true);
    try {
      await saveMutation.mutateAsync({
        exam_metadata: buildMeta() as any,
        questions: confirmedQuestions.map((q, i) => ({
          id: i + 1,
          Text: q.text,
          Bloom_Level: q.bloom,
          Difficulty: q.difficulty,
          Type: q.type,
          points: q.points,
          estimated_time_min: q.estimated_time_min ?? null,
          exercise_number: q.exercise_number,
          exercise_title: q.exercise_title,
        })),
      });
      toast.success(`Proposition sauvegardée — ${confirmedQuestions.length} questions confirmées`);
      onSaved();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally { setIsSaving(false); }
  };

  // ── Preview chart data ──
  const previewBloom: Record<string, number> = {};
  const previewDiff: Record<string, number> = {};
  for (const q of confirmedQuestions) {
    previewBloom[q.bloom] = (previewBloom[q.bloom] ?? 0) + 1;
    previewDiff[q.difficulty] = (previewDiff[q.difficulty] ?? 0) + 1;
  }

  const previewExPoints: Record<string, number> = {};
  for (const q of confirmedQuestions) {
    const k = q.exercise_title ?? `Exercice ${q.exercise_number}`;
    previewExPoints[k] = (previewExPoints[k] ?? 0) + q.points;
  }

  const allExercises = [...new Set([
    ...exerciseNumbers,
    ...Object.keys(genConfigs).map(Number),
  ])].sort((a, b) => a - b);

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2"><Zap className="h-4 w-4 text-violet-500" /> Nouvelle Proposition d&apos;Examen</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Composez, générez et confirmez les questions. Exportez en LaTeX.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{confirmedQuestions.length} confirmée{confirmedQuestions.length > 1 ? 's' : ''}</Badge>
          <Badge variant="outline" className="text-xs">{questions.length} au total</Badge>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowLatex((v) => !v)}>
            <FileCode2 className="h-3.5 w-3.5" />{showLatex ? 'Masquer LaTeX' : 'Voir LaTeX'}
          </Button>
          <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleSave} disabled={isSaving || confirmedQuestions.length === 0}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Sauvegarder
          </Button>
        </div>
      </div>

      {/* ── Empty state ── */}
      {questions.length === 0 && Object.keys(genConfigs).length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <FileText className="h-14 w-14 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-600">Aucune question</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Extrayez d&apos;abord les questions dans l&apos;onglet <strong>Questions</strong>, puis revenez ici pour composer votre nouvelle proposition.
          </p>
        </div>
      )}

      <div className={`grid gap-6 ${showLatex ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="space-y-6">

          {/* ══ Section 1 : Questions existantes par exercice ══ */}
          {allExercises.filter((exNum) => questions.some((q) => q.exercise_number === exNum)).map((exNum) => {
            const exQs = questions.filter((q) => q.exercise_number === exNum);
            const exTitle = exQs[0]?.exercise_title ?? `Exercice ${exNum}`;
            const confirmedCount = exQs.filter((q) => q.status === 'confirmed').length;
            const totalPts = exQs.filter((q) => q.status === 'confirmed').reduce((s, q) => s + q.points, 0);

            return (
              <div key={exNum} className="rounded-xl border border-amber-200 overflow-hidden shadow-sm">
                {/* Exercise header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white text-xs font-bold shrink-0">{exNum}</div>
                  <span className="font-semibold text-amber-900 text-sm flex-1">{exTitle}</span>
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">{confirmedCount}/{exQs.length} confirmées</Badge>
                  {totalPts > 0 && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">{totalPts} pts</Badge>}
                </div>

                <div className="divide-y divide-slate-50 bg-white">
                  {exQs.map((q) => (
                    <div key={q.local_id} className={`px-4 py-3 transition-colors ${q.status === 'confirmed' ? 'bg-green-50' : 'bg-white'}`}>
                      {editingId === q.local_id ? (
                        /* ── Inline edit form ── */
                        <div className="space-y-3">
                          <textarea
                            className="w-full text-sm border rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
                            rows={3}
                            value={editDraft.text ?? ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, text: e.target.value }))}
                          />
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {[
                              { label: 'Bloom', key: 'bloom' as const, options: BLOOM_OPTIONS },
                              { label: 'Difficulté', key: 'difficulty' as const, options: DIFF_OPTIONS },
                              { label: 'Type', key: 'type' as const, options: TYPE_OPTIONS },
                            ].map(({ label, key, options }) => (
                              <div key={key}>
                                <label className="text-[10px] text-muted-foreground">{label}</label>
                                <select className="w-full text-xs border rounded px-2 py-1 mt-0.5"
                                  value={editDraft[key] ?? ''}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, [key]: e.target.value }))}>
                                  {options.map((o) => <option key={o}>{o}</option>)}
                                </select>
                              </div>
                            ))}
                            <div>
                              <label className="text-[10px] text-muted-foreground">Points</label>
                              <input type="number" min={0} step={0.5}
                                className="w-full text-xs border rounded px-2 py-1 mt-0.5"
                                value={editDraft.points ?? 1}
                                onChange={(e) => setEditDraft((d) => ({ ...d, points: parseFloat(e.target.value) || 0 }))} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="gap-1 bg-violet-600 hover:bg-violet-700 text-white text-xs" onClick={() => saveEdit(q.local_id)}>
                              <Save className="h-3 w-3" /> Enregistrer
                            </Button>
                            <Button size="sm" variant="ghost" className="text-xs" onClick={cancelEdit}>Annuler</Button>
                          </div>
                        </div>
                      ) : (
                        /* ── Normal display ── */
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800 leading-snug">{q.text}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              <Badge className={`text-[10px] px-1.5 py-0 ${BLOOM_BADGE_COLORS[q.bloom as keyof typeof BLOOM_BADGE_COLORS] ?? 'bg-slate-100 text-slate-600'}`}>{q.bloom}</Badge>
                              <Badge className={`text-[10px] px-1.5 py-0 ${DIFF_BADGE_COLORS[q.difficulty as keyof typeof DIFF_BADGE_COLORS] ?? 'bg-slate-100 text-slate-600'}`}>{q.difficulty}</Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{q.type}</Badge>
                              {q.points > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-700 border-emerald-200">{q.points} pt{q.points > 1 ? 's' : ''}</Badge>}
                              {q.aa_numbers && q.aa_numbers.length > 0 && q.aa_numbers.map((n) => (
                                <Badge key={n} className="text-[10px] px-1.5 py-0 bg-teal-100 text-teal-700 border-teal-200">AA{n}</Badge>
                              ))}
                              {q.source === 'generated' && <Badge className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 border-violet-200">IA</Badge>}
                              {q.status === 'confirmed' && <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">✓ Confirmée</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {q.status === 'confirmed' ? (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-700 hover:text-green-800" onClick={() => unconfirmQ(q.local_id)}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500 hover:text-green-700" title="Confirmer" onClick={() => confirmQ(q.local_id)}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500 hover:text-violet-700" title="Modifier" onClick={() => startEdit(q)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400 hover:text-red-600" title="Supprimer" onClick={() => deleteQ(q.local_id)}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Generation config for this exercise */}
                {genConfigs[exNum] && (
                  <div className="border-t border-violet-100 bg-violet-50 p-4">
                    <GenerationConfigPanel
                      config={genConfigs[exNum]}
                      isGenerating={generatingEx === exNum}
                      onChange={(cfg) => setGenConfigs((prev) => ({ ...prev, [exNum]: cfg }))}
                      onGenerate={() => handleGenerate(exNum)}
                    />
                  </div>
                )}
                {!genConfigs[exNum] && (
                  <button
                    className="w-full text-xs text-violet-600 hover:text-violet-800 py-2 border-t border-amber-100 bg-amber-50 hover:bg-violet-50 transition-colors flex items-center justify-center gap-1.5"
                    onClick={() => setGenConfigs((prev) => ({ ...prev, [exNum]: initGenConfig(exNum, exTitle, 2) }))}
                  >
                    <Zap className="h-3 w-3" /> Proposer des questions pour cet exercice
                  </button>
                )}
              </div>
            );
          })}

          {/* New exercises (only in genConfigs, not yet in questions) */}
          {Object.entries(genConfigs).filter(([exNum]) => !questions.some((q) => q.exercise_number === Number(exNum))).map(([exNumStr, cfg]) => {
            const exNum = Number(exNumStr);
            return (
              <div key={exNum} className="rounded-xl border border-violet-200 overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 border-b border-violet-200">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-violet-500 text-white text-xs font-bold shrink-0">{exNum}</div>
                  <span className="font-semibold text-violet-900 text-sm flex-1">{cfg.exercise_title}</span>
                  <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]">Nouvel exercice</Badge>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-slate-400 hover:text-red-500"
                    onClick={() => setGenConfigs((prev) => { const n = { ...prev }; delete n[exNum]; return n; })}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="p-4 bg-white">
                  <GenerationConfigPanel
                    config={cfg}
                    isGenerating={generatingEx === exNum}
                    onChange={(newCfg) => setGenConfigs((prev) => ({ ...prev, [exNum]: newCfg }))}
                    onGenerate={() => handleGenerate(exNum)}
                  />
                </div>
              </div>
            );
          })}

          {/* ══ Section 2 : Ajouter un exercice ══ */}
          {showAddExercise ? (
            <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50 p-5">
              <h3 className="text-sm font-semibold text-violet-800 mb-3 flex items-center gap-2"><Zap className="h-4 w-4" /> Nouvel exercice</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">Titre de l&apos;exercice</label>
                  <input className="w-full mt-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    placeholder="Ex: Exercice 3 — Analyse réseau"
                    value={newExTitle} onChange={(e) => setNewExTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nb de questions</label>
                  <input type="number" min={1} max={20}
                    className="w-full mt-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    value={newExCount} onChange={(e) => setNewExCount(Math.max(1, parseInt(e.target.value) || 1))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5" onClick={addNewExercise}>
                  <Zap className="h-3.5 w-3.5" /> Créer et configurer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddExercise(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <button
              className="w-full rounded-xl border-2 border-dashed border-violet-200 py-5 text-sm text-violet-500 hover:border-violet-400 hover:text-violet-700 hover:bg-violet-50 transition-all flex items-center justify-center gap-2"
              onClick={() => setShowAddExercise(true)}>
              <Zap className="h-4 w-4" /> Ajouter un exercice et générer des questions
            </button>
          )}

          {/* ══ Section 3 : Prévisualisation (mini-charts) ══ */}
          {confirmedQuestions.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-white">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold">Prévisualisation — Questions confirmées</h3>
                <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">{confirmedQuestions.length} questions · {confirmedQuestions.reduce((s, q) => s + q.points, 0)} pts</Badge>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Bloom Radar */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-2">Bloom</p>
                  <BloomRadarChart bloomPercentages={Object.fromEntries(
                    Object.entries(previewBloom).map(([k, v]) => [k, Math.round(v / confirmedQuestions.length * 100)])
                  )} />
                </div>
                {/* Difficulté */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-2">Difficulté</p>
                  <Doughnut
                    data={{
                      labels: Object.keys(previewDiff),
                      datasets: [{ data: Object.values(previewDiff), backgroundColor: ['#22c55e','#f59e0b','#ef4444','#8b5cf6'], borderWidth: 1 }],
                    }}
                    options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }}
                  />
                </div>
                {/* Points par exercice */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-2">Points / Exercice</p>
                  {Object.keys(previewExPoints).length > 0 ? (
                    <ChartBar
                      data={{
                        labels: Object.keys(previewExPoints).map((k) => k.length > 12 ? k.slice(0, 12) + '…' : k),
                        datasets: [{ label: 'Points', data: Object.values(previewExPoints), backgroundColor: '#6366f188', borderColor: '#6366f1', borderWidth: 2, borderRadius: 4 }],
                      }}
                      options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
                    />
                  ) : <p className="text-xs text-muted-foreground text-center mt-4">—</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══ Section LaTeX ══ */}
        {showLatex && (
          <div className="rounded-xl border border-slate-200 bg-slate-900 overflow-hidden shadow-sm sticky top-4 self-start">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 bg-slate-800">
              <FileCode2 className="h-4 w-4 text-slate-300" />
              <h3 className="text-sm font-semibold text-slate-200">Éditeur LaTeX — Proposition</h3>
              <Button size="sm" variant="ghost" className="ml-auto text-slate-300 hover:text-white h-7 px-2 text-xs"
                onClick={() => { navigator.clipboard.writeText(buildLatex()); toast.success('LaTeX copié !'); }}>
                <Download className="h-3 w-3 mr-1" /> Copier
              </Button>
            </div>
            <pre className="text-xs text-green-300 p-4 overflow-auto max-h-[70vh] font-mono leading-relaxed whitespace-pre-wrap">
              {buildLatex() || '% Confirmez des questions pour générer le LaTeX'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-component: Generation Config Panel ─────────────────────────────────────────────────────────────
function GenerationConfigPanel({
  config, isGenerating, onChange, onGenerate,
}: {
  config: ExerciseGenConfig;
  isGenerating: boolean;
  onChange: (cfg: ExerciseGenConfig) => void;
  onGenerate: () => void;
}) {
  const updateQConfig = (idx: number, field: string, value: string | number) => {
    const qCfg = [...config.questions_config];
    qCfg[idx] = { ...qCfg[idx], [field]: value };
    onChange({ ...config, questions_config: qCfg });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-violet-800">Configuration de la génération</p>
        <label className="flex items-center gap-1.5 text-xs text-violet-700 cursor-pointer">
          <input type="checkbox" className="accent-violet-600"
            checked={config.dependent}
            onChange={(e) => onChange({ ...config, dependent: e.target.checked })} />
          Questions dépendantes
        </label>
      </div>
      {config.dependent && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Les questions formeront un scénario progressif — chaque question s&apos;appuie sur la précédente.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-violet-100">
              <th className="px-2 py-1.5 text-left font-semibold text-violet-800 w-8">#</th>
              <th className="px-2 py-1.5 text-left font-semibold text-violet-800">Bloom</th>
              <th className="px-2 py-1.5 text-left font-semibold text-violet-800">Difficulté</th>
              <th className="px-2 py-1.5 text-left font-semibold text-violet-800">Type</th>
              <th className="px-2 py-1.5 text-left font-semibold text-violet-800 w-16">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-50">
            {config.questions_config.map((qcfg, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-violet-50/40'}>
                <td className="px-2 py-1 text-violet-600 font-mono font-bold">{i + 1}</td>
                <td className="px-2 py-1">
                  <select className="w-full text-xs border border-violet-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    value={qcfg.bloom} onChange={(e) => updateQConfig(i, 'bloom', e.target.value)}>
                    {BLOOM_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select className="w-full text-xs border border-violet-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    value={qcfg.difficulty} onChange={(e) => updateQConfig(i, 'difficulty', e.target.value)}>
                    {DIFF_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select className="w-full text-xs border border-violet-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    value={qcfg.type} onChange={(e) => updateQConfig(i, 'type', e.target.value)}>
                    {TYPE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input type="number" min={0.5} step={0.5}
                    className="w-full text-xs border border-violet-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    value={qcfg.points} onChange={(e) => updateQConfig(i, 'points', parseFloat(e.target.value) || 1)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white" onClick={onGenerate} disabled={isGenerating}>
        {isGenerating
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Génération en cours…</>
          : <><Zap className="h-3.5 w-3.5" /> Générer  ({config.questions_config.length} question{config.questions_config.length > 1 ? 's' : ''})</>}
      </Button>
    </div>
  );
}

// ─── Reporting Tab ────────────────────────────────────────────────────────────────────────────────────



function ReportingTab({
  exam,
  courseId,
  examId,
}: {
  exam: TnExamDocument;
  courseId: number;
  examId: number;
}) {
  const [reportData, setReportData] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const extractedRaw = (exam.analysis_results as any)?.extracted_questions as ExtractedQuestion[] | undefined;
  const hasAnyData = !!(exam.has_analysis || (extractedRaw && extractedRaw.length > 0));

  // Load report data on mount if we have any data
  useEffect(() => {
    if (!hasAnyData) return;
    setLoadingReport(true);
    tnExamsApi.getReportData(courseId, examId)
      .then(res => setReportData(res.data))
      .catch(() => setReportData(null))
      .finally(() => setLoadingReport(false));
  }, [courseId, examId, hasAnyData]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
      const url = `${API_URL}/api/v1/courses/${courseId}/tn-exams/${examId}/latex-report`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error ?? 'Erreur lors de la génération du rapport');
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `rapport_evaluation_${exam.title ?? examId}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
      toast.success('Rapport téléchargé');
    } catch {
      toast.error('Erreur lors du téléchargement');
    } finally {
      setDownloading(false);
    }
  };

  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <FileBarChart2 className="h-16 w-16 text-muted-foreground" />
        <h3 className="text-xl font-semibold">Données requises</h3>
        <p className="text-muted-foreground max-w-sm">
          Extrayez d&apos;abord les questions ou effectuez l&apos;analyse IA pour générer le rapport de validation.
        </p>
      </div>
    );
  }

  if (loadingReport) {
    return (
      <div className="space-y-4 py-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const rd = reportData;
  const info = rd?.general_info ?? {};
  const validation: Array<{criterion:string;label:string;status:string;detail:string;ok:boolean}> = rd?.validation ?? [];
  const scores = rd?.scores ?? { content: 0, quality: 0, total: 0 };
  const bloomPct: Record<string,number> = rd?.bloom_percentages ?? {};
  const diffPct: Record<string,number> = rd?.difficulty_percentages ?? {};
  const typeDist: Record<string,number> = rd?.type_distribution ?? {};
  const aaMapping: any[] = rd?.aa_mapping ?? [];
  const classification: any[] = rd?.question_classification ?? [];
  const timeAnalysis = rd?.time_analysis ?? {};
  const sourceCoverage = rd?.source_coverage_rate ?? 0;

  const statusColor = (s: string) => s === 'PASS' ? 'text-green-600' : s === 'WARNING' ? 'text-amber-600' : 'text-red-600';
  const statusIcon = (s: string) => s === 'PASS' ? '✓' : s === 'WARNING' ? '⚠' : '✗';
  const statusBg = (s: string) => s === 'PASS' ? 'bg-green-50 border-green-200' : s === 'WARNING' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  const passCount = validation.filter(v => v.status === 'PASS').length;
  const failCount = validation.filter(v => v.status === 'FAIL').length;

  return (
    <div className="space-y-0 max-w-4xl mx-auto">
      {/* Header actions */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Rapport d&apos;Évaluation d&apos;Examen</h2>
          <p className="text-xs text-slate-500">ESPRIT School of Business — Département IMA</p>
        </div>
        <div className="flex gap-2">
          {!rd?.has_full_analysis && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1">
              ⚡ Questions extraites (analyse partielle)
            </Badge>
          )}
          <Button onClick={handleDownloadPdf} disabled={downloading} className="gap-2 bg-blue-700 hover:bg-blue-800 text-white shadow-sm text-sm">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart2 className="h-4 w-4" />}
            Télécharger PDF
          </Button>
        </div>
      </div>

      {/* Global score banner */}
      <div className="rounded-xl bg-gradient-to-r from-[#006699] to-[#0088bb] text-white p-5 mb-4 flex items-center justify-between shadow">
        <div>
          <p className="text-sm font-medium opacity-80">Score Global de Validation</p>
          <p className="text-4xl font-bold">{scores.total}<span className="text-2xl font-normal opacity-70">/90</span></p>
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <p className="text-2xl font-bold">{scores.content}<span className="text-base opacity-70">/70</span></p>
            <p className="text-xs opacity-70">Contenu</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{scores.quality}<span className="text-base opacity-70">/20</span></p>
            <p className="text-xs opacity-70">Qualité</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{passCount}<span className="text-base opacity-70">/{validation.length}</span></p>
            <p className="text-xs opacity-70">Critères OK</p>
          </div>
        </div>
      </div>

      {/* Section 1: General Info */}
      <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
          Informations Générales / General Information
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {[
              ['Cours / Course', info.course_title],
              ['Nom de l\'épreuve / Exam Name', info.exam_name],
              ['Classe / Class', info.class_name],
              ['Langue / Language', info.language],
              ['Durée / Duration', info.duration_min ? `${info.duration_min} minutes` : '—'],
              ['Date', info.exam_date || '—'],
              ['Enseignant(s) / Instructor(s)', Array.isArray(info.instructors) ? info.instructors.join(', ') : (info.instructors || '—')],
            ].map(([label, value]) => (
              <tr key={label} className="hover:bg-slate-50">
                <td className="px-5 py-2.5 font-medium text-slate-600 w-64 bg-slate-50/60">{label}</td>
                <td className="px-5 py-2.5 text-slate-800">{value || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 2: Type distribution */}
      <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
          Forme de l&apos;Examen / Exam Format
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold text-slate-700">Type</th>
              <th className="px-5 py-2.5 text-center font-semibold text-slate-700">Présence</th>
              <th className="px-5 py-2.5 text-center font-semibold text-slate-700">Nb Questions</th>
              <th className="px-5 py-2.5 text-center font-semibold text-slate-700">Points Totaux</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {['MCQ', 'QCM', 'Written', 'Rédactionnel', 'Exercise', 'Practical', 'Case Study'].map(t => {
              const count = typeDist[t] ?? 0;
              if (count === 0) return null;
              const pts = classification.filter(q => q.type === t).reduce((s, q) => s + (q.points ?? 0), 0);
              return (
                <tr key={t} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-700">{t}</td>
                  <td className="px-5 py-2.5 text-center"><span className="text-green-600 font-bold">✓ Oui</span></td>
                  <td className="px-5 py-2.5 text-center text-slate-700">{count}</td>
                  <td className="px-5 py-2.5 text-center text-slate-700">{pts > 0 ? pts : '—'}</td>
                </tr>
              );
            })}
            {Object.entries(typeDist).filter(([t]) => !['MCQ','QCM','Written','Rédactionnel','Exercise','Practical','Case Study'].includes(t)).map(([t, count]) => {
              const pts = classification.filter(q => q.type === t).reduce((s, q) => s + (q.points ?? 0), 0);
              return (
                <tr key={t} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-700">{t}</td>
                  <td className="px-5 py-2.5 text-center"><span className="text-green-600 font-bold">✓ Oui</span></td>
                  <td className="px-5 py-2.5 text-center">{count}</td>
                  <td className="px-5 py-2.5 text-center">{pts > 0 ? pts : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Section 3: AA Mapping */}
      {aaMapping.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
            Alignement AA / Mapping Learning Outcomes
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Question</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Exercice</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700">AA couverts</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Niveau Bloom</th>
                <th className="px-4 py-2.5 text-center font-semibold text-slate-700">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aaMapping.map((m, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs font-bold text-indigo-700">Q{m.question_number}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">Ex.{m.exercise_number}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(m.aa_numbers ?? []).length > 0
                        ? (m.aa_numbers as number[]).map((n: number) => (
                            <span key={n} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">AA{n}</span>
                          ))
                        : <span className="text-xs text-slate-400 italic">Non aligné</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700">{m.bloom || '—'}</td>
                  <td className="px-4 py-2 text-center text-xs font-medium text-slate-700">{m.points ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 4: Bloom distribution */}
      {Object.keys(bloomPct).length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
            Répartition Bloom / Bloom Taxonomy
          </div>
          <div className="p-5">
            <div className="space-y-2">
              {Object.entries(bloomPct).sort(([,a],[,b]) => b - a).map(([level, pct]) => (
                <div key={level} className="flex items-center gap-3">
                  <span className="w-32 text-xs font-medium text-slate-700 shrink-0">{level}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#006699] to-[#0088bb] rounded-full transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <span className="w-12 text-xs font-bold text-slate-700 text-right">{Math.round(pct)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section 5: Difficulty distribution */}
      {Object.keys(diffPct).length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
            Répartition Difficulté / Difficulty Distribution
          </div>
          <div className="p-5">
            <div className="space-y-2">
              {Object.entries(diffPct).sort(([,a],[,b]) => b - a).map(([level, pct]) => {
                const color = level.toLowerCase().includes('facile') ? 'from-green-400 to-green-500'
                  : level.toLowerCase().includes('difficile') ? 'from-red-400 to-red-500'
                  : 'from-amber-400 to-amber-500';
                return (
                  <div key={level} className="flex items-center gap-3">
                    <span className="w-36 text-xs font-medium text-slate-700 shrink-0">{level}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all`}
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <span className="w-12 text-xs font-bold text-slate-700 text-right">{Math.round(pct)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Section 6: Quality indicators (8 validation criteria) */}
      <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm flex items-center justify-between">
          <span>Indicateurs Qualité / Quality Indicators</span>
          <span className="text-sm opacity-80">{passCount} / {validation.length} critères OK</span>
        </div>
        {validation.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {validation.map((v) => (
              <div key={v.criterion} className={`px-5 py-3 flex items-start gap-3 border-l-4 ${
                v.status === 'PASS' ? 'border-l-green-400 bg-green-50/40' :
                v.status === 'WARNING' ? 'border-l-amber-400 bg-amber-50/40' :
                'border-l-red-400 bg-red-50/40'
              }`}>
                <span className={`text-lg font-bold shrink-0 ${statusColor(v.status)}`}>{statusIcon(v.status)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{v.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{v.detail}</p>
                </div>
                <Badge className={`shrink-0 text-xs font-bold ${
                  v.status === 'PASS' ? 'bg-green-100 text-green-700 border-green-200' :
                  v.status === 'WARNING' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                  'bg-red-100 text-red-700 border-red-200'
                }`}>
                  {v.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">
            Lancez l&apos;analyse IA pour obtenir les indicateurs de qualité
          </div>
        )}
      </div>

      {/* Section 7: Question classification table */}
      {classification.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
            Classification des Questions / Question Classification
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Q#</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Exercice</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Type</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Bloom</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Difficulté</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-700">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classification.map((q, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs font-bold text-indigo-700">Q{q.question_number}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      Ex.{q.exercise_number}
                      {q.exercise_title && <span className="text-slate-400"> — {q.exercise_title}</span>}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-[10px]">{q.type}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">{q.bloom}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        q.difficulty?.toLowerCase().includes('facile') ? 'bg-green-100 text-green-700' :
                        q.difficulty?.toLowerCase().includes('difficile') ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{q.difficulty}</span>
                    </td>
                    <td className="px-4 py-2 text-center text-xs font-medium">{q.points ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 8: Time analysis */}
      {(timeAnalysis?.total_estimated_min > 0 || timeAnalysis?.declared_duration_min > 0) && (
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
            Analyse Temporelle / Time Analysis
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">{timeAnalysis.declared_duration_min ?? '—'}</p>
              <p className="text-xs text-slate-500">Durée déclarée (min)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">{timeAnalysis.total_estimated_min ?? '—'}</p>
              <p className="text-xs text-slate-500">Temps estimé (min)</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${timeAnalysis.verdict === 'TROP_LONG' ? 'text-red-600' : 'text-green-600'}`}>
                {timeAnalysis.verdict ?? '—'}
              </p>
              <p className="text-xs text-slate-500">Verdict</p>
            </div>
          </div>
        </div>
      )}

      {/* Section 9: Final score table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
          Score Final / Final Score
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-5 py-3 text-slate-700 font-medium">Contenu de l&apos;examen</td>
              <td className="px-5 py-3 text-right font-bold text-slate-800">{scores.content} / 70</td>
            </tr>
            <tr>
              <td className="px-5 py-3 text-slate-700 font-medium">Indicateurs de qualité</td>
              <td className="px-5 py-3 text-right font-bold text-slate-800">{scores.quality} / 20</td>
            </tr>
            <tr className="bg-[#006699] text-white">
              <td className="px-5 py-3 font-bold text-lg">Total</td>
              <td className="px-5 py-3 text-right font-bold text-lg">{scores.total} / 90</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Validation signature block */}
      <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="bg-[#006699] text-white px-5 py-3 font-semibold text-sm">
          Validation / Sign-off
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold text-slate-700">Nom</th>
              <th className="px-5 py-2.5 text-left font-semibold text-slate-700">Signature</th>
              <th className="px-5 py-2.5 text-left font-semibold text-slate-700">Date</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(info.instructors) ? info.instructors : [info.instructors]).filter(Boolean).map((inst: string, i: number) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-5 py-4 text-slate-700">{inst}</td>
                <td className="px-5 py-4 text-slate-300 italic text-xs">___________________</td>
                <td className="px-5 py-4 text-slate-300 italic text-xs">___________________</td>
              </tr>
            ))}
            {(!info.instructors || (Array.isArray(info.instructors) && info.instructors.length === 0)) && (
              <tr>
                <td className="px-5 py-4 text-slate-300 italic text-xs">___________________</td>
                <td className="px-5 py-4 text-slate-300 italic text-xs">___________________</td>
                <td className="px-5 py-4 text-slate-300 italic text-xs">___________________</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────────────────────────



export default function ExamDetailPage() {

  const params = useParams();

  const router = useRouter();

  const courseId = parseInt(params.id as string);

  const examId = parseInt(params.examId as string);



  const { data: courseData } = useCourse(courseId);

  const { data: exam, isLoading, refetch } = useTnExam(courseId, examId);

  const analyzePageMutation = useAnalyzeTnExam(courseId);
  const [isAnalyzingFromEval, setIsAnalyzingFromEval] = useState(false);
  const [linkedExam, setLinkedExam] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/v1/exam-bank/exams?course_id=${courseId}&tn_exam_id=${examId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.exams?.length) setLinkedExam(data.exams[0]); })
      .catch(() => {});
  }, [courseId, examId]);

  const handleAnalyzeFromEval = async () => {
    setIsAnalyzingFromEval(true);
    try {
      await analyzePageMutation.mutateAsync(examId);
      refetch();
      toast.success('Analyse terminée avec succès');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Erreur lors de l'analyse");
    } finally {
      setIsAnalyzingFromEval(false);
    }
  };



  const course = courseData?.course;



  if (isLoading) {

    return (

      <div className="container mx-auto px-4 py-8 max-w-6xl">

        <Skeleton className="h-8 w-48 mb-2" />

        <Skeleton className="h-5 w-64 mb-8" />

        <Skeleton className="h-12 w-full mb-6" />

        <Skeleton className="h-96" />

      </div>

    );

  }



  if (!exam) {

    return (

      <div className="container mx-auto px-4 py-8 max-w-6xl text-center">

        <h2 className="text-2xl font-bold mb-2">Épreuve introuvable</h2>

        <Button onClick={() => router.push(`/courses/${courseId}/exams`)}>

          Retour aux épreuves

        </Button>

      </div>

    );

  }



  return (

    <div className="container mx-auto px-4 py-8 max-w-6xl">

      {/* Breadcrumb */}

      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-6">

        <button

          onClick={() => router.push(`/courses/${courseId}`)}

          className="hover:text-foreground transition-colors"

        >

          {course?.title ?? 'Module'}

        </button>

        <span>/</span>

        <button

          onClick={() => router.push(`/courses/${courseId}/exams`)}

          className="hover:text-foreground transition-colors"

        >

          Épreuves

        </button>

        <span>/</span>

        <span className="text-foreground font-medium">{exam.title ?? `Épreuve #${examId}`}</span>

      </div>



      {/* Linked ValidatedExam Navigation Bar */}
      {linkedExam && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex-wrap">
          <span className="text-sm font-medium text-indigo-700 mr-2">Épreuve en ligne liée :</span>
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-100"
            onClick={() => router.push(`/courses/${courseId}/exams/${linkedExam.id}/dashboard`)}
          >
            📊 Résultats
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-100"
            onClick={() => router.push(`/courses/${courseId}/exams/${linkedExam.id}/take`)}
          >
            ▶ Voir l&apos;épreuve
          </Button>
        </div>
      )}

      {/* Header */}

      <div className="flex items-start justify-between mb-6">

        <div>

          <div className="flex items-center gap-3 mb-2">

            <h1 className="text-2xl font-bold">{exam.title ?? `Épreuve #${examId}`}</h1>

            {exam.has_analysis ? (

              <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">

                <CheckCircle2 className="h-3 w-3" /> Analysé

              </Badge>

            ) : (

              <Badge variant="outline" className="text-muted-foreground gap-1">

                <Clock className="h-3 w-3" /> Non analysé

              </Badge>

            )}

          </div>

          <div className="text-sm text-muted-foreground">

            {exam.created_at

              ? format(new Date(exam.created_at), "dd MMM yyyy '\u00e0' HH:mm", { locale: fr })

              : ''}

          </div>

        </div>

        <Button

          variant="ghost"

          size="sm"

          onClick={() => router.push(`/courses/${courseId}/exams`)}

          className="gap-1 text-muted-foreground"

        >

          <ArrowLeft className="h-4 w-4" />

          Retour

        </Button>

      </div>



      {/* Tabs */}

      <Tabs defaultValue="header">

        <TabsList className="mb-6">

          <TabsTrigger value="header" className="gap-2">

            <FileText className="h-4 w-4" /> Header

          </TabsTrigger>

          <TabsTrigger value="questions" className="gap-2">

            <Target className="h-4 w-4" /> Questions

          </TabsTrigger>

          <TabsTrigger value="proposition" className="gap-2">

            <Zap className="h-4 w-4" /> Nouvelle Proposition

          </TabsTrigger>

          <TabsTrigger value="evaluation" className="gap-2">

            <BarChart3 className="h-4 w-4" /> Évaluation &amp; Suggestions

          </TabsTrigger>

          <TabsTrigger value="reporting" className="gap-2">

            <FileBarChart2 className="h-4 w-4" /> Reporting

          </TabsTrigger>

          <TabsTrigger value="analyse" className="gap-2">

            <Brain className="h-4 w-4" /> Analyse AI

          </TabsTrigger>

          <TabsTrigger value="correction" className="gap-2">

            <GraduationCap className="h-4 w-4" /> Correction épreuve

          </TabsTrigger>

        </TabsList>



        <TabsContent value="header">

          <HeaderTab exam={exam} courseId={courseId} examId={examId} onHeaderUpdated={refetch} />

        </TabsContent>

        <TabsContent value="questions">

          <QuestionsTab exam={exam} courseId={courseId} examId={examId} onQuestionsUpdated={refetch} />

        </TabsContent>

        <TabsContent value="proposition">

          <PropositionTab exam={exam} courseId={courseId} examId={examId} onSaved={refetch} />

        </TabsContent>

        <TabsContent value="evaluation">

          <EvaluationTab exam={exam} courseId={courseId} onAnalyze={handleAnalyzeFromEval} isAnalyzing={isAnalyzingFromEval} />

        </TabsContent>

        <TabsContent value="reporting">

          <ReportingTab exam={exam} courseId={courseId} examId={examId} />

        </TabsContent>

        <TabsContent value="analyse">

          <AnalyseAITab exam={exam} courseId={courseId} examId={examId} onReanalyze={refetch} />

        </TabsContent>

        <TabsContent value="correction">
          <CorrectionTab exam={exam} courseId={courseId} examId={examId} />
        </TabsContent>

      </Tabs>

    </div>

  );

}

