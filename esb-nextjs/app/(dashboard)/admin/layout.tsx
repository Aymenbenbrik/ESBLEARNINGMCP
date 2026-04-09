'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, GraduationCap, Users, BookOpen, Layers } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const adminNavLinks = [
  { href: '/admin/programs', label: 'Programmes', icon: Layers },
  { href: '/admin/teachers', label: 'Enseignants', icon: BookOpen },
  { href: '/admin/students', label: 'Étudiants', icon: Users },
  { href: '/admin/classes', label: 'Classes', icon: GraduationCap },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
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
            Accès réservé aux administrateurs.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto">
            {adminNavLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                pathname === link.href || pathname.startsWith(link.href + '/');
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-1.5 py-3 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </>
  );
}
