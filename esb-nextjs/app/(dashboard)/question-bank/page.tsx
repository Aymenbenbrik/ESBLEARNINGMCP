'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { QuestionFilters } from '@/components/question-bank/QuestionFilters';
import { QuestionList } from '@/components/question-bank/QuestionList';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCourses } from '@/lib/hooks/useCourses';
import { useQuestionBank, useApproveQuestions } from '@/lib/hooks/useQuestionBank';
import { useAuth } from '@/lib/hooks/useAuth';
import { QuestionBankFilters } from '@/lib/types/question-bank';
import { questionBankApi } from '@/lib/api/question-bank';
import { AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function QuestionBankContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    migrated: number;
    skipped: number;
    errors: number;
  } | null>(null);

  // Parse filters from URL
  const courseId = searchParams.get('course_id');
  const chapterIds = searchParams.get('chapter_id');
  const aaaCodes = searchParams.get('aaa');
  const bloomLevel = searchParams.get('bloom_level');
  const difficulty = searchParams.get('difficulty');
  const approved = searchParams.get('approved');
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const limit = 50;

  // Fetch courses
  const { data: coursesData, isLoading: coursesLoading, error: coursesError } = useCourses();

  // Build filters object
  const filters: QuestionBankFilters = {
    course_id: courseId ? parseInt(courseId, 10) : 0,
    chapter_id: chapterIds || undefined,
    aaa: aaaCodes || undefined,
    bloom_level: bloomLevel || undefined,
    difficulty: difficulty || undefined,
    approved: (approved as 'true' | 'false' | 'all') || undefined,
    limit,
    offset,
  };

  // Fetch questions
  const {
    data: questionsData,
    isLoading: questionsLoading,
    error: questionsError,
    refetch: refetchQuestions,
  } = useQuestionBank(filters);

  // Approve/reject mutation
  const approveQuestions = useApproveQuestions();

  const isTeacher = user?.is_teacher || user?.is_superuser;

  // Handle course selection
  const handleCourseChange = (newCourseId: number) => {
    const params = new URLSearchParams();
    params.set('course_id', newCourseId.toString());
    router.push(`${pathname}?${params.toString()}`);
    setSelectedQuestions([]);
  };

  // Handle page change
  const handlePageChange = (newOffset: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('offset', newOffset.toString());
    router.push(`${pathname}?${params.toString()}`);
    setSelectedQuestions([]);
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (selectedQuestions.length === 0 || !courseId) return;

    await approveQuestions.mutateAsync({
      course_id: parseInt(courseId, 10),
      question_ids: selectedQuestions,
      action: 'approve',
    });

    setSelectedQuestions([]);
  };

  // Handle bulk reject
  const handleBulkReject = async () => {
    if (selectedQuestions.length === 0 || !courseId) return;

    await approveQuestions.mutateAsync({
      course_id: parseInt(courseId, 10),
      question_ids: selectedQuestions,
      action: 'reject',
    });

    setSelectedQuestions([]);
  };

  // Handle migration from existing quiz documents
  const handleMigration = async () => {
    if (!courseId) {
      toast.error('Please select a course first');
      return;
    }

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const result = await questionBankApi.migrate({
        course_id: parseInt(courseId, 10),
      });

      setMigrationResult(result);
      toast.success(`Migrated ${result.migrated} questions to question bank`);

      // Refresh question list
      refetchQuestions();
    } catch (error) {
      console.error('Migration failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Migration failed. Check console for details.';
      toast.error(errorMessage);
    } finally {
      setIsMigrating(false);
    }
  };

  // Clear selections and migration results when course changes
  useEffect(() => {
    setSelectedQuestions([]);
    setMigrationResult(null);
  }, [courseId]);

  // Debug panel for teachers (shows data state)
  const showDebugInfo = isTeacher && process.env.NODE_ENV === 'development';

  if (coursesError) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load courses
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Question Bank</h1>
        <p className="text-muted-foreground">
          {isTeacher
            ? 'Browse, filter, and approve questions for your courses'
            : 'Browse approved questions from your courses'}
        </p>
      </div>

      {/* Debug Info Panel (Development Only) */}
      {showDebugInfo && courseId && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="text-sm">🔍 Debug Info (Dev Only)</CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-1">
            <div>Course ID: {courseId}</div>
            <div>Loading: {questionsLoading ? 'Yes' : 'No'}</div>
            <div>Questions Fetched: {questionsData?.questions?.length || 0}</div>
            <div>Total in DB: {questionsData?.total || 0}</div>
            <div>Filters: {JSON.stringify(filters, null, 2)}</div>

            {/* Database Stats Button */}
            <Button
              onClick={async () => {
                try {
                  const stats = await questionBankApi.getDebugStats(parseInt(courseId, 10));
                  console.log('📊 Database Stats:', stats);

                  // Show formatted stats in alert
                  const statsMessage = `
📊 Database Statistics for Course ${stats.course_id}

Total Questions: ${stats.total_questions}
✅ Approved: ${stats.approved_questions}
⏳ Unapproved: ${stats.unapproved_questions}

Questions by Chapter:
${stats.questions_by_chapter.map((ch: any) =>
  `  Chapter ${ch.chapter_id || 'NULL'}: ${ch.count} questions`
).join('\n') || '  No chapters'}

Quiz Documents Available: ${stats.quiz_documents_available_for_migration}

💡 Recommendation:
${stats.recommendation}
                  `.trim();

                  alert(statsMessage);
                  toast.info('Database stats logged to console');
                } catch (err) {
                  console.error('Failed to fetch stats:', err);
                  toast.error('Failed to fetch database stats');
                }
              }}
              className="mt-2 w-full"
              variant="outline"
              size="sm"
            >
              Check Database Stats
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1">
          <QuestionFilters
            courses={coursesData?.enrolled_courses || []}
            selectedCourseId={courseId ? parseInt(courseId, 10) : undefined}
            onCourseChange={handleCourseChange}
          />
        </div>

        {/* Questions List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Bulk Actions (Teachers only) */}
          {isTeacher && courseId && selectedQuestions.length > 0 && (
            <Card className="border-primary/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">
                    {selectedQuestions.length} question
                    {selectedQuestions.length !== 1 ? 's' : ''} selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkApprove}
                      disabled={approveQuestions.isPending}
                    >
                      {approveQuestions.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkReject}
                      disabled={approveQuestions.isPending}
                    >
                      {approveQuestions.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {questionsError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load questions
              </AlertDescription>
            </Alert>
          )}

          {/* No Course Selected */}
          {!courseId && !coursesLoading && (
            <Card>
              <CardContent className="p-12">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Select a Course</h3>
                  <p className="text-muted-foreground">
                    Choose a course from the filters to view questions
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Questions List */}
          {courseId && (
            <QuestionList
              questions={questionsData?.questions || []}
              total={questionsData?.total || 0}
              totalUnfiltered={questionsData?.total_unfiltered}
              limit={limit}
              offset={offset}
              isLoading={questionsLoading}
              onPageChange={handlePageChange}
              showSelection={isTeacher}
              selectedQuestions={selectedQuestions}
              onSelectionChange={setSelectedQuestions}
              courseId={parseInt(courseId, 10)}
              onMigrate={isTeacher ? handleMigration : undefined}
              isMigrating={isMigrating}
              migrationResult={migrationResult}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function QuestionBankPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Question Bank</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <QuestionBankContent />
    </Suspense>
  );
}
