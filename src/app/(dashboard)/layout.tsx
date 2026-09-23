import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/get-current-user';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ThemeProvider } from '@/components/layout/theme-provider';

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <ThemeProvider>
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Header email={user.email} fullName={user.profile?.fullName ?? null} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
    </ThemeProvider>
  );
}
