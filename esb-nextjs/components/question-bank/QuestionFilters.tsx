'use client';

import { useEffect, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MultiSelect, MultiSelectOption } from '@/components/shared/MultiSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCourse } from '@/lib/hooks/useCourses';
import { useAAAs } from '@/lib/hooks/useQuestionBank';
import { Course } from '@/lib/types/course';
import { RotateCcw } from 'lucide-react';

interface QuestionFiltersProps {
  courses: Course[];
  selectedCourseId?: number;
  onCourseChange: (courseId: number) => void;
}

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

const APPROVAL_OPTIONS: MultiSelectOption[] = [
  { value: 'true', label: 'Approved' },
  { value: 'false', label: 'Not Approved' },
];

export function QuestionFilters({
  courses,
  selectedCourseId,
  onCourseChange,
}: QuestionFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // Fetch chapters for selected course
  const { data: courseData } = useCourse(selectedCourseId || 0);

  // Fetch AA codes for selected course (teachers only)
  const { data: aaData } = useAAAs(selectedCourseId);

  // Parse current filter values from URL
  const chapterIds = searchParams.get('chapter_id')?.split(',').filter(Boolean) || [];
  const aaCodes = searchParams.get('aaa')?.split(',').filter(Boolean) || [];
  const bloomLevel = searchParams.get('bloom_level') || '';
  const difficulty = searchParams.get('difficulty') || '';
  const approved = searchParams.get('approved') || '';

  // Convert chapters to MultiSelect options
  const chapterOptions: MultiSelectOption[] = useMemo(() => {
    if (!courseData?.chapters) return [];
    return courseData.chapters.map((chapter: { id: number; title: string }) => ({
      value: chapter.id.toString(),
      label: chapter.title,
    }));
  }, [courseData]);

  // Convert AA codes to MultiSelect options
  const aaOptions: MultiSelectOption[] = useMemo(() => {
    if (!aaData?.aaas) return [];
    return aaData.aaas.map((aa: { code: string }) => ({
      value: aa.code,
      label: aa.code,
    }));
  }, [aaData]);

  // Update URL with filter changes
  const updateFilters = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // Reset offset when filters change
    params.delete('offset');

    router.push(`${pathname}?${params.toString()}`);
  };

  // Handle chapter selection
  const handleChapterChange = (selected: (string | number)[]) => {
    const value = selected.length > 0 ? selected.join(',') : undefined;
    updateFilters({ chapter_id: value });
  };

  // Handle AA selection
  const handleAAChange = (selected: (string | number)[]) => {
    const value = selected.length > 0 ? selected.join(',') : undefined;
    updateFilters({ aaa: value });
  };

  // Handle Bloom level selection
  const handleBloomChange = (selected: (string | number)[]) => {
    const value = selected.length > 0 ? selected.join(',') : undefined;
    updateFilters({ bloom_level: value });
  };

  // Handle difficulty selection
  const handleDifficultyChange = (selected: (string | number)[]) => {
    const value = selected.length > 0 ? selected.join(',') : undefined;
    updateFilters({ difficulty: value });
  };

  // Handle approval status selection (teachers only)
  const handleApprovalChange = (selected: (string | number)[]) => {
    const value = selected.length > 0 ? selected.join(',') : undefined;
    updateFilters({ approved: value });
  };

  // Reset all filters
  const handleReset = () => {
    const params = new URLSearchParams();
    if (selectedCourseId) {
      params.set('course_id', selectedCourseId.toString());
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  // Check if any filters are active
  const hasActiveFilters =
    chapterIds.length > 0 ||
    aaCodes.length > 0 ||
    bloomLevel !== '' ||
    difficulty !== '' ||
    approved !== '';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Filters</CardTitle>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Course Selection */}
        <div className="space-y-2">
          <Label>Course</Label>
          <Select
            value={selectedCourseId?.toString() || ''}
            onValueChange={(value) => onCourseChange(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id.toString()}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Chapter Filter */}
        {selectedCourseId && (
          <MultiSelect
            label="Chapters"
            options={chapterOptions}
            selected={chapterIds}
            onChange={handleChapterChange}
            placeholder="Select chapters"
            defaultLabel="All Chapters"
            disabled={chapterOptions.length === 0}
          />
        )}

        {/* AA Code Filter (Teachers only) */}
        {selectedCourseId && user?.is_teacher && (
          <MultiSelect
            label="AA Codes"
            options={aaOptions}
            selected={aaCodes}
            onChange={handleAAChange}
            placeholder="Sélectionner des AA"
            defaultLabel="Tous les AA"
            searchable
            disabled={aaOptions.length === 0}
          />
        )}

        {/* Bloom Level Filter */}
        {selectedCourseId && (
          <MultiSelect
            label="Bloom Level"
            options={BLOOM_LEVELS}
            selected={bloomLevel.split(',').filter(Boolean)}
            onChange={handleBloomChange}
            placeholder="Select bloom levels"
            defaultLabel="All Bloom Levels"
          />
        )}

        {/* Difficulty Filter */}
        {selectedCourseId && (
          <MultiSelect
            label="Difficulty"
            options={DIFFICULTY_LEVELS}
            selected={difficulty.split(',').filter(Boolean)}
            onChange={handleDifficultyChange}
            placeholder="Select difficulty"
            defaultLabel="All Difficulty Levels"
          />
        )}

        {/* Approval Status Filter (Teachers only) */}
        {selectedCourseId && user?.is_teacher && (
          <MultiSelect
            label="Approval Status"
            options={APPROVAL_OPTIONS}
            selected={approved.split(',').filter(Boolean)}
            onChange={handleApprovalChange}
            placeholder="Select approval status"
            defaultLabel="All Questions"
          />
        )}
      </CardContent>
    </Card>
  );
}
