'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface NavLink {
  href: string;
  label: string;
  roles: string[];
}

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: NavLink[];
}

export function MobileNav({ open, onOpenChange, links }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-3/4 sm:max-w-sm border-r border-bolt-line">
        <SheetHeader>
          <SheetTitle className="text-left font-extrabold text-lg">
            Navigation
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-2 mt-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => onOpenChange(false)}
              className={`
                no-underline px-4 py-3 rounded-xl font-semibold text-base transition-colors
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
        </nav>
      </SheetContent>
    </Sheet>
  );
}
