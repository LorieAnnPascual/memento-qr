/** Everything the QA seed creates is tagged so teardown can find it and nothing else. */
export const QA_PREFIX = '[QA]';
export const TEST_PASSWORD = 'TestPassword123!';

export const TEST_USERS = [
  { key: 'admin', email: 'admin@memento.local', fullName: 'QA Admin', role: 'admin' },
  { key: 'editor', email: 'editor@memento.local', fullName: 'QA Editor', role: 'member' },
  { key: 'viewer', email: 'viewer@memento.local', fullName: 'QA Viewer', role: 'member' },
  // Signing out revokes every session of that account, so the sign-out test gets its own.
  { key: 'signout', email: 'signout@memento.local', fullName: 'QA Signout', role: 'member' },
] as const;

export type TestUserKey = (typeof TEST_USERS)[number]['key'];

/** Fixed short codes so E2E tests can reach specific scenarios. */
export const QA_CODES = {
  activeA: 'qaact2',
  activeB: 'qaact3',
  paused: 'qapau5',
  expired: 'qaexp5',
  limited: 'qalim5',
  pageLive: 'qapg2a',
  pageExpired: 'qapg3b',
} as const;

/** The limit-scan QR has this limit and this many scans already logged. */
export const LIMITED_SCAN_LIMIT = 10;
export const LIMITED_SCANS_LOGGED = 9;

export const TOTAL_SCAN_EVENTS = 200;
export const SEED_RANDOM = 20260923;
