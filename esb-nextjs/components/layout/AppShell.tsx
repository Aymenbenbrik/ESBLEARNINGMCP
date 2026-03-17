'use client';

import { Navbar } from './Navbar';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-bolt-bg">
      <Navbar />
      <main className="pt-[74px]">
        <div className="max-w-[1240px] mx-auto px-[18px] pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
