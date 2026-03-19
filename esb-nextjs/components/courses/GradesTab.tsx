'use client';

import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGradeWeights,
  useUpdateGradeWeights,
  useAllGrades,
  useMyGrade,
} from '@/lib/hooks/useCourses';
import { GradeWeight, StudentGrade } from '@/lib/types/course';

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

function fmt(v: number | null) {
  if (v === null) return '–';
  return v.toFixed(2);
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

// ─── Teacher Grade Table ──────────────────────────────────────────────────────

function TeacherGradesView({ courseId }: { courseId: number }) {
  const { data, isLoading } = useAllGrades(courseId);

  const grades: StudentGrade[] = data?.grades ?? [];

  return (
    <div className="space-y-4">
      <WeightConfig courseId={courseId} />

      <div className="rounded-xl border border-bolt-line bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-bolt-line">
          <h3 className="text-base font-semibold">Notes des étudiants</h3>
        </div>
        {isLoading ? (
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
                  <tr key={g.student_id} className="border-b border-bolt-line last:border-0 hover:bg-muted/10">
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

  return (
    <div className="space-y-4">
      {/* Final grade card */}
      <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-6 text-center">
        <p className="text-sm text-muted-foreground mb-1">Note finale</p>
        <p className={`text-5xl font-bold ${gradeColor(data.final_grade)}`}>
          {fmt(data.final_grade)}
          <span className="text-2xl text-muted-foreground font-normal">/20</span>
        </p>
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
