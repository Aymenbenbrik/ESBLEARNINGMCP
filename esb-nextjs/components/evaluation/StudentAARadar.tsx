'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';
import { StudentAAScore } from '@/lib/types/evaluation';

interface StudentAARadarProps {
  scores: StudentAAScore[];
  courseName?: string;
}

export function StudentAARadar({ scores, courseName }: StudentAARadarProps) {
  if (!scores || scores.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-5 w-5 text-green-600" />
            Évaluation par Acquis d&apos;Apprentissage
          </CardTitle>
          {courseName && (
            <p className="text-sm text-muted-foreground">{courseName}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Aucune évaluation disponible
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = scores.map((s) => ({
    aa: s.aa_code || `AA${s.aa_id}`,
    score: Math.round(s.score * 100) / 100,
    fullMark: 100,
    description: s.aa_description || 'Acquis d\'apprentissage',
  }));

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-5 w-5 text-green-600" />
          Évaluation par Acquis d&apos;Apprentissage
        </CardTitle>
        {courseName && (
          <p className="text-sm text-muted-foreground">{courseName}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="w-full h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis
                dataKey="aa"
                tick={{ fontSize: 12, fill: '#64748b' }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickCount={5}
              />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-white border rounded-lg shadow-md p-3 max-w-[240px]">
                      <p className="font-semibold text-sm">{item.aa}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {item.description}
                      </p>
                      <p className="text-sm font-bold text-green-600 mt-1">
                        {item.score}%
                      </p>
                    </div>
                  );
                }}
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
