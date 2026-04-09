'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Target } from 'lucide-react';
import type { AAEvaluationResponse } from '@/lib/types/evaluation';

const ACHIEVEMENT_THRESHOLD = 50; // student achieves an AA if score ≥ 50%

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface AAStatsProps {
  data: AAEvaluationResponse;
}

export function AAStats({ data }: AAStatsProps) {
  const { aas, students } = data;

  const stats = useMemo(() => {
    if (aas.length === 0 || students.length === 0) return null;

    const perAA = aas.map((aa, colIdx) => {
      const scores = students.map((s) => s.scores[colIdx]);
      const validScores = scores.filter((v): v is number => v !== null && v !== undefined);
      const average = avg(scores);
      const achievedCount = validScores.filter((s) => s >= ACHIEVEMENT_THRESHOLD).length;
      const achievementRate = validScores.length > 0 ? (achievedCount / validScores.length) * 100 : 0;
      const atRisk = achievementRate < 50;

      return {
        aa,
        average,
        achievementRate,
        achievedCount,
        totalWithScores: validScores.length,
        atRisk,
      };
    });

    const overallAchievementRates = perAA.map((p) => p.achievementRate);
    const overallRate = overallAchievementRates.length > 0
      ? overallAchievementRates.reduce((a, b) => a + b, 0) / overallAchievementRates.length
      : 0;

    const atRiskAAs = perAA.filter((p) => p.atRisk);

    return { perAA, overallRate, atRiskAAs };
  }, [aas, students]);

  if (!stats) {
    return null;
  }

  const maxAvg = Math.max(...stats.perAA.map((p) => p.average ?? 0), 1);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Average score per AA — horizontal bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            Score moyen par AA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.perAA.map((p) => {
            const pct = p.average !== null ? (p.average / 100) * 100 : 0;
            return (
              <div key={p.aa.id} className="flex items-center gap-2">
                <span className="text-xs font-medium w-10 shrink-0">AA{p.aa.number}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor:
                        p.average === null ? '#e5e7eb' : p.average < 50 ? '#ef4444' : p.average < 80 ? '#f59e0b' : '#22c55e',
                    }}
                  />
                </div>
                <span className="text-xs font-semibold w-14 text-right">
                  {p.average !== null ? `${p.average.toFixed(1)}%` : 'N/A'}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Achievement rates & at-risk AAs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" />
            Taux de réussite par AA
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            % d&apos;étudiants atteignant ≥{ACHIEVEMENT_THRESHOLD}% par AA
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overall rate */}
          <div className="flex items-center justify-between rounded-lg border border-bolt-line p-3">
            <span className="text-sm font-medium">Taux global de réussite</span>
            <span
              className={`text-lg font-bold ${
                stats.overallRate >= 80 ? 'text-green-600' : stats.overallRate >= 50 ? 'text-yellow-600' : 'text-red-600'
              }`}
            >
              {stats.overallRate.toFixed(1)}%
            </span>
          </div>

          {/* Per-AA achievement */}
          <div className="space-y-1.5">
            {stats.perAA.map((p) => (
              <div key={p.aa.id} className="flex items-center justify-between text-xs">
                <span className="font-medium" title={p.aa.description}>
                  AA{p.aa.number}
                </span>
                <span>
                  {p.achievedCount}/{p.totalWithScores} étudiants ({p.achievementRate.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>

          {/* At-risk badges */}
          {stats.atRiskAAs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-600">
                ⚠ AA à risque ({stats.atRiskAAs.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stats.atRiskAAs.map((p) => (
                  <Badge
                    key={p.aa.id}
                    variant="destructive"
                    className="text-xs"
                    title={`${p.aa.description} — ${p.achievementRate.toFixed(0)}% de réussite`}
                  >
                    AA{p.aa.number} — {p.achievementRate.toFixed(0)}%
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
