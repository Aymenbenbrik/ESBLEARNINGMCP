'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useMyDashboard } from '@/lib/hooks/useDashboards';
import { useStudentDashboard } from '@/lib/hooks/useDashboards';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardStats } from '@/components/courses/DashboardStats';
import { ActivityCalendar } from '@/components/courses/ActivityCalendar';
import { safeNumber, safePercent } from '@/lib/format';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  FileText,
  GraduationCap,
  Home,
  Layers3,
  Loader2,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isAdminOnly = !!(user?.is_superuser && !user?.is_teacher);
  const isTeacher = !!(user?.is_teacher || user?.is_superuser);

  const teacherDashboard = useMyDashboard();
  const studentDashboard = useStudentDashboard(user?.id ?? 0);

  if (authLoading || teacherDashboard.isLoading || studentDashboard.isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const quickLinks = isAdminOnly
    ? [
        { href: '/admin/programs', label: 'Programmes', icon: Layers3, desc: 'Gérer les formations et les plans d\'étude' },
        { href: '/admin/teachers', label: 'Enseignants', icon: BookOpen, desc: 'Ajouter, modifier et gérer les enseignants' },
        { href: '/admin/students', label: 'Étudiants', icon: Users, desc: 'Gérer les comptes étudiants' },
        { href: '/admin/classes', label: 'Classes', icon: GraduationCap, desc: 'Gérer les classes et les affectations' },
      ]
    : isTeacher
    ? [
        { href: '/courses', label: 'Modules', icon: BookOpen, desc: 'Gérer les cours, chapitres et fichiers' },
        { href: '/courses/new', label: 'Nouveau module', icon: Plus, desc: 'Créer rapidement un nouveau module' },
        { href: '/teacher-dashboard', label: 'Dashboard complet', icon: BarChart3, desc: 'Voir analytics, quiz et indicateurs' },
        { href: '/students', label: 'Étudiants', icon: Users, desc: 'Accéder au suivi des étudiants' },
      ]
    : [
        { href: '/courses', label: 'Mes modules', icon: BookOpen, desc: 'Accéder à tes cours et documents' },
        { href: '/student-dashboard', label: 'Mon dashboard', icon: BarChart3, desc: 'Voir tes résultats et progrès' },
        { href: '/classes', label: 'Ma classe', icon: GraduationCap, desc: 'Consulter ta classe et tes séances' },
        { href: '/profile', label: 'Mon profil', icon: FileText, desc: 'Gérer tes informations personnelles' },
      ];

  const teacherData = teacherDashboard.data;
  const studentData = studentDashboard.data;
  const stats = isTeacher ? teacherData?.stats : studentData?.stats;

  return (
    <div className="space-y-6 py-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr,0.8fr] lg:p-8">
          <div className="space-y-5">
            <Badge variant="secondary" className="inline-flex rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {isAdminOnly ? 'Administration' : isTeacher ? 'Accueil enseignant' : 'Accueil étudiant'}
            </Badge>

            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">
                Bienvenue, {user.username}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600">
                {isAdminOnly
                  ? "Gérez les formations, les enseignants, les étudiants et les classes depuis cette interface d'administration."
                  : isTeacher
                  ? 'Une home page plus claire avec les KPI du dashboard, les accès rapides et un aperçu direct de l’activité pédagogique.'
                  : 'Retrouve rapidement tes indicateurs, tes cours et ta progression globale depuis cette page d’accueil.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-2xl bg-red-600 px-5 text-white hover:bg-red-700">
                <Link href={isTeacher ? '/courses' : '/student-dashboard'}>
                  {isTeacher ? 'Ouvrir les modules' : 'Voir mon dashboard'}
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-2xl border-slate-200 px-5">
                <Link href={isTeacher ? '/teacher-dashboard' : '/courses'}>
                  {isTeacher ? 'Voir le dashboard complet' : 'Ouvrir mes cours'}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Rôle</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{isTeacher ? 'Teacher' : 'Student'}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Compte</p>
              <p className="mt-3 line-clamp-2 text-base font-semibold text-slate-900">{user.email || user.username}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-red-50 p-5 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">KPI rapides</p>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Modules</p>
                  <p className="text-3xl font-bold text-slate-900">{safeNumber((stats as any)?.total_courses ?? teacherData?.courses?.length)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Quiz récents</p>
                  <p className="text-3xl font-bold text-slate-900">{safeNumber(teacherData?.recent_quizzes?.length ?? studentData?.stats?.quizzes_completed)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Moyenne</p>
                  <p className="text-3xl font-bold text-slate-900">{safePercent(stats?.avg_score)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {stats ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">KPI du dashboard</h2>
              <p className="text-sm text-slate-500">Les indicateurs principaux sont affichés directement sur la home page.</p>
            </div>
            <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
              <Link href={isTeacher ? '/teacher-dashboard' : '/student-dashboard'}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Ouvrir le dashboard complet
              </Link>
            </Button>
          </div>
          <DashboardStats stats={stats as any} />
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.href} className="rounded-[24px] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 inline-flex rounded-2xl bg-red-50 p-3 text-red-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{item.label}</h3>
                <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-500">{item.desc}</p>
                <Button asChild variant="ghost" className="mt-4 h-auto px-0 text-red-600 hover:bg-transparent hover:text-red-700">
                  <Link href={item.href}>
                    Ouvrir la section
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {!isTeacher && (
        <section>
          <ActivityCalendar />
        </section>
      )}

      {isTeacher && teacherData ? (
        <section className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <Card className="rounded-[24px] border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">Modules actifs</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {teacherData.courses.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun module pour le moment.</p>
              ) : (
                teacherData.courses.slice(0, 6).map((course) => (
                  <div key={course.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{course.title}</p>
                        {course.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{course.description}</p>
                        ) : null}
                      </div>
                      <Layers3 className="mt-0.5 h-4 w-4 text-slate-400" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-white p-2">
                        <div className="font-bold text-slate-900">{safeNumber(course.stats.total_students)}</div>
                        <div className="text-slate-500">Students</div>
                      </div>
                      <div className="rounded-xl bg-white p-2">
                        <div className="font-bold text-slate-900">{safeNumber(course.stats.total_quizzes)}</div>
                        <div className="text-slate-500">Quizzes</div>
                      </div>
                      <div className="rounded-xl bg-white p-2">
                        <div className="font-bold text-slate-900">{safePercent(course.stats.avg_score, 0, '0%')}</div>
                        <div className="text-slate-500">Avg</div>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="mt-3 w-full justify-between rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700">
                      <Link href={`/courses/${course.id}`}>
                        Ouvrir le module
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">Activité récente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {teacherData.recent_quizzes.length === 0 ? (
                <p className="text-sm text-slate-500">Pas encore d’activité quiz.</p>
              ) : (
                teacherData.recent_quizzes.slice(0, 5).map((quiz) => (
                  <div key={quiz.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3">
                    <div>
                      <p className="font-medium text-slate-900">{quiz.student_name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(quiz.completed_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className="rounded-full bg-red-600 text-white hover:bg-red-600">
                      {safePercent(quiz.score, 0, '0%')}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
