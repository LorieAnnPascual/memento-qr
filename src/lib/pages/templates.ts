import type { Data } from '@puckeditor/core';

import type { PageProps, RootProps } from '@/components/pages/puck-config';

export const PAGE_TEMPLATE_CATEGORIES = [
  'memorial',
  'business',
  'event',
  'social',
  'pet',
  'restaurant',
  'custom',
] as const;

export type PageTemplateCategory = (typeof PAGE_TEMPLATE_CATEGORIES)[number];

export interface SystemPageTemplate {
  id: string;
  name: string;
  category: PageTemplateCategory;
  description: string;
  puckData: Data;
}

type ComponentName = keyof PageProps;

function block<T extends ComponentName>(type: T, id: string, props: Partial<PageProps[T]>) {
  return { type, props: { id, ...props } };
}

function page(root: Partial<RootProps>, content: ReturnType<typeof block>[]): Data {
  return { root: { props: root }, content, zones: {} } as Data;
}

export const BLANK_PAGE: Data = { root: { props: {} }, content: [], zones: {} };

export const SYSTEM_PAGE_TEMPLATES: SystemPageTemplate[] = [
  {
    id: 'memorial',
    name: 'Memorial Page',
    category: 'memorial',
    description: 'A quiet, dignified tribute page with a life story and a place for photos.',
    puckData: page({ fontFamily: 'elegant', pageBackground: '#faf9f6', pageTextColor: '#2c3e50' }, [
      block('HeroSection', 'memorial-hero', {
        title: 'In Loving Memory',
        subtitle: 'Full Name · 1950 – 2026',
        backgroundColor: '#2c3e50',
        textColor: '#faf9f6',
      }),
      block('TextBlock', 'memorial-story', {
        heading: 'Their Story',
        content: 'Share a few paragraphs about their life, what they loved, and the people they cherished.',
        backgroundColor: '#faf9f6',
        textColor: '#2c3e50',
      }),
      block('ImageGallery', 'memorial-gallery', { images: [], columns: '3' }),
      block('TextBlock', 'memorial-message', {
        heading: 'Leave a Memory',
        content: 'Family and friends are welcome to share their memories and condolences.',
        backgroundColor: '#f1ede4',
        textColor: '#2c3e50',
      }),
      block('Footer', 'memorial-footer', { text: 'Forever in our hearts', backgroundColor: '#2c3e50' }),
    ]),
  },
  {
    id: 'pet-profile',
    name: 'Pet Profile',
    category: 'pet',
    description: 'A friendly profile for a pet tag: name, photo and how to reach the owner.',
    puckData: page({ fontFamily: 'sans', pageBackground: '#f0fdf4', pageTextColor: '#14532d' }, [
      block('HeroSection', 'pet-hero', {
        title: "Hi, I'm Buddy!",
        subtitle: "If you found me, I'm probably lost. Please call my family.",
        backgroundColor: '#2d6a4f',
        textColor: '#ffffff',
      }),
      block('ContactCard', 'pet-contact', { name: 'Owner Name', phone: '+63 900 000 0000', email: '', address: '' }),
      block('TextBlock', 'pet-notes', {
        heading: 'About Me',
        content: 'Breed, age, medical needs, and anything helpful for someone looking after me.',
        backgroundColor: '#f0fdf4',
        textColor: '#14532d',
      }),
      block('Footer', 'pet-footer', { text: 'Thank you for helping me get home!', backgroundColor: '#2d6a4f' }),
    ]),
  },
  {
    id: 'business-card',
    name: 'Business Card',
    category: 'business',
    description: 'A digital business card with contact details, links and a map.',
    puckData: page({ fontFamily: 'sans', pageBackground: '#ffffff', pageTextColor: '#0a2540' }, [
      block('HeroSection', 'biz-hero', {
        title: 'Your Name',
        subtitle: 'Job Title · Company',
        ctaText: 'Visit our website',
        ctaUrl: 'https://example.com',
        backgroundColor: '#0a2540',
        textColor: '#ffffff',
      }),
      block('ContactCard', 'biz-contact', {
        name: 'Get in touch',
        phone: '+63 900 000 0000',
        email: 'you@example.com',
        address: 'Street, City',
      }),
      block('SocialLinks', 'biz-social', {
        links: [
          { label: 'LinkedIn', url: 'https://linkedin.com' },
          { label: 'Website', url: 'https://example.com' },
        ],
      }),
      block('MapEmbed', 'biz-map', { address: 'Manila, Philippines' }),
      block('Footer', 'biz-footer', { text: '© Your Company', backgroundColor: '#0a2540' }),
    ]),
  },
  {
    id: 'event',
    name: 'Event Invitation',
    category: 'event',
    description: 'An invitation with the details, venue map and RSVP contact.',
    puckData: page({ fontFamily: 'serif', pageBackground: '#fbf8f1', pageTextColor: '#23334e' }, [
      block('HeroSection', 'event-hero', {
        title: "You're Invited",
        subtitle: 'Saturday, 1 January · 6:00 PM',
        ctaText: 'RSVP',
        ctaUrl: 'mailto:host@example.com',
        backgroundColor: '#8b6914',
        textColor: '#ffffff',
      }),
      block('TextBlock', 'event-details', {
        heading: 'Details',
        content: 'Tell guests what to expect, the dress code, and any special notes.',
        backgroundColor: '#fbf8f1',
        textColor: '#23334e',
      }),
      block('MapEmbed', 'event-map', { address: 'Venue name, City' }),
      block('ContactCard', 'event-contact', { name: 'Questions?', phone: '', email: 'host@example.com', address: '' }),
      block('Footer', 'event-footer', { text: 'We hope to see you there', backgroundColor: '#8b6914' }),
    ]),
  },
  {
    id: 'restaurant-menu',
    name: 'Restaurant Menu',
    category: 'restaurant',
    description: 'A simple menu page with sections, photos and location.',
    puckData: page({ fontFamily: 'serif', pageBackground: '#fefae0', pageTextColor: '#3b1f14' }, [
      block('HeroSection', 'menu-hero', {
        title: 'Restaurant Name',
        subtitle: 'Open daily · 10:00 AM – 10:00 PM',
        backgroundColor: '#6b2737',
        textColor: '#fefae0',
      }),
      block('TextBlock', 'menu-starters', {
        heading: 'Starters',
        content: 'Dish one — 120\nDish two — 150\nDish three — 180',
        backgroundColor: '#fefae0',
        textColor: '#3b1f14',
      }),
      block('TextBlock', 'menu-mains', {
        heading: 'Mains',
        content: 'Dish one — 320\nDish two — 380\nDish three — 420',
        backgroundColor: '#f7f0c6',
        textColor: '#3b1f14',
      }),
      block('ImageGallery', 'menu-gallery', { images: [], columns: '3' }),
      block('MapEmbed', 'menu-map', { address: 'Restaurant address, City' }),
      block('Footer', 'menu-footer', { text: 'Thank you for dining with us', backgroundColor: '#6b2737' }),
    ]),
  },
];
