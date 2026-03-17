'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';

interface ChapterSummaryProps {
  summary: string | null;
  canGenerate: boolean;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  isGenerating?: boolean;
}

export function ChapterSummary({
  summary,
  canGenerate,
  onGenerate,
  onRegenerate,
  isGenerating,
}: ChapterSummaryProps) {
  if (!summary && !canGenerate) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Résumé du chapitre</CardTitle>
          <div className="flex gap-2">
            {canGenerate && !summary && onGenerate && (
              <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
                <Sparkles className="h-4 w-4 mr-2" />
                {isGenerating ? 'Génération…' : 'Générer le résumé'}
              </Button>
            )}
            {canGenerate && summary && onRegenerate && (
              <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isGenerating}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                {isGenerating ? 'Régénération…' : 'Régénérer'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
              {summary}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun résumé disponible. Uploadez des documents puis générez le résumé.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

