/** Test accounts created by `pnpm db:seed`. */
export const PASSWORD = 'TestPassword123!';

export const USERS = {
  admin: { email: 'admin@memento.local', file: 'e2e/.auth/admin.json' },
  editor: { email: 'editor@memento.local', file: 'e2e/.auth/editor.json' },
  viewer: { email: 'viewer@memento.local', file: 'e2e/.auth/viewer.json' },
  signout: { email: 'signout@memento.local', file: 'e2e/.auth/signout.json' },
} as const;

/** Fixed short codes from scripts/seed-data/constants.ts. */
export const CODES = {
  activeA: 'qaact2',
  activeB: 'qaact3',
  paused: 'qapau5',
  expired: 'qaexp5',
  limited: 'qalim5',
  pageLive: 'qapg2a',
  pageExpired: 'qapg3b',
} as const;

export const EMPTY_STATE = { cookies: [], origins: [] };
