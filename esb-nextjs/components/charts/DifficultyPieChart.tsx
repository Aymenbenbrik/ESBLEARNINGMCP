'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { DifficultyDistributionItem } from '@/lib/types/course';

interface DifficultyPieChartProps {
  data: DifficultyDistributionItem[];
}

// Color palette for difficulty levels (easy=green, medium=yellow, hard=red)
const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#22c55e', // green-500
  medium: '#eab308', // yellow-500
  hard: '#ef4444', // red-500
};

const getDifficultyColor = (difficulty: string | undefined | null): string => {
  if (!difficulty) return '#6b7280';
  return DIFFICULTY_COLORS[difficulty.toLowerCase()] || '#6b7280'; // gray-500 as fallback
};

export function DifficultyPieChart({ data }: DifficultyPieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center text-muted-foreground">
        No difficulty distribution data available
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.count, 0);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = ((data.count / total) * 100).toFixed(1);
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium capitalize mb-1">{data.difficulty}</p>
          <p className="text-sm text-muted-foreground">
            Questions: <span className="font-medium text-foreground">{data.count}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Percentage: <span className="font-medium text-foreground">{percentage}%</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Avg Score: <span className="font-medium text-foreground">{data.avg_score != null ? data.avg_score.toFixed(1) : '—'}%</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom label component showing percentage
  const renderLabel = (entry: any) => {
    const percentage = ((entry.count / total) * 100).toFixed(0);
    return `${percentage}%`;
  };

  // Custom legend formatter
  const renderLegend = (value: string, entry: any) => {
    const percentage = ((entry.payload.count / total) * 100).toFixed(1);
    return `${value.charAt(0).toUpperCase() + value.slice(1)} (${percentage}%)`;
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderLabel}
          outerRadius={100}
          innerRadius={60}
          fill="#8884d8"
          dataKey="count"
          nameKey="difficulty"
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getDifficultyColor(entry.difficulty)}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={renderLegend}
          wrapperStyle={{ paddingTop: '20px' }}
        />
        {/* Center label showing total */}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground font-semibold text-2xl"
        >
          {total}
        </text>
        <text
          x="50%"
          y="50%"
          dy={20}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-muted-foreground text-xs"
        >
          Total
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}
