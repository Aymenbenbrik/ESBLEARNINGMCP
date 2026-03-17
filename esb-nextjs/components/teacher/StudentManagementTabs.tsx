'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BulkEmailImport } from './BulkEmailImport';
import { StudentTable } from './StudentTable';
import { usersApi } from '@/lib/api/users';
import { User, StudentStats } from '@/lib/types/auth';
import { Users, UserCheck, Clock } from 'lucide-react';

export function StudentManagementTabs() {
  const [students, setStudents] = useState<User[]>([]);
  const [stats, setStats] = useState<StudentStats>({ total: 0, active: 0, pending: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const loadStudents = async () => {
    try {
      const data = await usersApi.getTeacherStudents();
      setStudents(data.students);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  return (
    <div>
      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="border-bolt-line rounded-[16px]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-bolt-muted">Total Students</p>
                <p className="text-3xl font-extrabold text-bolt-ink mt-1">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-bolt-muted" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-bolt-line rounded-[16px]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-bolt-muted">Active (7 days)</p>
                <p className="text-3xl font-extrabold text-green-600 mt-1">{stats.active}</p>
              </div>
              <UserCheck className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-bolt-line rounded-[16px]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-bolt-muted">Pending</p>
                <p className="text-3xl font-extrabold text-yellow-600 mt-1">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="add" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 rounded-xl bg-bolt-surface border border-bolt-line">
          <TabsTrigger value="add" className="rounded-lg font-semibold">
            Add Students
          </TabsTrigger>
          <TabsTrigger value="manage" className="rounded-lg font-semibold">
            Manage Students
          </TabsTrigger>
        </TabsList>

        <TabsContent value="add" className="mt-6">
          <Card className="border-bolt-line rounded-[16px]">
            <CardHeader>
              <CardTitle className="font-extrabold">Bulk Add Students</CardTitle>
              <CardDescription>
                Paste student emails (one per line). Accounts will be auto-created.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BulkEmailImport onSuccess={loadStudents} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage" className="mt-6">
          <Card className="border-bolt-line rounded-[16px]">
            <CardHeader>
              <CardTitle className="font-extrabold">Student Roster</CardTitle>
              <CardDescription>
                View and manage your students
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-bolt-muted text-center py-8">Loading students...</p>
              ) : students.length === 0 ? (
                <p className="text-bolt-muted text-center py-8">
                  No students yet. Add students using the "Add Students" tab.
                </p>
              ) : (
                <StudentTable students={students} onUpdate={loadStudents} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
