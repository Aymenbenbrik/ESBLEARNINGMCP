'use client';

import Link from 'next/link';
import { FileText, Brain, FlaskConical, Target, TrendingUp, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EXAM_TYPE_LABELS, EXAM_TYPE_COLORS, ExamType } from '@/lib/types/course';

export interface ExamStatsSummary {
  total_exams: number;
  exams_analyzed: number;
  by_type: Record<string, number>;
  avg_overall_score: number | null;
  avg_aa_coverage: number | null;
  practical_exams_count: number;
  exams: ExamSummaryItem[];
}

export interface ExamSummaryItem {
  id: number;
  course_id: number;
  original_name: string | null;
  exam_type: ExamType;
  weight: number;
  status: 'uploaded' | 'analyzing' | 'done' | 'error';
  overall_score: number | null;
  questions_count: number | null;
  has_practical_questions: boolean;
  aa_coverage: number | null;
  bloom_distribution: Record<string, number> | null;
  created_at: string | null;
}

function ScoreGauge({ value, max = 10, size = 64 }: { value: number; max?: number; size?: number }) {
  const pct = Math.min(value / max, 1);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ * 0.75;
  const gap = circ - dash;
  const color = pct >= 0.75 ? '#22c55e' : pct >= 0.5 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-[135deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={6}
        strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round" strokeDasharray={`${dash} ${gap + circ * 0.25}`} />
    </svg>
  );
}

function KPICard({ icon, label, value, sub, color = 'text-foreground' }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 flex items-center gap-3">
      <div className="shrink-0 h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ExamSummaryItem['status'] }) {
  if (status === 'done') return <Badge className="text-xs bg-green-100 text-green-700 border-green-200 border"><CheckCircle className="h-2.5 w-2.5 mr-1" />Analysé</Badge>;
  if (status === 'analyzing') return <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 border"><Clock className="h-2.5 w-2.5 mr-1" />En cours</Badge>;
  if (status === 'error') return <Badge variant="destructive" className="text-xs"><AlertCircle className="h-2.5 w-2.5 mr-1" />Erreur</Badge>;
  return <Badge variant="secondary" className="text-xs">En attente</Badge>;
}

interface Props {
  examStats: ExamStatsSummary;
  courseId?: number;   // if provided, shows link to course exam tab
  title?: string;
}

export function ExamDashboardSection({ examStats, courseId, title = 'Épreuves & Examens' }: Props) {
  if (examStats.total_exams === 0) {
    return (
      <div className="rounded-xl border border-dashed border-bolt-line bg-muted/20 p-8 text-center">
        <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">Aucune épreuve ajoutée pour ce cours</p>
      </div>
    );
  }

  const analysedRate = examStats.total_exams > 0
    ? Math.round((examStats.exams_analyzed / examStats.total_exams) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1 w-6 rounded-full bg-bolt-accent" />
          <h3 className="text-base font-semibold">{title}</h3>
          <Badge variant="outline" className="text-xs">{examStats.total_exams} épreuve{examStats.total_exams > 1 ? 's' : ''}</Badge>
        </div>
        {courseId && (
          <Link href={`/courses/${courseId}`} className="text-xs text-bolt-accent hover:underline">
            Gérer les épreuves →
          </Link>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <KPICard
          icon={<Brain className="h-4 w-4 text-violet-500" />}
          label="Analyses IA"
          value={`${examStats.exams_analyzed}/${examStats.total_exams}`}
          sub={`${analysedRate}% analysées`}
        />
        {examStats.avg_overall_score !== null ? (
          <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 flex items-center gap-3">
            <div className="relative shrink-0">
              <ScoreGauge value={examStats.avg_overall_score} max={10} size={52} />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold rotate-[135deg]">
                {examStats.avg_overall_score.toFixed(1)}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Score moyen IA</p>
              <p className="text-xs text-muted-foreground">sur 10</p>
            </div>
          </div>
        ) : (
          <KPICard icon={<TrendingUp className="h-4 w-4 text-blue-500" />} label="Score moyen IA" value="—" sub="Pas encore analysé" />
        )}
        <KPICard
          icon={<Target className="h-4 w-4 text-emerald-500" />}
          label="Couverture AAs"
          value={examStats.avg_aa_coverage !== null ? `${examStats.avg_aa_coverage}%` : '—'}
          sub="moyenne sur épreuves"
          color={examStats.avg_aa_coverage !== null && examStats.avg_aa_coverage >= 80 ? 'text-emerald-600' : 'text-foreground'}
        />
        <KPICard
          icon={<FlaskConical className="h-4 w-4 text-orange-500" />}
          label="Épreuves pratiques"
          value={examStats.practical_exams_count}
          sub={`sur ${examStats.total_exams} épreuve${examStats.total_exams > 1 ? 's' : ''}`}
          color={examStats.practical_exams_count > 0 ? 'text-orange-600' : 'text-foreground'}
        />
      </div>

      {/* By type bars */}
      {Object.keys(examStats.by_type).length > 0 && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3">Répartition par type</p>
          <div className="space-y-2">
            {Object.entries(examStats.by_type).map(([type, count]) => {
              const label = EXAM_TYPE_LABELS[type as ExamType] ?? type;
              const colorClass = EXAM_TYPE_COLORS[type as ExamType] ?? 'bg-gray-100 text-gray-700 border-gray-200';
              const pct = Math.round((count / examStats.total_exams) * 100);
              return (
                <div key={type} className="flex items-center gap-3">
                  <Badge className={`text-xs shrink-0 w-20 justify-center border ${colorClass}`}>{label}</Badge>
                  <div className="flex-1 bg-muted/40 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full bg-bolt-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Exam list table */}
      {examStats.exams.length > 0 && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-bolt-line">
            <p className="text-xs font-semibold text-muted-foreground">Détail des épreuves</p>
          </div>
          <div className="divide-y divide-bolt-line">
            {examStats.exams.map((ex) => {
              const typeLabel = EXAM_TYPE_LABELS[ex.exam_type] ?? ex.exam_type;
              const typeColor = EXAM_TYPE_COLORS[ex.exam_type] ?? 'bg-gray-100 text-gray-700 border-gray-200';
              return (
                <div key={ex.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ex.original_name ?? 'Épreuve'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Badge className={`text-xs border ${typeColor}`}>{typeLabel}</Badge>
                      <Badge variant="outline" className="text-xs">{ex.weight ?? 30}%</Badge>
                      {ex.has_practical_questions && (
                        <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200 border">
                          <FlaskConical className="h-2.5 w-2.5 mr-1" />Pratique
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {ex.overall_score !== null && (
                      <div className="text-right">
                        <p className="text-sm font-bold">{Number(ex.overall_score).toFixed(1)}<span className="text-xs font-normal text-muted-foreground">/10</span></p>
                        {ex.aa_coverage !== null && <p className="text-xs text-muted-foreground">AA: {ex.aa_coverage}%</p>}
                      </div>
                    )}
                    <StatusBadge status={ex.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
