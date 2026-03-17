'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { StudentManagementTabs } from '@/components/teacher/StudentManagementTabs';
import { toast } from 'sonner';

export default function StudentsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || !user.is_teacher)) {
      toast.error('Access denied: Teachers only');
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-bolt-muted">Loading...</p>
      </div>
    );
  }

  if (!user?.is_teacher) {
    return null;
  }

  return (
    <div className="py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-bolt-ink tracking-tight">
          Student Management
        </h1>
        <p className="text-bolt-muted mt-1">
          Add and manage your students
        </p>
      </div>
      <StudentManagementTabs />
    </div>
  );
}
