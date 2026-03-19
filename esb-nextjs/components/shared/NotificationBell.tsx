'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCircle2, Clock, BookOpen, Loader2 } from 'lucide-react';
import { useMyNotifications } from '@/lib/hooks/useNotifications';
import { AppNotification } from '@/lib/api/notifications';
import Link from 'next/link';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  quiz_pending:    <Clock className="h-4 w-4 text-amber-500" />,
  grade_available: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  grading_needed:  <BookOpen className="h-4 w-4 text-bolt-accent" />,
};

function notifLink(n: AppNotification): string {
  if (n.course_id && n.section_id) return `/courses/${n.course_id}`;
  return '#';
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useMyNotifications();
  const unread = data?.unread ?? 0;
  const notifications = data?.notifications ?? [];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-full hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Bell className="h-5 w-5 text-bolt-ink" />
        )}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-[12px] border border-bolt-line bg-white shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-line">
            <span className="text-sm font-semibold text-bolt-ink">Notifications</span>
            {unread > 0 && (
              <span className="text-xs text-muted-foreground">{unread} non lue{unread > 1 ? 's' : ''}</span>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-bolt-line">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Aucune notification pour le moment.
              </div>
            ) : (
              notifications.map(n => (
                <Link
                  key={n.id}
                  href={notifLink(n)}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <span className="mt-0.5 shrink-0">{TYPE_ICONS[n.type] ?? <Bell className="h-4 w-4" />}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-bolt-ink leading-snug">{n.title}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    {n.created_at && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-bolt-line text-center">
              <span className="text-[11px] text-muted-foreground">Les notifications disparaissent une fois traitées.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
