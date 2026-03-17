import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChapterSummaryProps {
  summary: string | null;
  canGenerate: boolean;
  onGenerate?: () => void;
  isGenerating?: boolean;
}

export function ChapterSummary({ summary, canGenerate, onGenerate, isGenerating }: ChapterSummaryProps) {
  if (!summary && !canGenerate) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Chapter Summary</CardTitle>
          {canGenerate && !summary && onGenerate && (
            <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
              <Sparkles className="h-4 w-4 mr-2" />
              {isGenerating ? 'Generating...' : 'Generate Summary'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No summary available yet. Upload documents to this chapter and generate a summary.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
