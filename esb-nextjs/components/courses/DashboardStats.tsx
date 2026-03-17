import { Card, CardContent } from '@/components/ui/card';
import { CourseDashboardStats } from '@/lib/types/course';
import { Users, FileText, HelpCircle, Award, TrendingUp } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { safeNumber, safePercent } from '@/lib/format';

interface DashboardStatsProps {
  stats: CourseDashboardStats;
}

interface StatCardProps {
  label: string;
  value: string | number;
  subText?: string;
  icon: LucideIcon;
}

function StatCard({ label, value, subText, icon: Icon }: StatCardProps) {
  return (
    <Card className="rounded-[24px] border-bolt-line bg-white shadow-sm transition-transform hover:-translate-y-0.5">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          {subText ? <p className="text-xs text-slate-500">{subText}</p> : null}
        </div>
        <div className="rounded-2xl bg-bolt-accent/10 p-3 text-bolt-accent">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const items = [
    { label: 'Total Students', value: safeNumber(stats?.total_students), icon: Users },
    { label: 'Total Quizzes', value: safeNumber(stats?.total_quizzes), icon: FileText },
    { label: 'Total Questions', value: safeNumber(stats?.total_questions), icon: HelpCircle },
    { label: 'Average Score', value: safePercent(stats?.avg_score), subText: 'Across all quizzes', icon: Award },
  ];

  if (stats?.completion_rate !== undefined) {
    items.push({ label: 'Completion Rate', value: safePercent(stats.completion_rate), subText: 'Students completing quizzes', icon: TrendingUp });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <StatCard key={item.label} {...item} />
      ))}
    </div>
  );
}
