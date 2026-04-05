'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { AADistributionItem } from '@/lib/types/course';

interface AAAPieChartProps {
  data: AADistributionItem[];
}

// Auto-generated color palette for AA codes
const COLORS = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#eab308', // yellow-500
  '#f97316', // orange-500
  '#ef4444', // red-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#f59e0b', // amber-500
];

const getColor = (index: number): string => {
  return COLORS[index % COLORS.length];
};

export function AAAPieChart({ data }: AAAPieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center text-muted-foreground">
        No AA distribution data available
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
          <p className="font-medium mb-1">AA: {data.aaa_code}</p>
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
    const percentage = (entry.count / total) * 100;
    return percentage >= 5 ? `${percentage.toFixed(0)}%` : ''; // Only show label if >= 5%
  };

  // Custom legend formatter
  const renderLegend = (value: string, entry: any) => {
    const percentage = ((entry.payload.count / total) * 100).toFixed(1);
    return `${value} (${percentage}%)`;
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
          nameKey="aaa_code"
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getColor(index)}
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
