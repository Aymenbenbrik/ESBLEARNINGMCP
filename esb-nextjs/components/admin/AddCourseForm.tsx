'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Course } from '@/lib/types/course';
import { ProgramCourse } from '@/lib/types/admin';
import { Plus } from 'lucide-react';

interface AddCourseFormProps {
  availableCourses: Course[];
  programCourses: ProgramCourse[];
  onAdd: (courseId: number) => void;
  isLoading?: boolean;
}

export function AddCourseForm({
  availableCourses,
  programCourses,
  onAdd,
  isLoading,
}: AddCourseFormProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  // Filter out courses already in the program
  const programCourseIds = new Set(programCourses.map((c) => c.id));
  const filteredCourses = availableCourses.filter((c) => !programCourseIds.has(c.id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCourseId) {
      onAdd(parseInt(selectedCourseId));
      setSelectedCourseId('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <div className="flex-1">
        <Label htmlFor="course-select">Add Course to Program</Label>
        <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
          <SelectTrigger id="course-select">
            <SelectValue placeholder="Select a course" />
          </SelectTrigger>
          <SelectContent>
            {filteredCourses.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">No courses available</div>
            ) : (
              filteredCourses.map((course) => (
                <SelectItem key={course.id} value={course.id.toString()}>
                  {course.title}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={!selectedCourseId || isLoading}>
        <Plus className="h-4 w-4 mr-1" />
        Add
      </Button>
    </form>
  );
}
