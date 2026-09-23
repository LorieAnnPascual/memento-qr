import {
  Calendar,
  Contact,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Share2,
  Type,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

import type { QRType } from '@/types/qr';

const QR_TYPE_ICONS: Record<QRType, LucideIcon> = {
  url: Globe,
  text: Type,
  phone: Phone,
  sms: MessageSquare,
  email: Mail,
  wifi: Wifi,
  vcard: Contact,
  whatsapp: MessageCircle,
  event: Calendar,
  location: MapPin,
  social: Share2,
};

export function getQRTypeIcon(type: QRType): LucideIcon {
  return QR_TYPE_ICONS[type];
}
