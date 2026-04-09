'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface CourseProgressBarProps {
  progress: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function CourseProgressBar({
  progress,
  showLabel = true,
  size = 'sm',
  className,
}: CourseProgressBarProps) {
  const pct = Math.min(Math.max(progress, 0), 100);

  const colorClass =
    pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : pct > 0 ? 'bg-orange-500' : 'bg-slate-300';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('relative flex-1', size === 'sm' ? 'h-2' : 'h-3')}>
        <div className="absolute inset-0 rounded-full bg-slate-100" />
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-500', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn('shrink-0 font-medium tabular-nums', size === 'sm' ? 'text-xs text-slate-500' : 'text-sm text-slate-700')}>
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
