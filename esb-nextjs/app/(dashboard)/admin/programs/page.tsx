'use client';

import { usePrograms, useCreateProgram } from '@/lib/hooks/usePrograms';
import { CreateProgramForm } from '@/components/admin/CreateProgramForm';
import { ProgramCard } from '@/components/admin/ProgramCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, FolderOpen } from 'lucide-react';
import { CreateProgramData } from '@/lib/types/admin';

export default function ProgramsPage() {
  const { data, isLoading, error } = usePrograms();
  const createProgram = useCreateProgram();

  const handleCreateProgram = (data: CreateProgramData) => {
    createProgram.mutate(data);
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as any)?.response?.data?.error || 'Failed to load programs'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Programs Management</h1>
        <p className="text-muted-foreground">
          Create and manage academic programs, courses, and classes
        </p>
      </div>

      <CreateProgramForm
        onSubmit={handleCreateProgram}
        isLoading={createProgram.isPending}
      />

      <div>
        <h2 className="text-2xl font-semibold mb-4">All Programs</h2>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : data?.programs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Programs Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first program to get started
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data?.programs.map((program) => (
              <ProgramCard key={program.id} program={program} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
