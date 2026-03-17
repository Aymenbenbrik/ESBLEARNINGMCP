'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClassCourseAssignment } from '@/lib/types/admin';
import { User } from '@/lib/types/course';
import { Badge } from '@/components/ui/badge';
import { Save } from 'lucide-react';

interface TeacherAssignmentTableProps {
  assignments: ClassCourseAssignment[];
  availableTeachers: User[];
  onSave: (assignments: { course_id: number; teacher_id: number | null }[]) => void;
  isLoading?: boolean;
}

export function TeacherAssignmentTable({
  assignments,
  availableTeachers,
  onSave,
  isLoading,
}: TeacherAssignmentTableProps) {
  // Local state to track teacher selections
  const [teacherSelections, setTeacherSelections] = useState<Record<number, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize selections from current assignments
  useEffect(() => {
    const initialSelections: Record<number, string> = {};
    assignments.forEach((assignment) => {
      initialSelections[assignment.course.id] = assignment.teacher?.id.toString() || '';
    });
    setTeacherSelections(initialSelections);
  }, [assignments]);

  const handleTeacherChange = (courseId: number, teacherId: string) => {
    setTeacherSelections((prev) => ({
      ...prev,
      [courseId]: teacherId,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const assignmentsData = assignments.map((assignment) => ({
      course_id: assignment.course.id,
      teacher_id: teacherSelections[assignment.course.id]
        ? parseInt(teacherSelections[assignment.course.id])
        : null,
    }));
    onSave(assignmentsData);
    setHasChanges(false);
  };

  if (assignments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No course assignments available for this class.</p>
        <p className="text-sm mt-1">Add courses to the program first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Course</TableHead>
            <TableHead>Assigned Teacher</TableHead>
            <TableHead className="w-[250px]">Select Teacher</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.map((assignment) => {
            const currentTeacherId = teacherSelections[assignment.course.id] || '';

            return (
              <TableRow key={assignment.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{assignment.course.title}</div>
                    {assignment.course.description && (
                      <div className="text-sm text-muted-foreground line-clamp-1">
                        {assignment.course.description}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {assignment.teacher ? (
                    <div>
                      <div className="font-medium">{assignment.teacher.username}</div>
                      <div className="text-sm text-muted-foreground">{assignment.teacher.email}</div>
                    </div>
                  ) : (
                    <Badge variant="outline">Unassigned</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={currentTeacherId}
                    onValueChange={(value) => handleTeacherChange(assignment.course.id, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No teacher</SelectItem>
                      {availableTeachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id.toString()}>
                          {teacher.username} ({teacher.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!hasChanges || isLoading}>
          <Save className="h-4 w-4 mr-2" />
          {isLoading ? 'Saving...' : 'Save Teacher Assignments'}
        </Button>
      </div>
    </div>
  );
}
