'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChapter } from '@/lib/hooks/useChapters';
import { useCourse } from '@/lib/hooks/useCourses';
import { useGenerateChapterQuiz, useTeacherGenerateQuiz } from '@/lib/hooks/useQuiz';
import { useAuth } from '@/lib/hooks/useAuth';
import { ChapterQuizGenerateData } from '@/lib/types/quiz';
import { TNChapter, TNSection } from '@/lib/types/course';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';

const defaultBloomDistribution = {
  remember: 17,
  understand: 25,
  apply: 25,
  analyze: 20,
  evaluate: 8,
  create: 5,
};

const defaultDifficultyDistribution = {
  easy: 33,
  medium: 34,
  hard: 33,
};

export default function QuizSetupPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);

  const { user } = useAuth();
  const isTeacher = user?.is_teacher;

  const { data: chapterData, isLoading: chapterLoading } = useChapter(chapterId);
  const { data: courseData, isLoading: courseLoading } = useCourse(courseId);

  // Use appropriate mutation based on role
  const studentMutation = useGenerateChapterQuiz();
  const teacherMutation = useTeacherGenerateQuiz();
  const generateQuizMutation = isTeacher ? teacherMutation : studentMutation;

  // Form state
  const [numMCQ, setNumMCQ] = useState(8);
  const [numOpen, setNumOpen] = useState(4);
  const [bloomDist, setBloomDist] = useState(defaultBloomDistribution);
  const [difficultyDist, setDifficultyDist] = useState(defaultDifficultyDistribution);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set([chapterId]));
  const [selectedSections, setSelectedSections] = useState<Set<number>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set([chapterId]));
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Calculate totals
  const bloomTotal = Object.values(bloomDist).reduce((a, b) => a + b, 0);
  const difficultyTotal = Object.values(difficultyDist).reduce((a, b) => a + b, 0);

  // Validation
  const validate = (): boolean => {
    const errors: string[] = [];

    if (bloomTotal !== 100) {
      errors.push('Bloom taxonomy distribution must total 100%');
    }

    if (difficultyTotal !== 100) {
      errors.push('Difficulty distribution must total 100%');
    }

    if (numMCQ < 1 || numMCQ > 20) {
      errors.push('MCQ count must be between 1 and 20');
    }

    if (numOpen < 0 || numOpen > 10) {
      errors.push('Open-ended count must be between 0 and 10');
    }

    if (selectedChapters.size === 0 && selectedSections.size === 0) {
      errors.push('Please select at least one chapter or section');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Handle chapter toggle
  const toggleChapter = (chapId: number) => {
    const newSelected = new Set(selectedChapters);
    if (newSelected.has(chapId)) {
      newSelected.delete(chapId);
      // Also deselect all sections from this chapter
      if (courseData?.chapters) {
        const chapter = courseData.chapters.find((c) => c.id === chapId);
        if (chapter) {
          // Find TN chapter by order
          const tnChapter = chapterData?.tn_chapter;
          if (tnChapter && tnChapter.sections) {
            tnChapter.sections.forEach((section) => {
              selectedSections.delete(section.id);
            });
          }
        }
      }
    } else {
      newSelected.add(chapId);
    }
    setSelectedChapters(newSelected);
  };

  // Handle section toggle
  const toggleSection = (sectionId: number) => {
    const newSelected = new Set(selectedSections);
    if (newSelected.has(sectionId)) {
      newSelected.delete(sectionId);
    } else {
      newSelected.add(sectionId);
    }
    setSelectedSections(newSelected);
  };

  // Handle chapter expansion
  const toggleExpanded = (chapId: number) => {
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(chapId)) {
      newExpanded.delete(chapId);
    } else {
      newExpanded.add(chapId);
    }
    setExpandedChapters(newExpanded);
  };

  // Handle generate
  const handleGenerate = async () => {
    if (!validate()) {
      return;
    }

    const quizData: ChapterQuizGenerateData = {
      chapter_ids: Array.from(selectedChapters),
      section_ids: Array.from(selectedSections),
      num_mcq: numMCQ,
      num_open: numOpen,
      bloom_distribution: bloomDist,
      difficulty_distribution: difficultyDist,
    };

    generateQuizMutation.mutate(
      { courseId, data: quizData },
      {
        onSuccess: (data) => {
          if (isTeacher && 'questions' in data && 'metadata' in data) {
            // Teacher: store questions in sessionStorage and redirect to preview
            // Type assertion since we know this is the teacher response type
            const teacherData = data as {
              questions: any[];
              title: string;
              metadata: any;
              num_questions: number;
            };

            const previewData = {
              questions: teacherData.questions,
              title: teacherData.title,
              metadata: teacherData.metadata,
              num_questions: teacherData.num_questions,
            };

            // Store in sessionStorage
            sessionStorage.setItem('pendingQuiz', JSON.stringify(previewData));

            // Redirect to preview page
            router.push(`/courses/${courseId}/quiz/preview`);
          } else if ('quiz_id' in data) {
            // Student: quiz created as Quiz instance, start taking it
            router.push(`/courses/${courseId}/chapters/${chapterId}/quiz/${data.quiz_id}`);
          } else {
            // Fallback: redirect to course page
            router.push(`/courses/${courseId}`);
          }
        },
      }
    );
  };

  if (chapterLoading || courseLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 mb-6" />
      </div>
    );
  }

  if (!chapterData || !courseData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Chapter not found"
          description="The chapter you're looking for doesn't exist."
          icon={<AlertCircle className="h-12 w-12" />}
        />
      </div>
    );
  }

  const { chapter, tn_chapter } = chapterData;
  const hasSections = tn_chapter && tn_chapter.sections && tn_chapter.sections.length > 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: courseData.course.title, href: `/courses/${courseId}` },
          { label: chapter.title, href: `/courses/${courseId}/chapters/${chapterId}` },
          { label: 'Quiz Setup' },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Generate Quiz</h1>
        <p className="text-muted-foreground">
          Configure your quiz parameters and select the content to be covered.
        </p>
      </div>

      {validationErrors.length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Chapter/Section Selection */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Chapter */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Checkbox
                    checked={selectedChapters.has(chapterId)}
                    onCheckedChange={() => toggleChapter(chapterId)}
                  />
                  <Badge variant="default">Chapter {chapter.order}</Badge>
                  <span className="font-medium flex-1">{chapter.title}</span>
                  {hasSections && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpanded(chapterId)}
                    >
                      {expandedChapters.has(chapterId) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>

                {/* TN Sections */}
                {hasSections && expandedChapters.has(chapterId) && (
                  <div className="ml-6 space-y-2">
                    {tn_chapter.sections.map((section: TNSection) => (
                      <div
                        key={section.id}
                        className="flex items-start gap-3 p-2 rounded hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedSections.has(section.id)}
                          onCheckedChange={() => toggleSection(section.id)}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {section.index} — {section.title}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info about selections */}
              <div className="text-sm text-muted-foreground">
                {selectedChapters.size > 0 && (
                  <p>
                    <CheckCircle2 className="inline h-4 w-4 mr-1 text-green-600" />
                    {selectedChapters.size} chapter(s) selected
                  </p>
                )}
                {selectedSections.size > 0 && (
                  <p>
                    <CheckCircle2 className="inline h-4 w-4 mr-1 text-green-600" />
                    {selectedSections.size} section(s) selected
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Quiz Parameters */}
        <div className="space-y-4">
          {/* Question Counts */}
          <Card>
            <CardHeader>
              <CardTitle>Question Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="num-mcq">MCQ Questions</Label>
                <Input
                  id="num-mcq"
                  type="number"
                  min={1}
                  max={20}
                  value={numMCQ}
                  onChange={(e) => setNumMCQ(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="num-open">Open-Ended Questions</Label>
                <Input
                  id="num-open"
                  type="number"
                  min={0}
                  max={10}
                  value={numOpen}
                  onChange={(e) => setNumOpen(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {numMCQ + numOpen} questions
              </div>
            </CardContent>
          </Card>

          {/* Bloom Taxonomy */}
          <Card>
            <CardHeader>
              <CardTitle>
                Bloom Taxonomy Distribution
                <span
                  className={`ml-2 text-sm ${
                    bloomTotal === 100 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  ({bloomTotal}%)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(bloomDist).map(([level, value]) => (
                <div key={level} className="flex items-center gap-2">
                  <Label className="w-24 capitalize text-sm">{level}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) =>
                      setBloomDist({
                        ...bloomDist,
                        [level]: parseInt(e.target.value) || 0,
                      })
                    }
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground w-8">%</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Difficulty */}
          <Card>
            <CardHeader>
              <CardTitle>
                Difficulty Distribution
                <span
                  className={`ml-2 text-sm ${
                    difficultyTotal === 100 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  ({difficultyTotal}%)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(difficultyDist).map(([level, value]) => (
                <div key={level} className="flex items-center gap-2">
                  <Label className="w-24 capitalize text-sm">{level}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) =>
                      setDifficultyDist({
                        ...difficultyDist,
                        [level]: parseInt(e.target.value) || 0,
                      })
                    }
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground w-8">%</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={generateQuizMutation.isPending}
            className="w-full"
            size="lg"
          >
            {generateQuizMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Quiz...
              </>
            ) : (
              'Generate Quiz'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
