import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BloomBarChart } from '@/components/charts/BloomBarChart';
import { DifficultyPieChart } from '@/components/charts/DifficultyPieChart';
import { AAAPieChart } from '@/components/charts/AAAPieChart';
import {
  BloomDistributionItem,
  DifficultyDistributionItem,
  AADistributionItem,
} from '@/lib/types/course';

interface DashboardChartsProps {
  bloom_distribution: BloomDistributionItem[];
  difficulty_distribution: DifficultyDistributionItem[];
  aaa_distribution?: AADistributionItem[];
}

export function DashboardCharts({
  bloom_distribution,
  difficulty_distribution,
  aaa_distribution,
}: DashboardChartsProps) {
  const hasData =
    bloom_distribution.length > 0 ||
    difficulty_distribution.length > 0 ||
    (aaa_distribution && aaa_distribution.length > 0);

  if (!hasData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">
              No analytics data available yet.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Data will appear once students start completing quizzes.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Bloom Distribution */}
      {bloom_distribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bloom&apos;s Taxonomy Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">
              Question distribution across cognitive levels
            </p>
          </CardHeader>
          <CardContent>
            <BloomBarChart data={bloom_distribution} />
          </CardContent>
        </Card>
      )}

      {/* Difficulty Distribution */}
      {difficulty_distribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Difficulty Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">
              Question difficulty breakdown
            </p>
          </CardHeader>
          <CardContent>
            <DifficultyPieChart data={difficulty_distribution} />
          </CardContent>
        </Card>
      )}

      {/* AAA Distribution (optional) */}
      {aaa_distribution && aaa_distribution.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>AA Code Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">
              Question distribution by AA classification
            </p>
          </CardHeader>
          <CardContent>
            <AAAPieChart data={aaa_distribution} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
