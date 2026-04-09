'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useFeedback, useGenerateFeedback } from '@/lib/hooks/useFeedback';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

interface FeedbackPanelProps {
  examSessionId: number;
}

export default function FeedbackPanel({ examSessionId }: FeedbackPanelProps) {
  const { data: feedback, isLoading, error } = useFeedback(examSessionId);
  const generateMutation = useGenerateFeedback();
  const [showMarkdown, setShowMarkdown] = useState(false);

  const hasFeedback = !!feedback && !error;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">AI Feedback</CardTitle>
            <CardDescription>
              {hasFeedback
                ? `Generated ${feedback.generated_at ? new Date(feedback.generated_at).toLocaleDateString() : ''}`
                : 'Generate personalized feedback for this exam session'}
            </CardDescription>
          </div>
          {!hasFeedback && (
            <Button
              size="sm"
              onClick={() => generateMutation.mutate(examSessionId)}
              disabled={generateMutation.isPending || isLoading}
            >
              {generateMutation.isPending ? 'Generating…' : 'Generate Feedback'}
            </Button>
          )}
          {hasFeedback && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateMutation.mutate(examSessionId)}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? 'Regenerating…' : 'Regenerate'}
            </Button>
          )}
        </div>
      </CardHeader>

      {isLoading && (
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading feedback…</p>
        </CardContent>
      )}

      {generateMutation.isError && (
        <CardContent>
          <p className="text-sm text-destructive">
            {generateMutation.error?.message || 'Failed to generate feedback.'}
          </p>
        </CardContent>
      )}

      {hasFeedback && (
        <CardContent className="space-y-4">
          <Accordion type="multiple" defaultValue={['strengths', 'weaknesses', 'recommendations']}>
            {/* Strengths */}
            <AccordionItem value="strengths">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Strengths
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {feedback.strengths.length} item{feedback.strengths.length !== 1 ? 's' : ''}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5 pl-1">
                  {feedback.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-green-600">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

            {/* Weaknesses */}
            <AccordionItem value="weaknesses">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    Weaknesses
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {feedback.weaknesses.length} item{feedback.weaknesses.length !== 1 ? 's' : ''}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5 pl-1">
                  {feedback.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-red-600">✗</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

            {/* Recommendations */}
            <AccordionItem value="recommendations">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Tips &amp; Resources
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {feedback.recommendations.length} item{feedback.recommendations.length !== 1 ? 's' : ''}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5 pl-1">
                  {feedback.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-blue-600">💡</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Full markdown feedback toggle */}
          {feedback.feedback_text && (
            <div className="pt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowMarkdown((v) => !v)}
              >
                {showMarkdown ? 'Hide' : 'Show'} full analysis
              </Button>
              {showMarkdown && (
                <div className="prose prose-sm dark:prose-invert mt-3 max-w-none rounded-md border p-4">
                  <ReactMarkdown>{feedback.feedback_text}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
