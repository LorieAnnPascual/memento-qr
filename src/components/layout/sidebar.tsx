import Link from 'next/link';
import Image from 'next/image';

import { SidebarNav } from './sidebar-nav';

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-background md:flex md:flex-col">
      <Link href="/" className="flex items-center gap-2 border-b px-4 py-4 font-semibold">
        <div className="relative h-8 w-8 shrink-0">
          <Image src="/logo.svg" alt="" fill className="object-contain" priority />
        </div>
        Memento QR
      </Link>
      <SidebarNav />
    </aside>
  );
}
