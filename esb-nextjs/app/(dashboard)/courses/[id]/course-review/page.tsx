'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { examBankApi } from '@/lib/api/exam-bank';
import { useCourse } from '@/lib/hooks/useCourses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  ArrowLeft, BookOpen, Users, TrendingUp, Target, Brain,
  FileText, Lightbulb, Award, AlertTriangle, Loader2,
} from 'lucide-react';

const BLOOM_COLORS: Record<string, string> = {
  'Mémoriser': '#6366f1', 'Comprendre': '#8b5cf6', 'Appliquer': '#a78bfa',
  'Analyser': '#c4b5fd', 'Évaluer': '#ddd6fe', 'Créer': '#ede9fe',
  'Remember': '#6366f1', 'Understand': '#8b5cf6', 'Apply': '#a78bfa',
  'Analyze': '#c4b5fd', 'Evaluate': '#ddd6fe', 'Create': '#ede9fe',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  'Facile': '#22c55e', 'Moyen': '#f59e0b', 'Difficile': '#ef4444',
  'Très facile': '#16a34a', 'Très difficile': '#dc2626',
  'Easy': '#22c55e', 'Medium': '#f59e0b', 'Hard': '#ef4444',
};

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6'];

export default function CourseReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const courseId = parseInt(params.id);

  const { data: course } = useCourse(courseId);
  const { data: review, isLoading, error } = useQuery({
    queryKey: ['course-review', courseId],
    queryFn: () => examBankApi.getCourseReview(courseId).then(r => r.data as CourseReviewData),
    enabled: !!courseId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-lg">Génération du rapport Course Review...</span>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
        <h2 className="text-xl font-bold">Rapport indisponible</h2>
        <p className="text-muted-foreground mt-2">
          Aucun examen publié trouvé pour ce cours, ou une erreur s&apos;est produite.
        </p>
        <Button onClick={() => router.back()} className="mt-4 gap-2">
          <ArrowLeft className="h-4 w-4" />Retour
        </Button>
      </div>
    );
  }

  const bloomData = Object.entries(review.bloom_performance).map(([name, value]) => ({ name, value }));
  const difficultyData = Object.entries(review.difficulty_performance).map(([name, value]) => ({ name, value }));
  const cloData = Object.entries(review.clo_performance).map(([name, value]) => ({ name, value }));
  const typeData = Object.entries(review.question_type_performance).map(([name, value]) => ({ name, value }));

  const radarData = bloomData.map(d => ({ subject: d.name, score: d.value, fullMark: 100 }));

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/courses/${courseId}`)} className="gap-1">
              <ArrowLeft className="h-4 w-4" />Retour
            </Button>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-indigo-600" />
            Rapport Course Review
          </h1>
          <p className="text-muted-foreground mt-1">{course?.course?.title || `Cours #${courseId}`}</p>
        </div>
        <Badge variant="secondary" className="text-sm px-4 py-2">
          {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Badge>
      </div>

      {/* Overall KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<FileText className="h-5 w-5 text-blue-600" />} label="Examens" value={review.overall_stats.total_exams} color="blue" />
        <KpiCard icon={<Users className="h-5 w-5 text-emerald-600" />} label="Étudiants uniques" value={review.overall_stats.total_students} color="emerald" />
        <KpiCard icon={<TrendingUp className="h-5 w-5 text-purple-600" />} label="Tentatives totales" value={review.overall_stats.total_sessions} color="purple" />
        <KpiCard icon={<Award className="h-5 w-5 text-amber-600" />} label="Score moyen" value={`${review.overall_stats.overall_avg_score ?? 'N/A'}`} color="amber" />
      </div>

      {/* Exams overview table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Vue d&apos;ensemble des examens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Examen</th>
                  <th className="text-center py-2 font-medium">Statut</th>
                  <th className="text-center py-2 font-medium">Tentatives</th>
                  <th className="text-center py-2 font-medium">Soumises</th>
                  <th className="text-center py-2 font-medium">Score moyen</th>
                  <th className="text-center py-2 font-medium">Taux de réussite</th>
                </tr>
              </thead>
              <tbody>
                {review.exam_summaries.map((ex) => (
                  <tr key={ex.id} className="border-b hover:bg-gray-50">
                    <td className="py-2">
                      <button onClick={() => router.push(`/courses/${courseId}/exam/${ex.id}/dashboard`)}
                        className="text-indigo-600 hover:underline font-medium">{ex.title}</button>
                    </td>
                    <td className="text-center py-2">
                      <Badge className={ex.is_available ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}>
                        {ex.is_available ? 'Publié' : 'Brouillon'}
                      </Badge>
                    </td>
                    <td className="text-center py-2">{ex.total_sessions}</td>
                    <td className="text-center py-2">{ex.submitted_count}</td>
                    <td className="text-center py-2 font-medium">{ex.avg_score ?? '—'}</td>
                    <td className="text-center py-2">
                      {ex.pass_rate != null ? (
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={ex.pass_rate} className="w-20 h-2" />
                          <span className="text-xs">{ex.pass_rate}%</span>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <Tabs defaultValue="bloom">
        <TabsList>
          <TabsTrigger value="bloom"><Brain className="h-4 w-4 mr-1" />Bloom</TabsTrigger>
          <TabsTrigger value="difficulty"><Target className="h-4 w-4 mr-1" />Difficulté</TabsTrigger>
          <TabsTrigger value="clo"><BookOpen className="h-4 w-4 mr-1" />CLO / AA</TabsTrigger>
          <TabsTrigger value="type"><FileText className="h-4 w-4 mr-1" />Type</TabsTrigger>
        </TabsList>

        <TabsContent value="bloom">
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Taux de réussite par niveau de Bloom</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={bloomData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: unknown) => [`${String(v)}%`, 'Réussite']} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {bloomData.map((entry, i) => (
                        <Cell key={i} fill={BLOOM_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Radar — Maîtrise cognitive</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Radar name="Score" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="difficulty">
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Taux de réussite par difficulté</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={difficultyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: unknown) => [`${String(v)}%`, 'Réussite']} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {difficultyData.map((entry, i) => (
                        <Cell key={i} fill={DIFFICULTY_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Distribution par difficulté</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={difficultyData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}%`}>
                      {difficultyData.map((entry, i) => (
                        <Cell key={i} fill={DIFFICULTY_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clo">
          <div className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Performance par Compétence Visée (CLO / AA)</CardTitle></CardHeader>
              <CardContent>
                {cloData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Aucune donnée CLO disponible</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(300, cloData.length * 40)}>
                    <BarChart data={cloData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: unknown) => [`${String(v)}%`, 'Réussite']} />
                      <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]}>
                        {cloData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="type">
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Réussite par type de question</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={typeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: unknown) => [`${String(v)}%`, 'Réussite']} />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Distribution des types</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
                      {typeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* AI Recommendations */}
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Recommandations d&apos;amélioration
          </CardTitle>
          <p className="text-sm text-muted-foreground">Générées par Gemini AI sur la base des performances observées</p>
        </CardHeader>
        <CardContent>
          {review.recommendations.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune recommandation disponible.</p>
          ) : (
            <ul className="space-y-3">
              {review.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
                  <p className="text-sm text-gray-700">{rec}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50', emerald: 'bg-emerald-50', purple: 'bg-purple-50', amber: 'bg-amber-50',
  };
  return (
    <Card className={colorMap[color] || ''}>
      <CardContent className="pt-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm">{icon}</div>
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface CourseReviewData {
  course_id: number;
  exam_summaries: Array<{
    id: number; title: string; is_available: boolean;
    total_sessions: number; submitted_count: number;
    avg_score: number | null; pass_rate: number | null;
  }>;
  overall_stats: {
    total_exams: number; total_sessions: number;
    overall_avg_score: number; total_students: number;
  };
  bloom_performance: Record<string, number>;
  difficulty_performance: Record<string, number>;
  clo_performance: Record<string, number>;
  question_type_performance: Record<string, number>;
  recommendations: string[];
}