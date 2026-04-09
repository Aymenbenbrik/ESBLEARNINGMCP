'use client';

import Link from 'next/link';
import { useCoachAnalysis } from '@/lib/hooks/useCoach';
import { Recommendation, SkillGap } from '@/lib/api/coach';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CourseProgressBar } from '@/components/courses/CourseProgressBar';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Brain,
  Calendar,
  Clock,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';

const priorityConfig = {
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 border-red-200', icon: Zap },
  important: { label: 'Important', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: AlertTriangle },
  optional: { label: 'Optionnel', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: BookOpen },
};

const typeConfig = {
  quiz: { label: 'Quiz', icon: '📝' },
  revision: { label: 'Révision', icon: '📖' },
  exercise: { label: 'Exercice', icon: '✏️' },
  practice: { label: 'Pratique', icon: '💻' },
};

const severityConfig = {
  high: { label: 'Critique', color: 'text-red-600 bg-red-50 border-red-200' },
  medium: { label: 'Modéré', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  low: { label: 'Léger', color: 'text-blue-600 bg-blue-50 border-blue-200' },
};

export default function RecommendationsPage() {
  const { data, isLoading } = useCoachAnalysis();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        <p className="text-sm text-muted-foreground">
          L&apos;IA analyse vos performances...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Impossible de charger l&apos;analyse.</p>
      </div>
    );
  }

  const { performance, skill_gaps, recommendations, study_plan } = data;

  // Group recommendations by priority
  const grouped = {
    urgent: recommendations.filter((r) => r.priority === 'urgent'),
    important: recommendations.filter((r) => r.priority === 'important'),
    optional: recommendations.filter((r) => r.priority === 'optional'),
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/student-dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-red-600" />
            Coach IA — Recommandations
          </h1>
          <p className="text-sm text-muted-foreground">
            Analyse personnalisée et exercices de renforcement
          </p>
        </div>
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold text-slate-900">{performance.overall_avg.toFixed(0)}%</p>
            <p className="text-sm text-muted-foreground mt-1">Moyenne globale</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold text-slate-900">{performance.total_quizzes}</p>
            <p className="text-sm text-muted-foreground mt-1">Quiz complétés</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold text-slate-900">{skill_gaps.length}</p>
            <p className="text-sm text-muted-foreground mt-1">Lacunes identifiées</p>
          </CardContent>
        </Card>
      </div>

      {/* Skill Gaps */}
      {skill_gaps.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-red-600" />
              Lacunes identifiées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {skill_gaps.map((gap, i) => {
                const cfg = severityConfig[gap.severity] || severityConfig.medium;
                return (
                  <div key={i} className={`rounded-xl border p-4 ${cfg.color}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{gap.area}</p>
                        <p className="text-sm mt-1">{gap.description}</p>
                        <p className="text-xs mt-1 opacity-75">Module : {gap.course_title}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                        <p className="text-2xl font-bold mt-1">{gap.score.toFixed(0)}%</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations by Priority */}
      {(['urgent', 'important', 'optional'] as const).map((priority) => {
        const items = grouped[priority];
        if (items.length === 0) return null;
        const cfg = priorityConfig[priority];
        const PriorityIcon = cfg.icon;

        return (
          <Card key={priority} className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PriorityIcon className="h-5 w-5" />
                {cfg.label} ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((rec, i) => {
                  const tCfg = typeConfig[rec.type] || typeConfig.exercise;
                  return (
                    <div key={i} className={`rounded-xl border p-4 ${cfg.color}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{tCfg.icon}</span>
                        <div className="flex-1">
                          <p className="font-semibold">{rec.title}</p>
                          <p className="text-sm mt-1">{rec.description}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                            <Badge variant="outline" className="text-xs">
                              {rec.course_title}
                            </Badge>
                            {rec.target_bloom && (
                              <Badge variant="outline" className="text-xs">
                                <Brain className="h-3 w-3 mr-1" />
                                {rec.target_bloom}
                              </Badge>
                            )}
                            {rec.estimated_duration_min > 0 && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {rec.estimated_duration_min} min
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Study Plan */}
      {study_plan?.activities?.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              Plan d&apos;étude proposé
            </CardTitle>
            {study_plan.summary && (
              <p className="text-sm text-muted-foreground">{study_plan.summary}</p>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {study_plan.activities.map((act, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700 font-bold text-sm">
                    J+{act.day_offset}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{act.title}</p>
                    <p className="text-xs text-muted-foreground">{act.description}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <p>{act.course_title}</p>
                    <p>{act.duration_min} min</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
