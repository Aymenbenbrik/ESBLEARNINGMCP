'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertTriangle, Target } from 'lucide-react';
import { StudentAAScore } from '@/lib/types/evaluation';

interface AAProgressListProps {
  scores: StudentAAScore[];
}

function getStatusInfo(score: number) {
  if (score >= 80) {
    return {
      label: 'Maîtrisé',
      color: 'text-green-700 bg-green-100 border-green-200',
      progressColor: '[&_[data-slot=progress-indicator]]:bg-green-500',
    };
  }
  if (score >= 50) {
    return {
      label: 'En cours',
      color: 'text-yellow-700 bg-yellow-100 border-yellow-200',
      progressColor: '[&_[data-slot=progress-indicator]]:bg-yellow-500',
    };
  }
  return {
    label: 'À renforcer',
    color: 'text-red-700 bg-red-100 border-red-200',
    progressColor: '[&_[data-slot=progress-indicator]]:bg-red-500',
  };
}

export function AAProgressList({ scores }: AAProgressListProps) {
  if (!scores || scores.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-5 w-5" />
            Détail des Acquis d&apos;Apprentissage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Aucune évaluation disponible
          </div>
        </CardContent>
      </Card>
    );
  }

  const weakAAs = scores.filter((s) => s.score < 50);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-5 w-5" />
          Détail des Acquis d&apos;Apprentissage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {scores.map((s) => {
          const status = getStatusInfo(s.score);
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="shrink-0 w-16 font-mono text-sm font-semibold text-slate-700">
                {s.aa_code || `AA${s.aa_id}`}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground truncate">
                  {s.aa_description || '—'}
                </p>
                <Progress
                  value={Math.min(s.score, 100)}
                  className={`mt-1.5 h-2 ${status.progressColor}`}
                />
              </div>
              <div className="shrink-0 w-14 text-right font-semibold text-sm">
                {Math.round(s.score)}%
              </div>
              <Badge
                variant="outline"
                className={`shrink-0 text-xs ${status.color}`}
              >
                {status.label}
              </Badge>
            </div>
          );
        })}

        {weakAAs.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h4 className="text-sm font-semibold text-red-800">
                Lacunes identifiées
              </h4>
            </div>
            <ul className="space-y-1">
              {weakAAs.map((s) => (
                <li key={s.id} className="text-sm text-red-700 flex items-start gap-2">
                  <span className="font-mono font-semibold shrink-0">
                    {s.aa_code || `AA${s.aa_id}`}
                  </span>
                  <span className="truncate">
                    {s.aa_description || '—'} ({Math.round(s.score)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {weakAAs.length === 0 && scores.length > 0 && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm font-medium text-green-800">
                Tous les acquis sont en bonne voie !
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
