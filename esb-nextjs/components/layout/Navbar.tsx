'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Plus } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { UserDropdown } from './UserDropdown';
import { useState } from 'react';
import { MobileNav } from './MobileNav';

export function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!isAuthenticated) return null;

  const navLinks = [
    { href: '/dashboard', label: 'Home', roles: ['all'] },
    { href: '/courses', label: 'Modules', roles: ['all'] },
    { href: '/question-bank', label: 'Question Bank', roles: ['all'] },
    { href: '/classes', label: 'Classes', roles: ['all'] },
    {
      href: user?.is_teacher ? '/teacher-dashboard' : '/student-dashboard',
      label: 'My Dashboard',
      roles: ['all'],
    },
    { href: '/students', label: 'Students', roles: ['teacher'] },
    { href: '/admin/programs', label: 'Admin', roles: ['superuser'] },
  ];

  const filteredLinks = navLinks.filter((link) => {
    if (link.roles.includes('all')) return true;
    if (link.roles.includes('teacher') && user?.is_teacher) return true;
    if (link.roles.includes('superuser') && user?.is_superuser) return true;
    return false;
  });

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-[1030] bg-bolt-bg/90 backdrop-blur-[10px] border-b border-bolt-line">
        <div className="max-w-[1240px] mx-auto px-[18px] py-3 flex items-center justify-between gap-3.5">
          {/* Brand */}
          <Link href="/dashboard" className="flex items-center gap-2.5 no-underline text-inherit">
            <div className="h-[30px] w-[30px] bg-bolt-accent rounded-lg flex items-center justify-center text-white font-bold text-sm">
              E
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight leading-tight">
                ESB Platform
              </div>
              <div className="text-[0.82rem] text-bolt-muted leading-tight">
                ESPRIT
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex gap-1.5 items-center">
            {filteredLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  no-underline px-3 py-2 rounded-full font-semibold text-[0.95rem] transition-colors
                  ${
                    pathname === link.href
                      ? 'bg-bolt-accent/10 text-bolt-accent'
                      : 'text-bolt-muted hover:bg-bolt-ink/6 hover:text-bolt-ink'
                  }
                `}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2">
            {/* New Module Button (Teachers only) */}
            {user?.is_teacher && (
              <Button
                asChild
                className="hidden md:inline-flex rounded-full bg-bolt-accent hover:bg-bolt-accent-600 text-white font-bold px-3.5 py-2.5 h-auto"
              >
                <Link href="/courses/new">
                  <Plus className="h-4 w-4 mr-2" />
                  New Module
                </Link>
              </Button>
            )}

            {/* User Dropdown */}
            <UserDropdown />

            {/* Mobile Menu Button */}
            <Button
              variant="outline"
              size="icon"
              className="md:hidden rounded-xl border-bolt-line bg-bolt-surface hover:bg-bolt-ink/4"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      <MobileNav
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        links={filteredLinks}
      />
    </>
  );
}
