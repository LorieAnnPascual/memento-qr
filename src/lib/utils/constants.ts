import type { LucideIcon } from 'lucide-react';
import { BarChart3, FileText, History, Images, LayoutDashboard, QrCode, Settings, SwatchBook } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'QR Codes', href: '/qr', icon: QrCode },
  { label: 'Templates', href: '/templates', icon: SwatchBook },
  { label: 'Pages', href: '/pages', icon: FileText },
  { label: 'Media', href: '/media', icon: Images },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Activity', href: '/activity', icon: History },
  { label: 'Settings', href: '/settings', icon: Settings },
];
