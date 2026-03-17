import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TNAADistribution } from '@/lib/types/course';

type Props = {
  aa: TNAADistribution[];
};

export function TNNormsDistributionCard({ aa }: Props) {
  if (!aa || aa.length === 0) return null;

  const ranked = [...aa].sort((a, b) => b.percent - a.percent);

  return (
    <Card className="rounded-[24px] border-bolt-line shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>AAA mapping</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Vue compacte des AAA les plus présents dans le syllabus TN.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            {aa.length} AAA
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ranked.map((item) => (
          <div key={item.label} className="rounded-2xl border border-bolt-line bg-muted/20 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
              </div>
              <span className="text-lg font-bold text-bolt-accent">{item.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bolt-accent/10">
              <div className="h-full rounded-full bg-bolt-accent" style={{ width: `${Math.max(item.percent, 6)}%` }} />
            </div>
            <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
              <span>{item.sections_count} sections</span>
              <span>•</span>
              <span>{item.chapters_count} chapitres</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
