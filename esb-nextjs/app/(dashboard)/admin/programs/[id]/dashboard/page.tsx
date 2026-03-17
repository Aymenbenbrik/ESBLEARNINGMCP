'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useProgramDashboard } from '@/lib/hooks/useDashboards';
import { DashboardStats } from '@/components/courses/DashboardStats';
import { DashboardCharts } from '@/components/courses/DashboardCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function ProgramDashboardPage() {
  const params = useParams();
  const programId = Number(params?.id);

  const { data, isLoading, error } = useProgramDashboard(programId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Program Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unable to load program dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/programs/${programId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{data.program.name}</h1>
            <p className="text-muted-foreground">Program (formation) dashboard</p>
          </div>
        </div>
      </div>

      <DashboardStats stats={data.stats} />

      <DashboardCharts
        bloom_distribution={data.bloom_distribution}
        difficulty_distribution={data.difficulty_distribution}
        aaa_distribution={data.aaa_distribution}
      />

      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Classes</p>
              <p className="text-2xl font-bold">{data.program.classes_count}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Modules</p>
              <p className="text-2xl font-bold">{data.program.courses_count}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
