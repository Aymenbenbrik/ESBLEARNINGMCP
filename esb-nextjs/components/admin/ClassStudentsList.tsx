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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ClassStudentsResponse } from '@/lib/types/admin';
import { Users, Save } from 'lucide-react';

interface ClassStudentsListProps {
  data: ClassStudentsResponse;
  onSave: (studentIds: number[]) => void;
  isLoading?: boolean;
}

export function ClassStudentsList({ data, onSave, isLoading }: ClassStudentsListProps) {
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize with enrolled students
  useEffect(() => {
    const enrolledIds = new Set(data.enrolled_students.map((s) => s.id));
    setSelectedStudentIds(enrolledIds);
  }, [data.enrolled_students]);

  const handleToggleStudent = (studentId: number, checked: boolean) => {
    setSelectedStudentIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(studentId);
      } else {
        newSet.delete(studentId);
      }
      return newSet;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(Array.from(selectedStudentIds));
    setHasChanges(false);
  };

  if (data.all_students.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No students available in the system.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {selectedStudentIds.size} of {data.all_students.length} students selected
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || isLoading}>
          <Save className="h-4 w-4 mr-2" />
          {isLoading ? 'Saving...' : 'Save Student Roster'}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Current Class</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.all_students.map((student) => {
            const isSelected = selectedStudentIds.has(student.id);
            const isInAnotherClass = student.class_id && student.class_id !== data.class.id;

            return (
              <TableRow key={student.id}>
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      handleToggleStudent(student.id, checked as boolean)
                    }
                    disabled={isLoading}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{student.username}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">{student.email}</div>
                </TableCell>
                <TableCell>
                  {isInAnotherClass ? (
                    <Badge variant="outline">{student.class_name}</Badge>
                  ) : student.class_id === data.class.id ? (
                    <Badge variant="secondary">This class</Badge>
                  ) : (
                    <Badge variant="outline">No class</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
