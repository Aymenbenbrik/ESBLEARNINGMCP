'use client';

import Link from 'next/link';
import { useMyClasses } from '@/lib/hooks/useClassChat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, BarChart3 } from 'lucide-react';

export default function ClassesPage() {
  const { data, isLoading, error } = useMyClasses();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unable to load classes. Please try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const classes = data?.classes ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Classes</h1>
        <p className="text-muted-foreground">
          Access your class dashboards and group chats.
        </p>
      </div>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <p className="text-sm text-muted-foreground">
              No classes available for your account.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {classes.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{c.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>
                    <span className="font-medium">Program:</span>{' '}
                    {c.program_name ?? '—'}
                  </div>
                  <div>
                    <span className="font-medium">Students:</span> {c.students_count}
                  </div>
                  <div>
                    <span className="font-medium">Modules:</span> {c.courses_count}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button asChild variant="outline" className="flex-1">
                    <Link href={`/classes/${c.id}/dashboard`}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Dashboard
                    </Link>
                  </Button>

                  <Button asChild className="flex-1">
                    <Link href={`/classes/${c.id}/chat`}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Chat
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
