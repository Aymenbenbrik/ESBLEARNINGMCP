'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { usersApi } from '@/lib/api/users';
import { User } from '@/lib/types/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit, Trash2, RotateCcw, Eye } from 'lucide-react';

interface StudentTableProps {
  students: User[];
  onUpdate: () => void;
}

export function StudentTable({ students, onUpdate }: StudentTableProps) {
  const [editingStudent, setEditingStudent] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);

  const getStatusColor = (lastLogin?: string) => {
    if (!lastLogin) return 'yellow'; // pending
    const daysSinceLogin = Math.floor(
      (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceLogin <= 7 ? 'green' : 'red'; // active or inactive
  };

  const getStatusLabel = (lastLogin?: string) => {
    if (!lastLogin) return 'Pending';
    const daysSinceLogin = Math.floor(
      (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceLogin <= 7 ? 'Active' : 'Inactive';
  };

  const handleEdit = (student: User) => {
    setEditingStudent(student);
    setEditUsername(student.username);
    setEditEmail(student.email);
  };

  const handleSaveEdit = async () => {
    if (!editingStudent) return;

    setIsEditLoading(true);
    try {
      await usersApi.updateStudent(editingStudent.id, {
        username: editUsername,
        email: editEmail,
      });
      toast.success('Student updated successfully');
      setEditingStudent(null);
      onUpdate();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to update student';
      toast.error(errorMessage);
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleDelete = (student: User) => {
    setStudentToDelete(student);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!studentToDelete) return;

    try {
      await usersApi.removeStudent(studentToDelete.id);
      toast.success('Student removed from roster');
      setDeleteDialogOpen(false);
      setStudentToDelete(null);
      onUpdate();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to remove student';
      toast.error(errorMessage);
    }
  };

  const handleResetPassword = async (student: User) => {
    try {
      await usersApi.resetStudentPassword(student.id);
      toast.success(`Password reset for ${student.username}. New password: FirstName@123`);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to reset password';
      toast.error(errorMessage);
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-bolt-line">
              <th className="text-left py-3 px-4 font-semibold text-sm text-bolt-muted">
                Status
              </th>
              <th className="text-left py-3 px-4 font-semibold text-sm text-bolt-muted">
                Username
              </th>
              <th className="text-left py-3 px-4 font-semibold text-sm text-bolt-muted">
                Email
              </th>
              <th className="text-left py-3 px-4 font-semibold text-sm text-bolt-muted">
                Last Login
              </th>
              <th className="text-right py-3 px-4 font-semibold text-sm text-bolt-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const statusColor = getStatusColor(student.created_at); // Using created_at as placeholder
              const statusLabel = getStatusLabel(student.created_at);

              return (
                <tr
                  key={student.id}
                  className="border-b border-bolt-line hover:bg-bolt-surface/50 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          statusColor === 'green'
                            ? 'bg-green-500'
                            : statusColor === 'yellow'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                      />
                      <span className="text-sm text-bolt-muted">{statusLabel}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-semibold text-bolt-ink">
                    {student.username}
                  </td>
                  <td className="py-3 px-4 text-bolt-muted">{student.email}</td>
                  <td className="py-3 px-4 text-sm text-bolt-muted">
                    {student.created_at
                      ? new Date(student.created_at).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        asChild
                        title="View Dashboard"
                      >
                        <Link href={`/students/${student.id}/dashboard`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleEdit(student)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleResetPassword(student)}
                        title="Reset Password"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(student)}
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingStudent} onOpenChange={() => setEditingStudent(null)}>
        <DialogContent className="border-bolt-line rounded-[16px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold">Edit Student</DialogTitle>
            <DialogDescription>Update student information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_username" className="font-semibold">
                Username
              </Label>
              <Input
                id="edit_username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="rounded-xl border-bolt-line"
                disabled={isEditLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_email" className="font-semibold">
                Email
              </Label>
              <Input
                id="edit_email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="rounded-xl border-bolt-line"
                disabled={isEditLoading}
              />
            </div>
            <Button
              onClick={handleSaveEdit}
              className="w-full rounded-full bg-bolt-accent hover:bg-bolt-accent-600 text-white font-bold"
              disabled={isEditLoading}
            >
              {isEditLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="border-bolt-line rounded-[16px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold">Remove Student</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {studentToDelete?.username} from your roster?
              This will not delete their account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="rounded-full"
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
