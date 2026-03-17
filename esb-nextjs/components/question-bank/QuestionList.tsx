'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { QuestionCard } from './QuestionCard';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { QuestionBankQuestion } from '@/lib/types/question-bank';
import { useAuth } from '@/lib/hooks/useAuth';
import { ChevronLeft, ChevronRight, FileQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionListProps {
  questions: QuestionBankQuestion[];
  total: number;
  totalUnfiltered?: number; // Total questions without filters
  limit: number;
  offset: number;
  isLoading?: boolean;
  onPageChange?: (offset: number) => void;
  showSelection?: boolean;
  selectedQuestions?: number[];
  onSelectionChange?: (selectedIds: number[]) => void;
  courseId?: number;
  onMigrate?: () => void;
  isMigrating?: boolean;
  migrationResult?: {
    migrated: number;
    skipped: number;
    errors: number;
  } | null;
}

export function QuestionList({
  questions,
  total,
  totalUnfiltered,
  limit,
  offset,
  isLoading = false,
  onPageChange,
  showSelection = false,
  selectedQuestions = [],
  onSelectionChange,
  courseId,
  onMigrate,
  isMigrating = false,
  migrationResult,
}: QuestionListProps) {
  const { user } = useAuth();
  const [localSelected, setLocalSelected] = useState<number[]>(selectedQuestions);

  // Sync local state with prop changes
  useEffect(() => {
    setLocalSelected(selectedQuestions);
  }, [selectedQuestions]);

  const isTeacher = user?.is_teacher || user?.is_superuser;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  // Handle individual question selection
  const handleQuestionSelect = (id: number, selected: boolean) => {
    const newSelected = selected
      ? [...localSelected, id]
      : localSelected.filter((qId) => qId !== id);

    setLocalSelected(newSelected);
    onSelectionChange?.(newSelected);
  };

  // Handle "select all on page" toggle
  const handleSelectAllOnPage = (checked: boolean) => {
    if (checked) {
      // Add all question IDs from current page
      const pageQuestionIds = questions.map((q) => q.id);
      const newSelected = Array.from(new Set([...localSelected, ...pageQuestionIds]));
      setLocalSelected(newSelected);
      onSelectionChange?.(newSelected);
    } else {
      // Remove all question IDs from current page
      const pageQuestionIds = questions.map((q) => q.id);
      const newSelected = localSelected.filter((id) => !pageQuestionIds.includes(id));
      setLocalSelected(newSelected);
      onSelectionChange?.(newSelected);
    }
  };

  // Check if all questions on current page are selected
  const allOnPageSelected =
    questions.length > 0 && questions.every((q) => localSelected.includes(q.id));

  const someOnPageSelected =
    questions.some((q) => localSelected.includes(q.id)) && !allOnPageSelected;

  // Pagination handlers
  const handlePreviousPage = () => {
    if (offset > 0) {
      onPageChange?.(Math.max(0, offset - limit));
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      onPageChange?.(offset + limit);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-16" />
              </div>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Empty state
  if (questions.length === 0) {
    // Check if questions exist but are filtered out
    const hasUnfilteredQuestions = totalUnfiltered && totalUnfiltered > 0;
    const areFiltersActive = total === 0 && hasUnfilteredQuestions;

    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-12">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <FileQuestion className="h-16 w-16 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">
                  {areFiltersActive ? 'No Questions Match Your Filters' : 'No Questions Found'}
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {!courseId
                    ? "Select a course from the filters to view questions."
                    : areFiltersActive
                    ? `${totalUnfiltered} questions exist for this course, but none match your current filters. Try adjusting or clearing the filters.`
                    : "Your question bank is empty. Generate and approve quizzes to populate the question bank."}
                </p>
              </div>
              {courseId && isTeacher && !areFiltersActive && (
                <div className="flex gap-4 justify-center flex-wrap">
                  <Button asChild>
                    <Link href={`/courses/${courseId}/quiz/generate`}>
                      Generate New Quiz
                    </Link>
                  </Button>
                  {onMigrate && (
                    <Button
                      variant="outline"
                      onClick={onMigrate}
                      disabled={isMigrating}
                    >
                      {isMigrating ? 'Migrating...' : 'Import Existing Quiz Questions'}
                    </Button>
                  )}
                </div>
              )}
              {courseId && areFiltersActive && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Clear filters by reloading with only course_id
                      window.location.href = `/question-bank?course_id=${courseId}`;
                    }}
                  >
                    Clear All Filters
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {migrationResult && (
          <Alert>
            <AlertTitle>Migration Complete</AlertTitle>
            <AlertDescription className="space-y-1">
              <div>✅ Migrated: {migrationResult.migrated} questions</div>
              <div>⏭️ Skipped (duplicates): {migrationResult.skipped}</div>
              {migrationResult.errors > 0 && (
                <div>❌ Errors: {migrationResult.errors}</div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk Selection Header (Teachers only) */}
      {showSelection && isTeacher && (
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allOnPageSelected}
              onCheckedChange={handleSelectAllOnPage}
              aria-label="Select all on page"
              className={cn(someOnPageSelected && 'data-[state=checked]:bg-orange-500')}
            />
            <span className="text-sm font-medium">
              {localSelected.length > 0
                ? `${localSelected.length} question${localSelected.length !== 1 ? 's' : ''} selected`
                : 'Select all on page'}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + limit, total)} of {total} questions
          </span>
        </div>
      )}

      {/* Question Cards */}
      <div className="space-y-3">
        {questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            isSelected={localSelected.includes(question.id)}
            onSelect={handleQuestionSelect}
            showSelection={showSelection && isTeacher}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={offset === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={offset + limit >= total}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
