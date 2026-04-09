'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import type { AAPEvaluationResponse } from '@/lib/types/evaluation';

function scoreColor(score: number | null): string {
  if (score === null || score === undefined) return 'text-gray-500';
  if (score < 50) return 'text-white';
  if (score < 80) return 'text-gray-900';
  return 'text-white';
}

function scoreBg(score: number | null): string {
  if (score === null || score === undefined) return '#e5e7eb';
  if (score < 50) return '#ef4444';
  if (score < 80) return '#60a5fa'; // blue for AAP (50–79)
  return '#2563eb'; // darker blue for ≥80
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface AAPHeatmapProps {
  data: AAPEvaluationResponse;
}

export function AAPHeatmap({ data }: AAPHeatmapProps) {
  const { aaps, students } = data;

  const columnAverages = useMemo(() => {
    return aaps.map((_, colIdx) => avg(students.map((s) => s.scores[colIdx])));
  }, [aaps, students]);

  const studentAverages = useMemo(() => {
    return students.map((s) => avg(s.scores));
  }, [students]);

  if (aaps.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          Aucun acquis d&apos;apprentissage de programme (AAP) défini.
        </CardContent>
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          Aucun étudiant ou aucun score AAP calculé.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Matrice d&apos;évaluation par AAP
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {students.length} étudiant{students.length > 1 ? 's' : ''} × {aaps.length} AAP
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-bolt-line">
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-muted-foreground min-w-[140px]">
                  Étudiant
                </th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground min-w-[100px]">
                  Classe
                </th>
                {aaps.map((aap) => (
                  <th
                    key={aap.id}
                    className="px-2 py-2 text-center font-medium text-muted-foreground min-w-[64px]"
                    title={aap.description}
                  >
                    {aap.code}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold text-muted-foreground min-w-[64px] bg-gray-50 border-l border-bolt-line">
                  Moy.
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, rowIdx) => (
                <tr key={student.id} className="border-b border-bolt-line/50 hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium truncate max-w-[180px]" title={student.email}>
                    {student.username}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[120px]">
                    {student.class_name || '—'}
                  </td>
                  {student.scores.map((score, colIdx) => (
                    <td key={colIdx} className="px-1 py-1 text-center">
                      <div
                        className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-medium min-w-[40px] ${scoreColor(score)}`}
                        title={`${student.username} — ${aaps[colIdx]?.code}: ${score !== null && score !== undefined ? `${score.toFixed(1)}%` : 'N/A'}`}
                        style={{ backgroundColor: scoreBg(score) }}
                      >
                        {score !== null && score !== undefined ? score.toFixed(1) : '—'}
                      </div>
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center bg-gray-50 border-l border-bolt-line">
                    <span className="font-semibold text-[11px]">
                      {studentAverages[rowIdx] !== null
                        ? `${studentAverages[rowIdx]!.toFixed(1)}%`
                        : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-bolt-line bg-gray-50">
                <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-semibold text-muted-foreground">
                  Moyenne
                </td>
                <td className="px-2 py-2" />
                {columnAverages.map((colAvg, i) => (
                  <td key={i} className="px-1 py-2 text-center">
                    <span className="font-semibold text-[11px]">
                      {colAvg !== null ? `${colAvg.toFixed(1)}%` : '—'}
                    </span>
                  </td>
                ))}
                <td className="px-1 py-2 text-center border-l border-bolt-line">
                  <span className="font-bold text-[11px]">
                    {(() => {
                      const overallAvg = avg(columnAverages);
                      return overallAvg !== null ? `${overallAvg.toFixed(1)}%` : '—';
                    })()}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-3 text-[11px] text-muted-foreground border-t border-bolt-line">
          <span className="font-medium">Légende :</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} /> &lt;50%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#60a5fa' }} /> 50–79%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#2563eb' }} /> ≥80%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#e5e7eb' }} /> N/A
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
