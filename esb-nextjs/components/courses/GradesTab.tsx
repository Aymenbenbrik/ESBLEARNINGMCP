'use client';

import { useState, useEffect, useMemo } from 'react';
import { Save, Download, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useGradeWeights,
  useUpdateGradeWeights,
  useAllGrades,
  useMyGrade,
  useCourseClasses,
  useClassStats,
} from '@/lib/hooks/useCourses';
import { GradeWeight, StudentGrade } from '@/lib/types/course';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface Props {
  courseId: number;
  canEdit: boolean;
}

function gradeColor(grade: number | null) {
  if (grade === null) return '';
  if (grade >= 14) return 'text-green-600 font-bold';
  if (grade >= 10) return 'text-orange-500 font-bold';
  return 'text-red-600 font-bold';
}

function gradeRowBg(grade: number | null) {
  if (grade === null) return '';
  if (grade >= 14) return 'bg-green-50';
  if (grade >= 10) return 'bg-yellow-50';
  return 'bg-red-50';
}

function fmt(v: number | null) {
  if (v === null) return '–';
  return v.toFixed(2);
}

function computeDistribution(grades: StudentGrade[]) {
  const ranges = [
    { range: '0-4', min: 0, max: 4, count: 0 },
    { range: '4-8', min: 4, max: 8, count: 0 },
    { range: '8-12', min: 8, max: 12, count: 0 },
    { range: '12-16', min: 12, max: 16, count: 0 },
    { range: '16-20', min: 16, max: 20.01, count: 0 },
  ];
  for (const g of grades) {
    if (g.final_grade === null) continue;
    for (const r of ranges) {
      if (g.final_grade >= r.min && g.final_grade < r.max) {
        r.count++;
        break;
      }
    }
  }
  return ranges;
}

const HISTOGRAM_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

function computeLocalStats(grades: StudentGrade[]) {
  const valid = grades.filter(g => g.final_grade !== null).map(g => g.final_grade as number);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const count = sorted.length;
  const avg = sum / count;
  const min = sorted[0];
  const max = sorted[count - 1];
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];
  const passing = sorted.filter(g => g >= 10).length;
  const passRate = (passing / count) * 100;
  return { average: avg, min, max, median, count, passRate };
}

function exportGradesCSV(grades: StudentGrade[]) {
  const header = 'Étudiant,Email,Quiz /20,Devoir /20,Présence /20,Examen /20,Note finale /20';
  const rows = grades.map(g =>
    `"${g.student_name}","${g.student_email}",${fmt(g.quiz_avg)},${fmt(g.assignment_avg)},${fmt(g.attendance_score)},${fmt(g.exam_score)},${fmt(g.final_grade)}`
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notes_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Weight Config ────────────────────────────────────────────────────────────

function WeightConfig({ courseId }: { courseId: number }) {
  const { data: weights, isLoading } = useGradeWeights(courseId);
  const update = useUpdateGradeWeights(courseId);

  const [quiz, setQuiz] = useState(0);
  const [assignment, setAssignment] = useState(0);
  const [attendance, setAttendance] = useState(0);
  const [exam, setExam] = useState(0);

  useEffect(() => {
    if (weights) {
      setQuiz(weights.quiz_weight);
      setAssignment(weights.assignment_weight);
      setAttendance(weights.attendance_weight);
      setExam(weights.exam_weight);
    }
  }, [weights]);

  const total = quiz + assignment + attendance + exam;
  const isValid = total === 100;

  const handleSave = () => {
    update.mutate({
      quiz_weight: quiz,
      assignment_weight: assignment,
      attendance_weight: attendance,
      exam_weight: exam,
    });
  };

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 md:p-6">
      <h3 className="text-base font-semibold mb-4">Pondération des notes</h3>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {[
          { label: 'Quiz (%)', value: quiz, set: setQuiz },
          { label: 'Devoir (%)', value: assignment, set: setAssignment },
          { label: 'Présence (%)', value: attendance, set: setAttendance },
          { label: 'Examen (%)', value: exam, set: setExam },
        ].map(({ label, value, set }) => (
          <div key={label} className="space-y-1">
            <Label>{label}</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={value}
              onChange={e => set(Number(e.target.value))}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <span className={`text-sm ${isValid ? 'text-green-600' : 'text-red-500'}`}>
          Total : {total}% {isValid ? '✓' : '⚠ Doit être égal à 100%'}
        </span>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isValid || update.isPending}
        >
          <Save className="h-4 w-4 mr-1" />
          {update.isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}

// ─── Stats Summary Cards ──────────────────────────────────────────────────────

function StatsSummaryCards({ grades, apiStats }: {
  grades: StudentGrade[];
  apiStats?: { average: number | null; min: number | null; max: number | null; median: number | null; count: number } | null;
}) {
  const localStats = useMemo(() => computeLocalStats(grades), [grades]);
  const s = apiStats && apiStats.count > 0 ? {
    average: apiStats.average,
    min: apiStats.min,
    max: apiStats.max,
    median: apiStats.median,
    count: apiStats.count,
    passRate: localStats?.passRate ?? 0,
  } : localStats;

  if (!s) return null;

  const cards = [
    { label: 'Moyenne', value: fmt(s.average), color: gradeColor(s.average), icon: '📊' },
    { label: 'Min', value: fmt(s.min), color: gradeColor(s.min), icon: '📉' },
    { label: 'Max', value: fmt(s.max), color: gradeColor(s.max), icon: '📈' },
    { label: 'Médiane', value: fmt(s.median), color: gradeColor(s.median), icon: '📐' },
    { label: 'Taux de réussite', value: `${s.passRate.toFixed(0)}%`, color: s.passRate >= 50 ? 'text-green-600 font-bold' : 'text-red-600 font-bold', icon: '🎯' },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
      {cards.map(c => (
        <div key={c.label} className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 text-center">
          <p className="text-lg mb-1">{c.icon}</p>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Grade Distribution Histogram ─────────────────────────────────────────────

function GradeHistogram({ grades }: { grades: StudentGrade[] }) {
  const distribution = useMemo(() => computeDistribution(grades), [grades]);
  const hasData = distribution.some(d => d.count > 0);
  if (!hasData) return null;

  return (
    <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4 md:p-6">
      <h3 className="text-sm font-semibold mb-4">Distribution des notes</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distribution} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="range" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 13 }}
              formatter={(value: any) => [`${value} étudiant(s)`, 'Nombre']}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60}>
              {distribution.map((_, i) => (
                <Cell key={i} fill={HISTOGRAM_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Teacher Grade Table ──────────────────────────────────────────────────────

function TeacherGradesView({ courseId }: { courseId: number }) {
  const [selectedClassId, setSelectedClassId] = useState<number | undefined>(undefined);
  const { data: classes, isLoading: classesLoading } = useCourseClasses(courseId);
  const { data, isLoading } = useAllGrades(courseId, selectedClassId);
  const { data: stats } = useClassStats(courseId, selectedClassId);

  const grades: StudentGrade[] = data?.grades ?? [];
  const hasClasses = !!classes && classes.length > 0;

  return (
    <div className="space-y-4">
      <WeightConfig courseId={courseId} />

      {/* Stats Summary Cards */}
      {grades.length > 0 && (
        <StatsSummaryCards grades={grades} apiStats={selectedClassId !== undefined ? stats : undefined} />
      )}

      {/* Grade Distribution Histogram */}
      {grades.length > 0 && <GradeHistogram grades={grades} />}

      <div className="rounded-xl border border-bolt-line bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-bolt-line flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Notes des étudiants</h3>
          <div className="flex items-center gap-2">
            {grades.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => exportGradesCSV(grades)}>
                <Download className="h-4 w-4 mr-1" />
                Exporter CSV
              </Button>
            )}
            {hasClasses && (
              <Select
                value={selectedClassId !== undefined ? String(selectedClassId) : 'all'}
                onValueChange={(v) => setSelectedClassId(v === 'all' ? undefined : Number(v))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Toutes les classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
                  {classes!.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} ({c.students_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {isLoading || classesLoading ? (
          <div className="p-4"><Skeleton className="h-32" /></div>
        ) : grades.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Aucune note disponible.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bolt-line bg-muted/20">
                  <th className="text-left p-3 font-medium">Étudiant</th>
                  <th className="text-center p-3 font-medium">Quiz /20</th>
                  <th className="text-center p-3 font-medium">Devoir /20</th>
                  <th className="text-center p-3 font-medium">Présence /20</th>
                  <th className="text-center p-3 font-medium">Examen /20</th>
                  <th className="text-center p-3 font-medium">Note finale /20</th>
                </tr>
              </thead>
              <tbody>
                {grades.map(g => (
                  <tr
                    key={g.student_id}
                    className={`border-b border-bolt-line last:border-0 transition-colors hover:opacity-80 ${gradeRowBg(g.final_grade)}`}
                  >
                    <td className="p-3">
                      <p className="font-medium">{g.student_name}</p>
                      <p className="text-xs text-muted-foreground">{g.student_email}</p>
                    </td>
                    <td className="p-3 text-center text-muted-foreground">{fmt(g.quiz_avg)}</td>
                    <td className="p-3 text-center text-muted-foreground">{fmt(g.assignment_avg)}</td>
                    <td className="p-3 text-center text-muted-foreground">{fmt(g.attendance_score)}</td>
                    <td className="p-3 text-center text-muted-foreground">{fmt(g.exam_score)}</td>
                    <td className={`p-3 text-center ${gradeColor(g.final_grade)}`}>
                      {fmt(g.final_grade)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Student Grade View ───────────────────────────────────────────────────────

function StudentGradesView({ courseId }: { courseId: number }) {
  const { data, isLoading } = useMyGrade(courseId);

  if (isLoading) return <Skeleton className="h-48" />;

  if (!data) {
    return (
      <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-8 text-center">
        <p className="text-sm text-muted-foreground">Aucune note disponible pour le moment.</p>
      </div>
    );
  }

  const weights = (data as any).weights as GradeWeight | undefined;
  const classAvg: number | null = (data as any).class_average ?? null;
  const rank: number | null = (data as any).rank ?? null;
  const totalStudents: number | null = (data as any).total_students ?? null;

  const myGrade = data.final_grade;

  const components = [
    {
      label: 'Quiz',
      value: data.quiz_avg,
      weight: weights?.quiz_weight,
      count: data.quiz_count,
      detail: `${data.quiz_count} quiz complété(s)`,
    },
    {
      label: 'Devoir',
      value: data.assignment_avg,
      weight: weights?.assignment_weight,
      count: data.assignment_count,
      detail: `${data.assignment_count} devoir(s) noté(s)`,
    },
    {
      label: 'Présence',
      value: data.attendance_score,
      weight: weights?.attendance_weight,
      count: data.total_sessions,
      detail: `${data.total_sessions} séance(s)`,
    },
    {
      label: 'Examen',
      value: data.exam_score,
      weight: weights?.exam_weight,
      count: null,
      detail: '',
    },
  ];

  const isAboveAvg = classAvg !== null && myGrade !== null && myGrade >= classAvg;
  const isBelowAvg = classAvg !== null && myGrade !== null && myGrade < classAvg;

  return (
    <div className="space-y-4">
      {/* Final grade card with comparison */}
      <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-6 text-center">
        <p className="text-sm text-muted-foreground mb-1">Note finale</p>
        <p className={`text-5xl font-bold ${gradeColor(data.final_grade)}`}>
          {fmt(data.final_grade)}
          <span className="text-2xl text-muted-foreground font-normal">/20</span>
        </p>

        {/* Comparison indicator */}
        {classAvg !== null && myGrade !== null && (
          <div className="mt-3 flex items-center justify-center gap-3 text-sm">
            <span className="text-muted-foreground">Moyenne de classe : <strong>{classAvg.toFixed(2)}</strong></span>
            {isAboveAvg ? (
              <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                <TrendingUp className="h-4 w-4" />
                +{(myGrade - classAvg).toFixed(2)}
              </span>
            ) : isBelowAvg ? (
              <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                <TrendingDown className="h-4 w-4" />
                {(myGrade - classAvg).toFixed(2)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                <ArrowRight className="h-4 w-4" />
                Égal
              </span>
            )}
          </div>
        )}

        {/* Rank */}
        {rank !== null && totalStudents !== null && (
          <p className="mt-2 text-sm text-muted-foreground">
            Classement : <strong className="text-foreground">{rank}</strong>/{totalStudents}
          </p>
        )}
      </div>

      {/* Component breakdown */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {components.map(c => (
          <div key={c.label} className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">{c.label}</p>
              {c.weight !== undefined && (
                <span className="text-xs text-muted-foreground">{c.weight}%</span>
              )}
            </div>
            <p className={`text-2xl font-bold ${gradeColor(c.value)}`}>
              {fmt(c.value)}<span className="text-sm text-muted-foreground font-normal">/20</span>
            </p>
            {c.detail && <p className="text-xs text-muted-foreground mt-1">{c.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function GradesTab({ courseId, canEdit }: Props) {
  return (
    <div className="space-y-4">
      {canEdit ? (
        <TeacherGradesView courseId={courseId} />
      ) : (
        <StudentGradesView courseId={courseId} />
      )}
    </div>
  );
}
