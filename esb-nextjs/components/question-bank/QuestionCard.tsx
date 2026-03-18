'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { QuestionBankQuestion } from '@/lib/types/question-bank';
import { useAuth } from '@/lib/hooks/useAuth';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionCardProps {
  question: QuestionBankQuestion;
  isSelected?: boolean;
  onSelect?: (id: number, selected: boolean) => void;
  showSelection?: boolean;
}

export function QuestionCard({
  question,
  isSelected = false,
  onSelect,
  showSelection = false,
}: QuestionCardProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);

  const isTeacher = user?.is_teacher || user?.is_superuser;
  const isLongQuestion = question.question_text.length > 200;

  // Determine badge colors
  const getBloomColor = (level: string) => {
    const colors: Record<string, string> = {
      remember: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
      understand: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      apply: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
      analyze: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
      evaluate: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
      create: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    };
    return colors[level.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const getDifficultyColor = (level: string) => {
    const colors: Record<string, string> = {
      easy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
      hard: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    };
    return colors[level.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Card className={cn('transition-colors', isSelected && 'ring-2 ring-primary')}>
      <CardContent className="p-4 space-y-3">
        {/* Header: Metadata and Selection */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2 flex-1">
            {/* Question Type */}
            <Badge variant="outline">
              {question.question_type === 'mcq' ? 'Multiple Choice' : 'Open-Ended'}
            </Badge>

            {/* Bloom Level */}
            <Badge className={getBloomColor(question.bloom_level)}>
              {question.bloom_level}
            </Badge>

            {/* Difficulty */}
            <Badge className={getDifficultyColor(question.difficulty)}>
              {question.difficulty}
            </Badge>

            {/* TN Norms: display AAA codes (never show CLO for TN usage) */}
            <Badge variant="secondary">
              {(question.clo || '').replace(/^CLO/i, 'AA')}
            </Badge>

            {/* Chapter */}
            {question.chapter_title && (
              <Badge variant="outline" className="text-muted-foreground">
                {question.chapter_title}
              </Badge>
            )}

            {/* Approval Status (Teachers only) */}
            {isTeacher && (
              <Badge
                className={
                  question.is_approved
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100'
                }
              >
                {question.is_approved ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Approved
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Pending
                  </>
                )}
              </Badge>
            )}
          </div>

          {/* Selection Checkbox */}
          {showSelection && onSelect && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(question.id, checked as boolean)}
              aria-label="Select question"
            />
          )}
        </div>

        {/* Question Text */}
        <div className="space-y-2">
          <p
            className={cn(
              'text-sm leading-relaxed',
              !isExpanded && isLongQuestion && 'line-clamp-3'
            )}
          >
            {question.question_text}
          </p>

          {/* Expand/Collapse for long questions */}
          {isLongQuestion && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show more
                </>
              )}
            </Button>
          )}
        </div>

        {/* MCQ Choices */}
        {question.question_type === 'mcq' && (
          <div className="space-y-1.5 pl-4 border-l-2">
            {['A', 'B', 'C'].map((choice) => {
              const choiceText =
                question[`choice_${choice.toLowerCase()}` as keyof QuestionBankQuestion];
              const isCorrect =
                isTeacher && question.correct_choice?.toUpperCase() === choice;

              return (
                <div
                  key={choice}
                  className={cn(
                    'text-sm p-2 rounded',
                    isCorrect && 'bg-green-50 dark:bg-green-950 font-medium'
                  )}
                >
                  <span className="font-semibold mr-2">{choice}.</span>
                  <span>{choiceText || 'N/A'}</span>
                  {isCorrect && (
                    <Badge
                      variant="outline"
                      className="ml-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                    >
                      Correct
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Approval Date (Teachers only, if approved) */}
        {isTeacher && question.is_approved && question.approved_at && (
          <p className="text-xs text-muted-foreground">
            Approved on {new Date(question.approved_at).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
