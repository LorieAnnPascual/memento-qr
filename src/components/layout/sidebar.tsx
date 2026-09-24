'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { cn } from '@/lib/utils';

import { SIDEBAR_COOKIE } from './sidebar-cookie';
import { AppVersion } from './app-version';
import { SidebarNav } from './sidebar-nav';

interface SidebarProps {
  initialCollapsed?: boolean;
}

export function Sidebar({ initialCollapsed = false }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle(): void {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'hidden shrink-0 border-r bg-background transition-[width] duration-200 md:flex md:flex-col',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <Link
        href="/"
        aria-label="Memento QR home"
        title={collapsed ? 'Memento QR' : undefined}
        className={cn(
          'flex items-center gap-2 border-b py-4 font-semibold',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        <div className="relative h-8 w-8 shrink-0">
          <Image src="/logo.svg" alt="" fill className="object-contain" priority />
        </div>
        {!collapsed && (
          <>
            Memento QR
            <AppVersion />
          </>
        )}
      </Link>
      <SidebarNav collapsed={collapsed} />
      <div className={cn('mt-auto border-t p-2', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Show sidebar' : undefined}
          title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            collapsed && 'px-2',
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && 'Hide sidebar'}
        </button>
      </div>
    </aside>
  );
}
