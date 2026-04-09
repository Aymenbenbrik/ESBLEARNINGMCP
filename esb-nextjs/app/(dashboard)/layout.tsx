import { AppShell } from '@/components/layout/AppShell';
import { AssistantWidget } from '@/components/assistant/AssistantWidget';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {children}
      <AssistantWidget />
    </AppShell>
  );
}
