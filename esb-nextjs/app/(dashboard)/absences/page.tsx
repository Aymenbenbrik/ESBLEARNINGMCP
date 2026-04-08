'use client';

import { useAuth } from '@/lib/contexts/AuthContext';
import { useCourses, useMyAttendance } from '@/lib/hooks/useCourses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo } from 'react';

function statusBadge(s: 'present' | 'late' | 'absent') {
  if (s === 'present') return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Présent</Badge>;
  if (s === 'late') return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">En retard</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Absent</Badge>;
}

function AttendanceSummaryCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: any; color: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`rounded-full p-2 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AttendanceDot({ status }: { status: 'present' | 'late' | 'absent' }) {
  const colors = {
    present: 'bg-green-500',
    late: 'bg-yellow-500',
    absent: 'bg-red-500',
  };
  return (
    <div
      className={`w-3 h-3 rounded-full ${colors[status]}`}
      title={status === 'present' ? 'Présent' : status === 'late' ? 'En retard' : 'Absent'}
    />
  );
}

function CourseAttendance({
  courseId,
  courseTitle,
  onStats,
}: {
  courseId: number;
  courseTitle: string;
  onStats: (stats: { present: number; late: number; absent: number; total: number }) => void;
}) {
  const { data, isLoading } = useMyAttendance(courseId);

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (!data) return null;

  const { summary, attendance } = data;
  const present = summary?.present ?? 0;
  const late = summary?.late ?? 0;
  const absent = summary?.absent ?? 0;
  const total = summary?.total ?? 0;
  const rate = total > 0 ? ((present + late) / total * 100) : 0;

  // Report stats to parent
  if (typeof onStats === 'function') {
    // Using a timeout to avoid setState during render
    setTimeout(() => onStats({ present, late, absent, total }), 0);
  }

  return (
    <div className="space-y-3">
      {/* Course header with rate */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {rate < 80 && total > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          <span className="font-medium">{courseTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                rate >= 80 ? 'bg-green-500' : rate >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
          <span className={`text-sm font-medium min-w-[3rem] text-right ${
            rate >= 80 ? 'text-green-600' : rate >= 60 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {rate.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Attendance dots heatmap */}
      {attendance.length > 0 && (
        <div className="pl-4 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {attendance.map((a: any, i: number) => (
              <div key={i} className="group relative">
                <AttendanceDot status={a.status} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                  <div className="bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                    {a.session_title || `Séance ${i + 1}`}: {a.status === 'present' ? 'Présent' : a.status === 'late' ? 'En retard' : 'Absent'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Compact session list */}
          <div className="space-y-1">
            {attendance.slice(0, 5).map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                <span className="text-muted-foreground">{a.session_title || `Séance ${i + 1}`}</span>
                {statusBadge(a.status)}
              </div>
            ))}
            {attendance.length > 5 && (
              <p className="text-xs text-muted-foreground">+ {attendance.length - 5} autres séances</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AbsencesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: coursesData, isLoading: coursesLoading } = useCourses();
  const [courseStats, setCourseStats] = useState<Record<number, { present: number; late: number; absent: number; total: number }>>({});

  const handleStats = (courseId: number) => (stats: { present: number; late: number; absent: number; total: number }) => {
    setCourseStats(prev => {
      const existing = prev[courseId];
      if (existing && existing.present === stats.present && existing.late === stats.late && existing.absent === stats.absent) return prev;
      return { ...prev, [courseId]: stats };
    });
  };

  // Compute overall stats
  const overallStats = useMemo(() => {
    const values = Object.values(courseStats);
    if (values.length === 0) return { present: 0, late: 0, absent: 0, total: 0, rate: 0 };
    const present = values.reduce((a, b) => a + b.present, 0);
    const late = values.reduce((a, b) => a + b.late, 0);
    const absent = values.reduce((a, b) => a + b.absent, 0);
    const total = values.reduce((a, b) => a + b.total, 0);
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, late, absent, total, rate };
  }, [courseStats]);

  if (authLoading || coursesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user || !coursesData) return null;

  const enrolledCourses = coursesData.enrolled_courses || [];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-red-600" />
          Mes Absences
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi de présence par module
        </p>
      </div>

      {/* Summary Cards with live totals */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <AttendanceSummaryCard label="Modules inscrits" value={enrolledCourses.length} icon={Calendar} color="bg-slate-100 text-slate-600" />
        <AttendanceSummaryCard label="Présent" value={overallStats.present} icon={CheckCircle2} color="bg-green-100 text-green-600" />
        <AttendanceSummaryCard label="En retard" value={overallStats.late} icon={Clock} color="bg-yellow-100 text-yellow-600" />
        <AttendanceSummaryCard label="Absent" value={overallStats.absent} icon={XCircle} color="bg-red-100 text-red-600" />
        <AttendanceSummaryCard
          label="Taux global"
          value={overallStats.total > 0 ? `${overallStats.rate}%` : '—'}
          icon={CheckCircle2}
          color={overallStats.rate >= 80 ? 'bg-green-100 text-green-600' : overallStats.rate >= 60 ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'}
        />
      </div>

      {/* Overall alert */}
      {overallStats.total > 0 && overallStats.rate < 80 && (
        <Card className="rounded-2xl border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-800">Taux de présence global insuffisant</p>
                <p className="text-sm text-red-600 mt-1">
                  Votre taux de présence global est de {overallStats.rate}% ({overallStats.present + overallStats.late}/{overallStats.total} séances).
                  Un minimum de 80% est requis.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heatmap Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Présent</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> En retard</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Absent</span>
      </div>

      {/* Per-course Attendance */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Présence par module</CardTitle>
        </CardHeader>
        <CardContent>
          {enrolledCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun module inscrit.
            </p>
          ) : (
            <div className="divide-y">
              {enrolledCourses.map((course) => (
                <div key={course.id} className="py-4 first:pt-0 last:pb-0">
                  <CourseAttendance
                    courseId={course.id}
                    courseTitle={course.title}
                    onStats={handleStats(course.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
