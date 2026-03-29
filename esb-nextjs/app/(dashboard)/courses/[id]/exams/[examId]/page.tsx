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

import { Bar as ChartBar, Doughnut, PolarArea } from 'react-chartjs-2';



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

} from '@/lib/types/course';

import { ExamLatexEditor } from '@/components/courses/ExamLatexEditor';

import { ExamMCPPanel } from '@/components/courses/ExamMCPPanel';



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
  const ORDER = ['M\xe9moriser', 'Comprendre', 'Appliquer', 'Analyser', '\xc9valuer', 'Cr\xe9er'];
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
  const LOT_KEYS = ['M\xe9moriser', 'Comprendre', 'Appliquer', 'M\xe9morisation', 'Compr\xe9hension', 'Application'];
  const HOT_KEYS = ['Analyser', '\xc9valuer', 'Cr\xe9er', 'Analyse', '\xc9valuation', 'Cr\xe9ation'];
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
  const ORDER = ['Tr\xe8s facile', 'Facile', 'Moyen', 'Difficile', 'Tr\xe8s difficile'];
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
    '\xc9tude de cas': '#06b6d4', 'Case Study': '#06b6d4',
    'R\xe9dactionnel': '#ec4899',
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
        label: "Couverture \xe9preuve",
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
          <p className="text-muted-foreground">AA align\xe9s</p>
        </div>
        <div className="rounded-lg bg-orange-50 border border-orange-100 p-2">
          <p className="font-bold text-orange-700 text-base">
            {allNums.filter((n) => { const cv = aaPercentages[String(n)] ?? 0; const ci = aaDistribution.find(d=>d.number===n)?.percent??0; return cv>0 && Math.abs(cv-ci)>12; }).length}
          </p>
          <p className="text-muted-foreground">AA avec \xe9cart</p>
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
    'M\xe9morisation': 'bg-blue-400', 'M\xe9moriser': 'bg-blue-400',
    'Compr\xe9hension': 'bg-green-400', 'Comprendre': 'bg-green-400',
    'Application': 'bg-yellow-400', 'Appliquer': 'bg-yellow-400',
    'Analyse': 'bg-orange-400', 'Analyser': 'bg-orange-400',
    '\xc9valuation': 'bg-red-400', '\xc9valuer': 'bg-red-400',
    'Cr\xe9ation': 'bg-purple-400', 'Cr\xe9er': 'bg-purple-400',
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

  const HOT_KEYS = ['Analyser', '\xc9valuer', 'Cr\xe9er', 'Analyse', '\xc9valuation', 'Cr\xe9ation'];
  const hotPct = Object.entries(bloomPercentages)
    .filter(([k]) => HOT_KEYS.includes(k))
    .reduce((s, [, v]) => s + v, 0);
  const bloomScore = Math.min(100, Math.round(hotPct * 1.5 + 30));

  const ideal: Record<string, number> = { 'Tr\xe8s facile': 10, 'Facile': 20, 'Moyen': 40, 'Difficile': 20, 'Tr\xe8s difficile': 10 };
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
    s >= 80 ? '\ud83d\udfe2 Excellent' : s >= 65 ? '\ud83d\udfe1 Satisfaisant' : s >= 50 ? '\ud83d\udfe0 \xc0 am\xe9liorer' : '\ud83d\udd34 Insuffisant';

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-indigo-50 to-white">
        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">\xc9valuation globale de l&apos;\xe9preuve</h3>
          <p className="text-[10px] text-muted-foreground">Score calcul\xe9 automatiquement sur 5 dimensions</p>
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
            title="\xc9quilibre Difficult\xe9"
            score={scores.difficultyScore}
            subtitle="Distribution id\xe9ale: 10-20-40-20-10"
            icon={<BarChart3 className="h-4 w-4 text-orange-600" />}
            colorClass="bg-orange-100"
          />
          <ScoreCard
            title="Vari\xe9t\xe9 des Types"
            score={scores.typeScore}
            subtitle={`${Object.keys(typePercentages).length} type(s) de questions`}
            icon={<BookOpen className="h-4 w-4 text-blue-600" />}
            colorClass="bg-blue-100"
          />
          <ScoreCard
            title="Sources documentaires"
            score={scores.sourceScore}
            subtitle="% questions reli\xe9es aux cours"
            icon={<FileBarChart2 className="h-4 w-4 text-teal-600" />}
            colorClass="bg-teal-100"
          />
        </div>
      </div>
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

    const questions = (exam.analysis_results?.questions as TnExamQuestion[]) ?? [];

    setEditedQuestions(questions);

    const metaData = (exam.analysis_results?.exam_metadata as any) ?? {};

    const dur = metaData.declared_duration_min ?? exam.analysis_results?.declared_duration_min ?? '';

    setEditedDuration(String(dur));

    setEditedMeta(metaData);

    setDirty(false);

    if (exam.analysis_results) {

      setLatexContent(buildLatexFromQuestions(exam.title ?? 'Épreuve', metaData, questions));

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



  // Empty state

  if (!ar) {

    return (

      <>

        <AnalysisProgressOverlay visible={showOverlay} onClose={() => setShowOverlay(false)} />

        <div className="flex flex-col items-center justify-center py-20 gap-4">

          <Brain className="h-16 w-16 text-muted-foreground" />

          <h3 className="text-xl font-semibold">Analyse non effectuée</h3>

          <p className="text-muted-foreground text-center max-w-sm">

            Lancez l&apos;analyse IA pour extraire les questions, barèmes, niveaux Bloom et aligner

            avec les Acquis d&apos;Apprentissage.

          </p>

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

            <h3 className="text-sm font-semibold">Métadonnées de l&apos;épreuve</h3>

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

            <div className="flex flex-wrap gap-2 pt-2 border-t">

              {editedMeta.exam_type && (

                <Badge variant="outline" className="text-xs">{editedMeta.exam_type}</Badge>

              )}

              {editedMeta.documents_allowed != null && (

                <Badge variant="outline" className={`text-xs ${editedMeta.documents_allowed ? 'text-green-700 border-green-300' : 'text-red-700 border-red-300'}`}>

                  {editedMeta.documents_allowed ? 'Documents autorisés' : 'Sans documents'}

                </Badge>

              )}

              {editedMeta.calculator_allowed != null && (

                <Badge variant="outline" className={`text-xs ${editedMeta.calculator_allowed ? 'text-green-700 border-green-300' : 'text-red-700 border-red-300'}`}>

                  {editedMeta.calculator_allowed ? 'Calculatrice autorisée' : 'Sans calculatrice'}

                </Badge>

              )}

              {editedMeta.computer_allowed != null && (

                <Badge variant="outline" className={`text-xs ${editedMeta.computer_allowed ? 'text-green-700 border-green-300' : 'text-red-700 border-red-300'}`}>

                  {editedMeta.computer_allowed ? 'Ordinateur autorisé' : 'Sans ordinateur'}

                </Badge>

              )}

              {editedMeta.internet_allowed != null && (

                <Badge variant="outline" className={`text-xs ${editedMeta.internet_allowed ? 'text-green-700 border-green-300' : 'text-red-700 border-red-300'}`}>

                  {editedMeta.internet_allowed ? 'Internet autorisé' : 'Sans internet'}

                </Badge>

              )}

              {editedMeta.answer_on_sheet != null && (

                <Badge variant="outline" className="text-xs">

                  {editedMeta.answer_on_sheet ? 'Réponses sur copie' : 'Réponses sur feuille séparée'}

                </Badge>

              )}

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

            <div className="flex items-center gap-2 px-4 py-3 border-b bg-slate-50">

              <Target className="h-4 w-4 text-muted-foreground" />

              <h3 className="text-sm font-semibold">Tableau récapitulatif des questions</h3>

              <Badge variant="secondary" className="ml-auto text-xs">{editedQuestions.length}</Badge>

            </div>

            <div className="overflow-x-auto">

              <Table>

                <TableHeader>

                  <TableRow className="bg-muted/30">

                    <TableHead className="w-12">#</TableHead>

                    <TableHead className="min-w-[200px]">Question</TableHead>

                    <TableHead>AA</TableHead>

                    <TableHead className="w-24">Barème</TableHead>

                    <TableHead>Difficulté</TableHead>

                    <TableHead>Bloom</TableHead>

                    <TableHead>Type</TableHead>

                    <TableHead className="w-20">Temps</TableHead>

                  </TableRow>

                </TableHeader>

                <TableBody>

                  {/* Group questions by exercise */}

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

                      const exPoints = exQs.reduce((s, q) => s + (q.points ?? 0), 0);

                      return (

                        <React.Fragment key={exNum}>

                          <TableRow className="bg-primary/5 border-t-2 border-primary/20">

                            <TableCell colSpan={8} className="py-2 px-4">

                              <span className="text-sm font-semibold text-primary">{title}</span>

                              {exPoints > 0 && (

                                <Badge variant="outline" className="ml-2 text-xs">{exPoints} pts</Badge>

                              )}

                            </TableCell>

                          </TableRow>

                          {exQs.map((q) => {

                            const globalIndex = editedQuestions.indexOf(q);

                            return (

                              <TableRow key={(q as any).id ?? globalIndex}>

                                <TableCell className="text-muted-foreground text-sm">{(q as any)['Question#'] ?? globalIndex + 1}</TableCell>

                                <TableCell className="text-sm max-w-xs">

                                  <div className="line-clamp-2">{(q as any)['Text'] ?? q.text ?? q.question_text ?? '—'}</div>

                                </TableCell>

                                <TableCell>

                                  <div className="flex flex-wrap gap-1">

                                    {((q as any)['AA#'] ?? q['AA#'] ?? []).map((aa: any) => (

                                      <Badge key={aa} variant="outline" className="text-xs">AA#{aa}</Badge>

                                    ))}

                                  </div>

                                </TableCell>

                                <TableCell>

                                  <Input

                                    type="number"

                                    value={q.points ?? ''}

                                    onChange={(e) => updateQuestion(globalIndex, 'points', parseFloat(e.target.value) || 0)}

                                    className="h-7 w-16 text-sm"

                                    step="0.5"

                                    min="0"

                                  />

                                </TableCell>

                                <TableCell>

                                  <Select value={q.Difficulty ?? ''} onValueChange={(v) => updateQuestion(globalIndex, 'Difficulty', v)}>

                                    <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="—" /></SelectTrigger>

                                    <SelectContent>{DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>

                                  </Select>

                                </TableCell>

                                <TableCell>

                                  <Select value={q.Bloom_Level ?? ''} onValueChange={(v) => updateQuestion(globalIndex, 'Bloom_Level', v)}>

                                    <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="—" /></SelectTrigger>

                                    <SelectContent>{BLOOM_LEVELS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>

                                  </Select>

                                </TableCell>

                                <TableCell>

                                  <Select value={(q as any)['Type'] ?? q.Type ?? ''} onValueChange={(v) => updateQuestion(globalIndex, 'Type', v)}>

                                    <SelectTrigger className="h-7 text-xs w-24"><SelectValue placeholder="—" /></SelectTrigger>

                                    <SelectContent>{QUESTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>

                                  </Select>

                                </TableCell>

                                <TableCell className="text-sm text-muted-foreground">

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

  const { data: validation, isLoading, refetch } = useTnExamValidation(

    courseId,

    examId,

    !!exam.has_analysis

  );



  const [downloading, setDownloading] = useState(false);



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

      toast.success('Rapport PDF téléchargé');

    } catch {

      toast.error('Erreur lors du téléchargement');

    } finally {

      setDownloading(false);

    }

  };



  if (!exam.has_analysis) {

    return (

      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">

        <FileBarChart2 className="h-16 w-16 text-muted-foreground" />

        <h3 className="text-xl font-semibold">Analyse requise</h3>

        <p className="text-muted-foreground max-w-sm">

          Effectuez d&apos;abord l&apos;analyse IA dans l&apos;onglet &quot;Analyse AI&quot; pour

          générer le rapport de validation.

        </p>

      </div>

    );

  }



  if (isLoading) {

    return (

      <div className="space-y-4 py-6">

        <Skeleton className="h-16 w-full" />

        <Skeleton className="h-64 w-full" />

      </div>

    );

  }



  if (!validation) return null;



  const { verdict_ok, summary } = validation;



  return (

    <div className="space-y-6">

      {/* Verdict */}

      <div

        className={`flex items-center gap-4 p-6 rounded-xl border-2 ${

          verdict_ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'

        }`}

      >

        {verdict_ok ? (

          <CheckCircle2 className="h-12 w-12 text-green-600 shrink-0" />

        ) : (

          <XCircle className="h-12 w-12 text-red-600 shrink-0" />

        )}

        <div>

          <div className={`text-2xl font-bold ${verdict_ok ? 'text-green-800' : 'text-red-800'}`}>

            {verdict_ok ? '\u2713 VALIDÉ' : '\u2717 NON VALIDÉ'}

          </div>

          <div className="text-sm text-muted-foreground mt-1">

            {summary.pass} critère(s) OK \u00b7 {summary.warning} avertissement(s) \u00b7 {summary.fail} échec(s)

          </div>

        </div>

        <div className="ml-auto flex gap-2">

          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">

            <RotateCcw className="h-3 w-3" /> Rafraîchir

          </Button>

          <Button onClick={handleDownloadPdf} disabled={downloading} className="gap-2">

            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}

            Rapport officiel PDF

          </Button>

        </div>

      </div>



      {/* Summary cards */}

      <div className="grid grid-cols-3 gap-4">

        <Card className="border-green-200">

          <CardContent className="pt-4 text-center">

            <div className="text-3xl font-bold text-green-700">{summary.pass}</div>

            <div className="text-xs text-muted-foreground mt-1">Critères OK</div>

          </CardContent>

        </Card>

        <Card className="border-yellow-200">

          <CardContent className="pt-4 text-center">

            <div className="text-3xl font-bold text-yellow-700">{summary.warning}</div>

            <div className="text-xs text-muted-foreground mt-1">Avertissements</div>

          </CardContent>

        </Card>

        <Card className="border-red-200">

          <CardContent className="pt-4 text-center">

            <div className="text-3xl font-bold text-red-700">{summary.fail}</div>

            <div className="text-xs text-muted-foreground mt-1">Échecs</div>

          </CardContent>

        </Card>

      </div>



      {/* Validation table */}

      <Card>

        <CardHeader className="pb-2">

          <CardTitle className="text-base">Critères de validation</CardTitle>

        </CardHeader>

        <CardContent className="p-0">

          <Table>

            <TableHeader>

              <TableRow className="bg-muted/50">

                <TableHead>Critère</TableHead>

                <TableHead className="w-36">Statut</TableHead>

                <TableHead>Commentaire</TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {validation.validation.map((v: ValidationCriterion, i: number) => (

                <TableRow key={i}>

                  <TableCell className="font-medium text-sm">{v.criterion}</TableCell>

                  <TableCell>

                    <StatusBadge status={v.status} />

                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">{v.comment}</TableCell>

                </TableRow>

              ))}

            </TableBody>

          </Table>

        </CardContent>

      </Card>

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

      <Tabs defaultValue="analyse">

        <TabsList className="mb-6">

          <TabsTrigger value="analyse" className="gap-2">

            <Brain className="h-4 w-4" /> Analyse AI

          </TabsTrigger>

          <TabsTrigger value="reporting" className="gap-2">

            <FileBarChart2 className="h-4 w-4" /> Reporting

          </TabsTrigger>

        </TabsList>



        <TabsContent value="analyse">

          <AnalyseAITab exam={exam} courseId={courseId} examId={examId} onReanalyze={refetch} />

        </TabsContent>



        <TabsContent value="reporting">

          <ReportingTab exam={exam} courseId={courseId} examId={examId} />

        </TabsContent>

      </Tabs>

    </div>

  );

}

