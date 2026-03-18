'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MultiSelect, MultiSelectOption } from '@/components/shared/MultiSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useRevisionOptions, useCreateRevisionQuiz } from '@/lib/hooks/useQuestionBank';
import { RevisionQuizFilters } from '@/lib/types/question-bank';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const BLOOM_LEVELS: MultiSelectOption[] = [
  { value: 'remember', label: 'Remember' },
  { value: 'understand', label: 'Understand' },
  { value: 'apply', label: 'Apply' },
  { value: 'analyze', label: 'Analyze' },
  { value: 'evaluate', label: 'Evaluate' },
  { value: 'create', label: 'Create' },
];

const DIFFICULTY_LEVELS: MultiSelectOption[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export default function RevisionQuizSetupPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.courseId as string, 10);

  // Fetch revision options
  const { data, isLoading, error } = useRevisionOptions(courseId);

  // Create revision quiz mutation
  const createRevisionQuiz = useCreateRevisionQuiz();

  // Form state
  const [numQuestions, setNumQuestions] = useState<number>(10);
  const [selectedChapters, setSelectedChapters] = useState<(string | number)[]>([]);
  const [selectedAAAs, setSelectedAAAs] = useState<(string | number)[]>([]);
  const [selectedBlooms, setSelectedBlooms] = useState<(string | number)[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<(string | number)[]>([]);

  // Convert filter options to MultiSelect format
  const chapterOptions: MultiSelectOption[] = useMemo(() => {
    if (!data?.filter_options.chapters) return [];
    return data.filter_options.chapters.map((chapter) => ({
      value: chapter.id,
      label: chapter.title,
    }));
  }, [data]);

  const aaaOptions: MultiSelectOption[] = useMemo(() => {
    if (!data?.filter_options.aa_codes) return [];
    return data.filter_options.aa_codes.map((code) => ({
      value: code,
      label: code,
    }));
  }, [data]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (numQuestions < 1) {
      toast.error('Number of questions must be at least 1');
      return;
    }

    if (numQuestions > (data?.total_approved_questions || 0)) {
      toast.error(
        `Only ${data?.total_approved_questions} approved questions available. Please reduce the number.`
      );
      return;
    }

    // Build filters
    const filters: RevisionQuizFilters = {
      num_questions: numQuestions,
      chapter_ids:
        selectedChapters.length > 0
          ? selectedChapters.map((id) => Number(id))
          : undefined,
      aa_codes:
        selectedAAAs.length > 0 ? selectedAAAs.map((code) => String(code)) : undefined,
      bloom_levels:
        selectedBlooms.length > 0 ? selectedBlooms.map((level) => String(level)) : undefined,
      difficulty_levels:
        selectedDifficulties.length > 0
          ? selectedDifficulties.map((level) => String(level))
          : undefined,
    };

    try {
      const response = await createRevisionQuiz.mutateAsync({ courseId, filters });

      // Redirect to quiz page
      router.push(`/courses/${courseId}/quizzes/${response.quiz.id}/view`);
    } catch (error) {
      // Error is handled by the mutation hook
      console.error('Failed to create revision quiz:', error);
    }
  };

  // Calculate estimated questions based on filters
  const estimatedQuestions = useMemo(() => {
    // This is a simplified estimate - the backend will do the actual filtering
    const total = data?.total_approved_questions || 0;
    return Math.min(numQuestions, total);
  }, [numQuestions, data]);

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as any)?.response?.data?.error || 'Failed to load revision options'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-3xl space-y-6">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Create Revision Quiz</h1>
        <p className="text-muted-foreground">
          {data?.course.title} - Select filters to generate a custom revision quiz
        </p>
      </div>

      {/* Stats Card */}
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertDescription>
          <strong>{data?.total_approved_questions || 0}</strong> approved questions available
        </AlertDescription>
      </Alert>

      {/* Setup Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Quiz Configuration</CardTitle>
            <CardDescription>
              Customize your revision quiz by selecting filters and number of questions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Number of Questions */}
            <div className="space-y-2">
              <Label htmlFor="num_questions">
                Number of Questions <span className="text-destructive">*</span>
              </Label>
              <Input
                id="num_questions"
                type="number"
                min={1}
                max={data?.total_approved_questions || 100}
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value, 10))}
                placeholder="Enter number of questions"
                required
              />
              <p className="text-xs text-muted-foreground">
                Maximum: {data?.total_approved_questions || 0} questions
              </p>
            </div>

            <Separator />

            {/* Filters */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">
                Filters <span className="text-muted-foreground font-normal">(Optional)</span>
              </h3>

              {/* Chapters */}
              <MultiSelect
                label="Chapters"
                options={chapterOptions}
                selected={selectedChapters}
                onChange={setSelectedChapters}
                placeholder="Select chapters"
                defaultLabel="All Chapters"
              />

              {/* AAA Codes */}
              <MultiSelect
                label="AAA Codes"
                options={aaaOptions}
                selected={selectedAAAs}
                onChange={setSelectedAAAs}
                placeholder="Select AAA codes"
                defaultLabel="All AAA Codes"
                searchable
              />

              {/* Bloom Levels */}
              <MultiSelect
                label="Bloom Levels"
                options={BLOOM_LEVELS}
                selected={selectedBlooms}
                onChange={setSelectedBlooms}
                placeholder="Select bloom levels"
                defaultLabel="All Bloom Levels"
              />

              {/* Difficulty Levels */}
              <MultiSelect
                label="Difficulty"
                options={DIFFICULTY_LEVELS}
                selected={selectedDifficulties}
                onChange={setSelectedDifficulties}
                placeholder="Select difficulty"
                defaultLabel="All Difficulty Levels"
              />
            </div>

            <Separator />

            {/* Summary */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h3 className="text-sm font-semibold">Quiz Summary</h3>
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Questions:</span>{' '}
                  <strong>{numQuestions}</strong>
                </p>
                {selectedChapters.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Chapters:</span>{' '}
                    {selectedChapters.length} selected
                  </p>
                )}
                {selectedAAAs.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">AAA Codes:</span>{' '}
                    {selectedAAAs.length} selected
                  </p>
                )}
                {selectedBlooms.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Bloom Levels:</span>{' '}
                    {selectedBlooms.length} selected
                  </p>
                )}
                {selectedDifficulties.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Difficulty:</span>{' '}
                    {selectedDifficulties.length} selected
                  </p>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={createRevisionQuiz.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createRevisionQuiz.isPending} className="flex-1">
                {createRevisionQuiz.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Quiz...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Create Revision Quiz
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
