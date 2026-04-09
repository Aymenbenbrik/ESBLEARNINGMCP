'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useMyDashboard, useStudentDashboard } from '@/lib/hooks/useDashboards';
import { useAdminDashboard } from '@/lib/hooks/useAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { safeNumber, safePercent } from '@/lib/format';
import { PieChart, Pie, Cell } from 'recharts';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  GraduationCap,
  Layers3,
  Loader2,
  Pencil,
  TrendingUp,
  Users,
} from 'lucide-react';

import type { AdminDashboardResponse } from '@/lib/types/admin';
import type { MyDashboardResponse } from '@/lib/types/dashboards';
import type { StudentDashboardResponseV2 } from '@/lib/types/dashboards';

/* -------------------------------------------------------------------------- */
/*  Circular Progress (Donut) - recharts                                      */
/* -------------------------------------------------------------------------- */

function CircularProgress({
  value,
  size = 120,
  color = '#14b8a6',
  label,
}: {
  value: number;
  size?: number;
  color?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const data = [{ value: clamped }, { value: 100 - clamped }];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          cx={size / 2}
          cy={size / 2}
          innerRadius={size / 2 - 12}
          outerRadius={size / 2 - 4}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          stroke="none"
        >
          <Cell fill={color} />
          <Cell fill="#e5e7eb" />
        </Pie>
      </PieChart>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}

/* ========================================================================== */
/*  ADMIN Dashboard                                                           */
/* ========================================================================== */

function AdminDashboard({
  data,
  user,
}: {
  data: AdminDashboardResponse | undefined;
  user: { username: string };
}) {
  const stats = data?.stats;
  const recent = data?.recent;

  const kpis: { label: string; value: number; icon: React.ElementType; bg: string; text: string }[] = [
    { label: 'Enseignants', value: stats?.teachers_count ?? 0, icon: BookOpen, bg: 'bg-blue-50', text: 'text-blue-600' },
    { label: 'Etudiants', value: stats?.students_count ?? 0, icon: Users, bg: 'bg-indigo-50', text: 'text-indigo-600' },
    { label: 'Cours actifs', value: stats?.courses_count ?? 0, icon: Layers3, bg: 'bg-violet-50', text: 'text-violet-600' },
    { label: 'Classes', value: stats?.classes_count ?? 0, icon: GraduationCap, bg: 'bg-sky-50', text: 'text-sky-600' },
    { label: 'Programmes', value: stats?.programs_count ?? 0, icon: FileText, bg: 'bg-purple-50', text: 'text-purple-600' },
  ];

  const quickActions = [
    { href: '/admin/programs', label: 'Programmes', icon: Layers3 },
    { href: '/admin/teachers', label: 'Enseignants', icon: BookOpen },
    { href: '/admin/students', label: 'Etudiants', icon: Users },
    { href: '/admin/classes', label: 'Classes', icon: GraduationCap },
  ];

  return (
    <div className="space-y-6 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Tableau de bord &mdash; Administration</h1>
        <p className="mt-1 text-slate-500">Bienvenue, {user.username}. Voici un apercu global de la plateforme.</p>
      </div>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`rounded-xl p-3 ${k.bg} ${k.text}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{safeNumber(k.value)}</p>
                  <p className="text-xs text-slate-500">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Recent activity + Quick actions */}
      <section className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
        {/* Recent users & classes */}
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Activite recente</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recent?.users ?? []).slice(0, 5).map((u) => (
                  <TableRow key={`u-${u.id}`}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-700">
                        {u.is_teacher ? 'Enseignant' : u.is_superuser ? 'Admin' : 'Etudiant'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '\u2014'}
                    </TableCell>
                  </TableRow>
                ))}
                {(recent?.classes ?? []).slice(0, 3).map((c) => (
                  <TableRow key={`c-${c.id}`}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="rounded-full bg-indigo-50 text-indigo-700">
                        Classe
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : '\u2014'}
                    </TableCell>
                  </TableRow>
                ))}
                {(!recent?.users?.length && !recent?.classes?.length) && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-slate-400">
                      Aucune activite recente.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Acces rapide</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <Button key={a.href} asChild variant="outline" className="justify-start gap-3 rounded-xl border-slate-200 text-left">
                  <Link href={a.href}>
                    <Icon className="h-4 w-4 text-blue-600" />
                    {a.label}
                    <ArrowRight className="ml-auto h-4 w-4 text-slate-400" />
                  </Link>
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ========================================================================== */
/*  TEACHER Dashboard                                                         */
/* ========================================================================== */

function TeacherDashboard({
  data,
  user,
}: {
  data: MyDashboardResponse | undefined;
  user: { username: string };
}) {
  const stats = data?.stats;
  const courses = data?.courses ?? [];
  const recentQuizzes = data?.recent_quizzes ?? [];

  const kpis: { label: string; value: string; icon: React.ElementType }[] = [
    { label: 'Cours diriges', value: String(safeNumber(courses.length)), icon: BookOpen },
    { label: 'Etudiants inscrits', value: String(safeNumber(stats?.total_students)), icon: Users },
    { label: 'Travaux a corriger', value: String(safeNumber(stats?.total_quizzes)), icon: FileText },
    { label: 'Completion', value: safePercent(stats?.completion_rate, 0, '0%'), icon: TrendingUp },
  ];

  const toGrade = recentQuizzes.slice(0, 5);
  const latestSubmissions = recentQuizzes.slice(0, 5);

  return (
    <div className="space-y-6 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Tableau de bord &mdash; Enseignant</h1>
        <p className="mt-1 text-slate-500">Bienvenue, {user.username}. Voici l&apos;etat de vos cours.</p>
      </div>

      {/* KPI cards - teal/emerald */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="rounded-2xl border-teal-100 bg-teal-50 shadow-sm">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-xl bg-teal-600 p-3 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{k.value}</p>
                  <p className="text-xs text-teal-700">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Course donut charts */}
      {courses.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Progression par cours</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.slice(0, 8).map((course) => {
              const completion = safeNumber(course.stats.completion_rate);
              const avgScore = safeNumber(course.stats.avg_score);
              const displayValue = completion > 0 ? completion : avgScore;
              return (
                <Card key={course.id} className="rounded-2xl border-slate-200 shadow-sm">
                  <CardContent className="flex flex-col items-center p-5">
                    <CircularProgress value={displayValue} color="#14b8a6" />
                    <p className="mt-3 text-center text-sm font-semibold text-slate-900 line-clamp-2">{course.title}</p>
                    <p className="text-xs text-slate-500">{user.username}</p>
                    <div className="mt-2 flex gap-3 text-xs text-slate-500">
                      <span>{safeNumber(course.stats.total_students)} etudiants</span>
                      <span>{safeNumber(course.stats.total_quizzes)} quiz</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Tables: A corriger & Dernieres soumissions */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">A Corriger &amp; Alertes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tache</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {toGrade.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-slate-400">
                      Rien a corriger pour le moment.
                    </TableCell>
                  </TableRow>
                ) : (
                  toGrade.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium">{q.student_name}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(q.completed_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="rounded-full bg-teal-50 text-teal-700">
                          Quiz
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 rounded-lg border-teal-200 text-xs text-teal-700 hover:bg-teal-50">
                          <Pencil className="mr-1 h-3 w-3" />
                          Corriger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Dernieres Soumissions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tache</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Etudiant</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestSubmissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-slate-400">
                      Pas encore de soumissions.
                    </TableCell>
                  </TableRow>
                ) : (
                  latestSubmissions.map((q) => (
                    <TableRow key={`sub-${q.id}`}>
                      <TableCell className="font-medium">Quiz #{q.id}</TableCell>
                      <TableCell>
                        <Badge
                          className={`rounded-full ${
                            safeNumber(q.score) >= 50
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-red-100 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {safePercent(q.score, 0, '0%')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{q.student_name}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 rounded-lg border-teal-200 text-xs text-teal-700 hover:bg-teal-50">
                          <Eye className="mr-1 h-3 w-3" />
                          Voir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ========================================================================== */
/*  STUDENT Dashboard                                                         */
/* ========================================================================== */

function StudentDashboard({
  data,
  user,
}: {
  data: StudentDashboardResponseV2 | undefined;
  user: { username: string };
}) {
  const stats = data?.stats;
  const courses = data?.courses ?? [];
  const recentQuizzes = data?.recent_quizzes ?? [];

  const studyHours = safeNumber(stats?.quizzes_completed, 0) * 2;

  const kpis: { label: string; value: string; icon: React.ElementType; bg: string; text: string }[] = [
    { label: "Heures d'etude", value: String(studyHours), icon: Clock, bg: 'bg-orange-50', text: 'text-orange-600' },
    { label: 'Cours en cours', value: String(safeNumber(stats?.total_courses)), icon: BookOpen, bg: 'bg-amber-50', text: 'text-amber-600' },
    { label: 'Prochaines echeances', value: '0', icon: CheckCircle2, bg: 'bg-yellow-50', text: 'text-yellow-600' },
    { label: 'Taux de completion', value: safePercent(stats?.completion_rate, 0, '0%'), icon: TrendingUp, bg: 'bg-orange-50', text: 'text-orange-600' },
  ];

  return (
    <div className="space-y-6 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Tableau de bord &mdash; Etudiant</h1>
        <p className="mt-1 text-slate-500">Salut {user.username} ! Voici ta progression.</p>
      </div>

      {/* KPI cards - orange/amber */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`rounded-xl p-3 ${k.bg} ${k.text}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{k.value}</p>
                  <p className="text-xs text-slate-500">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Course donut charts */}
      {courses.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Ma progression par cours</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.slice(0, 8).map((course) => {
              const completion = safeNumber(course.completion_rate);
              const avgScore = safeNumber(course.avg_score);
              const displayValue = completion > 0 ? completion : avgScore;
              return (
                <Card key={course.id} className="rounded-2xl border-slate-200 shadow-sm">
                  <CardContent className="flex flex-col items-center p-5">
                    <CircularProgress value={displayValue} color="#f59e0b" />
                    <p className="mt-3 text-center text-sm font-semibold text-slate-900 line-clamp-2">{course.title}</p>
                    <div className="mt-2 flex gap-3 text-xs text-slate-500">
                      <span>{safeNumber(course.quizzes_completed)}/{safeNumber(course.total_quizzes)} quiz</span>
                      <span>Moy. {safePercent(course.avg_score, 0, '0%')}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Tables: A faire & Dernieres activites */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">A faire bientot</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tache</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-slate-400">
                      Aucune tache en attente.
                    </TableCell>
                  </TableRow>
                ) : (
                  courses
                    .filter((c) => safeNumber(c.quizzes_completed) < safeNumber(c.total_quizzes))
                    .slice(0, 5)
                    .map((c) => (
                      <TableRow key={`todo-${c.id}`}>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell className="text-xs text-slate-500">{'\u2014'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="rounded-full bg-amber-50 text-amber-700">
                            Quiz
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline" className="h-7 rounded-lg border-amber-200 text-xs text-amber-700 hover:bg-amber-50">
                            <Link href={`/courses/${c.id}`}>
                              <Pencil className="mr-1 h-3 w-3" />
                              Editer
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Dernieres activites &amp; resultats</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tache</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentQuizzes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-slate-400">
                      Pas encore de resultats.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentQuizzes.slice(0, 5).map((q) => (
                    <TableRow key={`res-${q.id}`}>
                      <TableCell className="font-medium">{q.quiz_title ?? `Quiz #${q.id}`}</TableCell>
                      <TableCell>
                        <Badge
                          className={`rounded-full ${
                            safeNumber(q.score) >= 50
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-red-100 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {safePercent(q.score, 0, '0%')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{q.student_name}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(q.completed_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ========================================================================== */
/*  Main Page                                                                 */
/* ========================================================================== */

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isAdminOnly = !!(user?.is_superuser && !user?.is_teacher);
  const isTeacher = !!(user?.is_teacher || user?.is_superuser);

  const adminDashboard = useAdminDashboard();
  const teacherDashboard = useMyDashboard();
  const studentDashboard = useStudentDashboard(user?.id ?? 0);

  if (authLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const isDataLoading = isAdminOnly
    ? adminDashboard.isLoading
    : isTeacher
    ? teacherDashboard.isLoading
    : studentDashboard.isLoading;

  if (isDataLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isAdminOnly) {
    return <AdminDashboard data={adminDashboard.data} user={user} />;
  }

  if (isTeacher) {
    return <TeacherDashboard data={teacherDashboard.data} user={user} />;
  }

  return <StudentDashboard data={studentDashboard.data} user={user} />;
}
