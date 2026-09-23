import type { Data } from '@puckeditor/core';

import { SYSTEM_PAGE_TEMPLATES } from '../../src/lib/pages/templates';
import { BLANK_PAGE } from '../../src/lib/pages/templates';
import { QA_CODES, QA_PREFIX } from './constants';

export interface SeedPage {
  name: string;
  category: string;
  description: string;
  puckData: Data;
  isPublished: boolean;
  shortCode: string | null;
  /** Hours from now; negative = already expired. */
  expiresInHours: number | null;
}

function template(id: string): Data {
  const found = SYSTEM_PAGE_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`System page template "${id}" not found`);
  // Deep copy so seeding never shares references with the shipped templates.
  return JSON.parse(JSON.stringify(found.puckData)) as Data;
}

/** One per category (Memorial, Business, Event, blank): one live, one published-but-expired, two unpublished. */
export const SEED_PAGES: SeedPage[] = [
  {
    name: `${QA_PREFIX} Memorial live`,
    category: 'memorial',
    description: 'Published, no expiry',
    puckData: template('memorial'),
    isPublished: true,
    shortCode: QA_CODES.pageLive,
    expiresInHours: null,
  },
  {
    name: `${QA_PREFIX} Business expired`,
    category: 'business',
    description: 'Published but past its expiry',
    puckData: template('business-card'),
    isPublished: true,
    shortCode: QA_CODES.pageExpired,
    expiresInHours: -24,
  },
  {
    name: `${QA_PREFIX} Event draft`,
    category: 'event',
    description: 'Not published',
    puckData: template('event'),
    isPublished: false,
    shortCode: null,
    expiresInHours: null,
  },
  {
    name: `${QA_PREFIX} Blank draft`,
    category: 'custom',
    description: 'Not published',
    puckData: JSON.parse(JSON.stringify(BLANK_PAGE)) as Data,
    isPublished: false,
    shortCode: null,
    expiresInHours: null,
  },
];
