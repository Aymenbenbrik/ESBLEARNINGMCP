'use client';

import { User, Key, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function UserDropdown() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const userInitials = user.username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-bolt-line bg-bolt-surface px-3 py-2 hover:bg-bolt-ink/4 transition-colors outline-none focus:ring-2 focus:ring-bolt-accent/20">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-bolt-accent text-white text-xs font-bold">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <ChevronDown className="h-4 w-4 text-bolt-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 border-bolt-line rounded-[14px] shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
      >
        <div className="px-3 py-2">
          <p className="text-sm font-semibold text-bolt-ink">{user.username}</p>
          <p className="text-xs text-bolt-muted">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer font-semibold px-3 py-2.5"
          onClick={() => router.push('/profile')}
        >
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        {user.is_teacher && (
          <DropdownMenuItem
            className="cursor-pointer font-semibold px-3 py-2.5"
            onClick={() => router.push('/api-key')}
          >
            <Key className="mr-2 h-4 w-4" />
            API Key
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer font-semibold text-destructive px-3 py-2.5"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
