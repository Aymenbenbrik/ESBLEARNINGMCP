'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { TrendingUp, Target, Brain, Layers, Award, AlertTriangle, FlaskConical, BookOpen } from 'lucide-react';
import { ExamEvaluation, DifficultyByChapter } from '@/lib/types/course';

interface Props {
  ev: ExamEvaluation;
}

// ─── Constantes Bloom ────────────────────────────────────────────────────────

const BLOOM_META = [
  { key: 'remembering',  label: 'Mémorisation',  color: '#3b82f6', category: 'low'  },
  { key: 'understanding',label: 'Compréhension', color: '#22c55e', category: 'low'  },
  { key: 'applying',     label: 'Application',   color: '#eab308', category: 'low'  },
  { key: 'analyzing',    label: 'Analyse',        color: '#f97316', category: 'high' },
  { key: 'evaluating',   label: 'Évaluation',     color: '#ef4444', category: 'high' },
  { key: 'creating',     label: 'Création',       color: '#a855f7', category: 'high' },
] as const;

type BloomKey = typeof BLOOM_META[number]['key'];

// ─── Score Gauge (SVG circulaire) ────────────────────────────────────────────

function ScoreGauge({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.min(score / max, 1);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);
  const color = pct >= 0.7 ? '#22c55e' : pct >= 0.5 ? '#eab308' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={radius} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text x="70" y="66" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 28, fontWeight: 700, fill: color }}>
          {score}
        </text>
        <text x="70" y="86" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 12, fill: '#6b7280' }}>
          / {max}
        </text>
      </svg>
      <p className="text-xs text-muted-foreground font-medium">Score qualité</p>
    </div>
  );
}

// ─── Tooltip personnalisé ─────────────────────────────────────────────────────

const BloomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold mb-1">{d.label}</p>
      <p className="text-muted-foreground">Nb questions : <span className="font-medium text-gray-800">{d.value}</span></p>
      <p className="text-muted-foreground">Part : <span className="font-medium text-gray-800">{d.pct}%</span></p>
    </div>
  );
};

const AaTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold" style={{ color: d.color }}>{d.name}</p>
      <p className="text-muted-foreground">AA : <span className="font-medium text-gray-800">{d.value}</span></p>
    </div>
  );
};

// ─── Composant principal ──────────────────────────────────────────────────────

export function ExamAnalyticsDashboard({ ev }: Props) {
  const dist = ev.bloom_distribution ?? {};

  // Bloom data pour les graphiques
  const bloomData = BLOOM_META.map(m => {
    const value = dist[m.key as keyof typeof dist] ?? 0;
    return { ...m, value };
  });

  const totalBloom = bloomData.reduce((s, d) => s + d.value, 0);
  const bloomDataWithPct = bloomData.map(d => ({
    ...d,
    pct: totalBloom > 0 ? Math.round((d.value / totalBloom) * 100) : 0,
  }));

  // HOT / LOT (Higher / Lower Order Thinking)
  const hotTotal = bloomData.filter(d => d.category === 'high').reduce((s, d) => s + d.value, 0);
  const lotTotal = bloomData.filter(d => d.category === 'low').reduce((s, d) => s + d.value, 0);
  const hotPct = totalBloom > 0 ? Math.round((hotTotal / totalBloom) * 100) : 0;
  const lotPct = 100 - hotPct;

  // AA coverage
  const aaList = ev.aa_alignment ?? [];
  const coveredCount = aaList.filter(a => a.covered).length;
  const uncoveredCount = aaList.length - coveredCount;
  const aaCoveragePct = aaList.length > 0 ? Math.round((coveredCount / aaList.length) * 100) : 0;
  const aaPieData = [
    { name: 'Couverts', value: coveredCount, color: '#22c55e' },
    { name: 'Non couverts', value: uncoveredCount, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Données pour radar
  const radarData = bloomDataWithPct.map(d => ({
    level: d.label.slice(0, 5),
    fullLabel: d.label,
    value: d.pct,
  }));

  // Qualité de l'équilibre cognitif
  const balanceLabel = hotPct >= 40 && hotPct <= 60
    ? { text: 'Équilibré', color: 'text-green-600', bg: 'bg-green-50 border-green-200' }
    : hotPct < 20
    ? { text: 'Trop mémoriel', color: 'text-red-600', bg: 'bg-red-50 border-red-200' }
    : hotPct > 70
    ? { text: 'Très exigeant', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' }
    : { text: 'Acceptable', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' };

  return (
    <div className="space-y-5">

      {/* ── En-tête ── */}
      <div className="flex items-center gap-2">
        <div className="h-1 w-6 rounded-full bg-bolt-accent" />
        <h3 className="text-base font-semibold">📊 Dashboard d&apos;analyse</h3>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Score Qualité */}
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 flex items-center justify-center lg:col-span-1">
          <ScoreGauge score={ev.overall_score} />
        </div>

        {/* Couverture AA */}
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground font-medium">Couverture AA</span>
          </div>
          <p className="text-3xl font-bold">{aaCoveragePct}<span className="text-base font-normal text-muted-foreground">%</span></p>
          <p className="text-xs text-muted-foreground mt-1">{coveredCount} / {aaList.length} acquis couverts</p>
          <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${aaCoveragePct}%`, backgroundColor: aaCoveragePct >= 80 ? '#22c55e' : aaCoveragePct >= 50 ? '#eab308' : '#ef4444' }}
            />
          </div>
        </div>

        {/* Équilibre HOT/LOT */}
        <div className={`rounded-xl border p-4 flex flex-col justify-between ${balanceLabel.bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-medium text-muted-foreground">Équilibre cognitif</span>
          </div>
          <p className={`text-xl font-bold ${balanceLabel.color}`}>{balanceLabel.text}</p>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">HOT (Analyse+)</span>
              <span className="font-semibold">{hotPct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">LOT (Mémo–App)</span>
              <span className="font-semibold">{lotPct}%</span>
            </div>
          </div>
        </div>

        {/* Questions pratiques */}
        <div className={`rounded-xl border p-4 flex flex-col justify-between ${
          ev.has_practical_questions
            ? 'border-orange-200 bg-orange-50'
            : 'border-bolt-line bg-white'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className={`h-4 w-4 ${ev.has_practical_questions ? 'text-orange-500' : 'text-muted-foreground'}`} />
            <span className="text-xs font-medium text-muted-foreground">Questions pratiques</span>
          </div>
          {ev.has_practical_questions ? (
            <>
              <p className="text-xl font-bold text-orange-600">
                {ev.practical_questions_count ?? '—'}
                <span className="text-sm font-normal text-muted-foreground"> / {ev.questions_count}</span>
              </p>
              <p className="text-xs text-orange-600 mt-1 font-medium">✓ Épreuve avec pratique</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-gray-400">0</p>
              <p className="text-xs text-muted-foreground mt-1">Épreuve théorique</p>
            </>
          )}
        </div>

        {/* Complexité */}
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-orange-500" />
            <span className="text-xs text-muted-foreground font-medium">Complexité</span>
          </div>
          <p className="text-xl font-bold capitalize">{ev.avg_difficulty}</p>
          <p className="text-xs text-muted-foreground mt-1">{ev.questions_count} questions · {ev.estimated_duration}</p>
          <div className="mt-2 flex gap-1">
            {BLOOM_META.map(m => {
              const val = dist[m.key as keyof typeof dist] ?? 0;
              const pct = totalBloom > 0 ? (val / totalBloom) * 100 : 0;
              return pct > 0 ? (
                <div key={m.key} title={`${m.label}: ${Math.round(pct)}%`}
                  className="h-1.5 rounded-full flex-shrink-0 transition-all"
                  style={{ width: `${pct}%`, backgroundColor: m.color }} />
              ) : null;
            })}
          </div>
        </div>
      </div>

      {/* ── Graphiques principaux ── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Bloom BarChart */}
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-5">
          <h4 className="text-sm font-semibold mb-1">🧠 Distribution Bloom</h4>
          <p className="text-xs text-muted-foreground mb-4">Répartition des questions par niveau cognitif</p>
          {totalBloom > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={bloomDataWithPct} layout="vertical" margin={{ top: 0, right: 30, left: 80, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={80} className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip content={<BloomTooltip />} />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]} name="Part (%)">
                  {bloomDataWithPct.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              Données Bloom non disponibles
            </div>
          )}
        </div>

        {/* Radar cognitif */}
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-5">
          <h4 className="text-sm font-semibold mb-1">🕸️ Profil cognitif</h4>
          <p className="text-xs text-muted-foreground mb-4">Vue radar des niveaux de Bloom</p>
          {totalBloom > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="level" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} tickCount={4}
                  tickFormatter={v => `${v}%`} />
                <Radar name="Bloom" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              Données radar non disponibles
            </div>
          )}
        </div>
      </div>

      {/* ── AA Coverage + HOT/LOT ── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* AA Pie */}
        {aaList.length > 0 && (
          <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-5">
            <h4 className="text-sm font-semibold mb-1">🎯 Couverture des Acquis d&apos;Apprentissage</h4>
            <p className="text-xs text-muted-foreground mb-4">{coveredCount} couverts sur {aaList.length} AA</p>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={180}>
                <PieChart>
                  <Pie data={aaPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                    dataKey="value" nameKey="name">
                    {aaPieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<AaTooltip />} />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: 22, fontWeight: 700, fill: aaCoveragePct >= 80 ? '#22c55e' : '#eab308' }}>
                    {aaCoveragePct}%
                  </text>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 text-xs">
                {aaPieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-semibold ml-auto">{d.value}</span>
                  </div>
                ))}
                {uncoveredCount > 0 && (
                  <div className="mt-3 p-2 rounded-lg bg-red-50 border border-red-100 flex gap-1.5 items-start">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-600 leading-snug">
                      {uncoveredCount} AA non couvert{uncoveredCount > 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HOT vs LOT detail */}
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-5">
          <h4 className="text-sm font-semibold mb-1">⚖️ Analyse HOT / LOT</h4>
          <p className="text-xs text-muted-foreground mb-4">Pensée d&apos;ordre supérieur vs inférieur</p>
          <div className="space-y-3">
            {/* HOT */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-purple-700">HOT — Analyse · Évaluation · Création</span>
                <span className="font-bold text-purple-700">{hotPct}%</span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all"
                  style={{ width: `${hotPct}%` }} />
              </div>
            </div>
            {/* LOT */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-blue-700">LOT — Mémorisation · Compréhension · Application</span>
                <span className="font-bold text-blue-700">{lotPct}%</span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                  style={{ width: `${lotPct}%` }} />
              </div>
            </div>
            {/* Niveau par niveau */}
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              {bloomDataWithPct.filter(d => d.value > 0).map(d => (
                <div key={d.key} className="flex items-center gap-2 text-xs">
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground w-24 shrink-0">{d.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${d.pct}%`, backgroundColor: d.color }} />
                  </div>
                  <span className="font-semibold w-8 text-right">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recommandation pédagogique ── */}

      {/* Difficulté par chapitre */}
      {ev.difficulty_by_chapter && ev.difficulty_by_chapter.length > 0 && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-5">
          <h4 className="text-sm font-semibold mb-1">📚 Couverture par chapitre</h4>
          <p className="text-xs text-muted-foreground mb-4">Niveau de difficulté des questions selon les chapitres</p>
          <div className="space-y-3">
            {ev.difficulty_by_chapter.map((ch, i) => {
              const diffColor = ch.difficulty === 'facile'
                ? { bar: '#22c55e', bg: 'bg-green-50 border-green-200', text: 'text-green-700' }
                : ch.difficulty === 'difficile'
                ? { bar: '#ef4444', bg: 'bg-red-50 border-red-200', text: 'text-red-700' }
                : { bar: '#eab308', bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700' };
              const pct = ev.questions_count > 0
                ? Math.round((ch.questions_count / ev.questions_count) * 100)
                : 0;
              return (
                <div key={i} className={`rounded-lg border p-3 ${diffColor.bg}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <BookOpen className={`h-3.5 w-3.5 ${diffColor.text}`} />
                      <span className="text-xs font-semibold">{ch.chapter}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium capitalize ${diffColor.text}`}>{ch.difficulty}</span>
                      <span className="text-xs text-muted-foreground">{ch.questions_count} question{ch.questions_count > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: diffColor.bar }} />
                  </div>
                  {ch.comment && (
                    <p className={`text-xs mt-1.5 ${diffColor.text} opacity-80`}>{ch.comment}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Synthèse pédagogique */}
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
        <div className="flex items-start gap-3">
          <Award className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-indigo-800 mb-1">Synthèse pédagogique</h4>
            <p className="text-xs text-indigo-700 leading-relaxed">
              {ev.overall_score >= 8
                ? `Épreuve de haute qualité (${ev.overall_score}/10). La distribution de Bloom est bien équilibrée avec ${hotPct}% de questions d'ordre supérieur.`
                : ev.overall_score >= 6
                ? `Épreuve de qualité correcte (${ev.overall_score}/10). ${hotPct < 30 ? 'Envisagez d\'augmenter la part HOT (analyse, évaluation, création).' : 'Quelques ajustements peuvent améliorer l\'équilibre cognitif.'}`
                : `Épreuve à améliorer (${ev.overall_score}/10). Consultez les suggestions IA pour renforcer la qualité pédagogique.`
              }
              {aaCoveragePct < 100 && aaList.length > 0 && ` ${uncoveredCount} acquis d'apprentissage non couverts nécessitent attention.`}
              {ev.has_practical_questions && ` L'épreuve inclut ${ev.practical_questions_count ?? ''} question(s) pratique(s).`}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
