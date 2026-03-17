'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirect if user is not a superuser
    if (!isLoading && (!user || !user.is_superuser)) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!user || !user.is_superuser) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to access this area. Superuser access required.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
