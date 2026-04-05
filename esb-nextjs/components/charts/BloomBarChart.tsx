'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BloomDistributionItem } from '@/lib/types/course';

interface BloomBarChartProps {
  data: BloomDistributionItem[];
}

// Color palette for Bloom levels (6 levels: Remember, Understand, Apply, Analyze, Evaluate, Create)
const BLOOM_COLORS = [
  '#3b82f6', // blue-500 - Remember
  '#22c55e', // green-500 - Understand
  '#eab308', // yellow-500 - Apply
  '#f97316', // orange-500 - Analyze
  '#ef4444', // red-500 - Evaluate
  '#a855f7', // purple-500 - Create
];

const getBloomColor = (level: string | undefined | null): string => {
  if (!level) return BLOOM_COLORS[0];
  const bloomLevels = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
  const index = bloomLevels.indexOf(level.toLowerCase());
  return index !== -1 ? BLOOM_COLORS[index] : BLOOM_COLORS[0];
};

export function BloomBarChart({ data }: BloomBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center text-muted-foreground">
        No Bloom distribution data available
      </div>
    );
  }

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium capitalize mb-1">{data.bloom_level}</p>
          <p className="text-sm text-muted-foreground">
            Questions: <span className="font-medium text-foreground">{data.count}</span>
          </p>
          <p className="text-sm text-muted-foreground">
          Avg Score: <span className="font-medium text-foreground">{data.avg_score != null ? data.avg_score.toFixed(1) : '—'}%</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="bloom_level"
          angle={-45}
          textAnchor="end"
          height={80}
          className="text-xs"
          tickFormatter={(value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : ''}
        />
        <YAxis
          label={{ value: 'Number of Questions', angle: -90, position: 'insideLeft' }}
          className="text-xs"
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          formatter={() => 'Question Count'}
        />
        <Bar dataKey="count" name="Question Count" radius={[8, 8, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBloomColor(entry.bloom_level)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
