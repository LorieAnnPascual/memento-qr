# CLAUDE.md — Memento QR Code Generator

This file is the development reference for Claude Code. Read this before writing any code.

For full architecture details (database schema, API routes, QR generation code, payload formats, templates, Puck integration, and phased roadmap), see `docs/architecture.md` — the comprehensive technical specification for this project.

## Implementation Notes (deviations from the spec, and why)

The project was scaffolded with **Next.js 16**, which is newer than this spec assumed. `AGENTS.md` points at the bundled version-matched docs in `node_modules/next/dist/docs/` — read the relevant guide there before touching routing, caching, or middleware, since APIs may differ from training data. Concretely:

- **`params`/`searchParams` are `Promise`s** in `page.tsx`/`layout.tsx`/route handlers (Next 15 compat sync access was removed in 16). Always `await params`. Use the generated `PageProps<'/route'>` / `LayoutProps<'/route'>` / `RouteContext` helpers instead of hand-written prop types.
- **`middleware.ts` → `proxy.ts`**: the auth guard lives in [`src/proxy.ts`](src/proxy.ts) (it must sit next to `app/`, i.e. inside `src/`, or Next.js silently never runs it) calling [`src/lib/auth/middleware.ts`](src/lib/auth/middleware.ts)'s `updateSession()`. `middleware.ts` is deprecated in Next 16; `proxy` always runs on the `nodejs` runtime (no `edge` option).
- **shadcn/ui CLI v4** generates a `cn` re-export from the `cn` npm package in `src/lib/utils.ts` instead of a hand-written `clsx` + `tailwind-merge` merge function. Functionally equivalent — keep using `cn()` from `@/lib/utils` as documented below.
- Only `user_profiles`, `qr_codes`, `qr_templates`, `page_templates`, `scan_events`, and `uploaded_files` exist in `src/lib/db/schema.ts` so far (Phase 1 Week 1 scope). No migrations have been run yet — run `pnpm db:push` once real Supabase credentials are in `.env.local`.
- There is no public sign-up. After creating a user in the Supabase dashboard (Authentication → Users), run `pnpm db:seed-user -- --auth-id=<uuid> --email=<email> --name="Full Name" --role=admin` to link it to a `user_profiles` row (see [`src/lib/db/seed.ts`](src/lib/db/seed.ts)).
- **Phase 3 (page builder) deviations:** Puck is installed as `@puckeditor/core` (the maintained successor of `@measured/puck`). Next.js forbids `react-dom/server` in server-side code, so HTML export and template previews are built **in the browser** (`src/lib/pages/download-html.ts`, exporter in `html-exporter.tsx`) and there is no `GET /api/pages/[id]/export`; the public `/p/[shortCode]` is a Server Component using Puck's server `Render`. Page routes use camelCase bodies (`expiresAt`) like the QR routes. Everything a team member types that reaches public HTML goes through `src/lib/pages/sanitize.ts`; the live page also gets a CSP from `next.config.ts`. Seed page templates with `pnpm db:seed-page-templates`.
- **Page builder blocks & background:** the Puck root has page background color, image (upload via `/api/upload` or URL), fit, fixed scrolling and darkening overlay. Blocks: Hero, Text, Button, FAQ, Image, Gallery, Video, Map, Columns (slots), Spacer, Divider, Contact, Social, Footer. Gallery/social links/FAQ are array fields; older text-list data is upgraded by `src/lib/pages/normalize.ts` (applied in the editor, exporter and public page). Rich text is deliberately not used (unsanitized HTML on public pages).
- **Phase 4 (polish):** folders (`folders` table, `qr_codes.folder_id`, deleting a folder keeps its codes), CSV batch import (`/qr/batch`, `src/lib/qr/batch.ts` is shared by the browser preview and the server re-validation; url/text/phone/email only, max 200 rows), a team-wide activity log (`activity_log`; call `logActivity()` from `src/lib/activity/log-activity.ts` in any new mutating route; it never throws and can fold repeats with `collapseWithinMs`), dark mode (`next-themes`, mounted only in the dashboard layout so public pages are unaffected), QR comparison (`/qr/compare`, plus Duplicate on the list for A/B variants), and JSON backup (`GET /api/export`, admins may pass `?scope=team`). The `/q/[shortCode]` redirect now claims a scan with one conditional `UPDATE ... RETURNING` (one DB round trip, and the scan limit can no longer be overshot by concurrent scans); the refusal reasons are looked up only when that claim fails. Scan notifications were skipped (the project has no email sending). Restoring a backup (`POST /api/import`, Settings → Your data) only adds what is missing into the signed-in user's account (`src/lib/export/parse-backup.ts`, `restore-backup.ts`); scan history is not restored.
- **QA tooling:** `pnpm db:seed` / `pnpm db:teardown` create and remove tagged QA data plus 4 test users (@memento.local, password in `scripts/seed-data/constants.ts`); they refuse to run unless `NEXT_PUBLIC_APP_URL` is localhost. E2E (`pnpm build && pnpm test:e2e`, Playwright, desktop + Pixel 5 + iPhone 13 for `@mobile` tests) runs against a production build on the seeded data; always run `pnpm db:teardown` afterwards, especially before going live. Coverage thresholds are per area in `vitest.config.mts` (UI/canvas code is covered by E2E). Upload content is verified from file bytes (`src/lib/upload/sniff-image.ts`). `/api/cron/keep-alive` (see `vercel.json`) needs `CRON_SECRET`. Manual checks: `docs/qa/manual-checklist.md`.
- Testing infrastructure (Vitest/Playwright configs described below) has not been set up yet — it should be added alongside the first feature that needs it (Phase 1 Week 2, QR payload builders).

---

## Project Overview

**What:** Internal QR code generator for a 6-person team.
**Not:** A customer-facing platform. No public sign-up, no e-commerce, no payments.

Core features: 11 general-purpose QR types with advanced styling, dynamic QR codes with changeable URLs, scan analytics with geo/device tracking, drag-and-drop landing page builder with HTML export and live publishing (shareable URLs with optional expiration).

Runs on a free Vercel subdomain (`*.vercel.app`). Zero recurring costs.

---

## Tech Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Framework | Next.js (App Router) | TypeScript strict mode |
| Styling | Tailwind CSS v4+ | With shadcn/ui components |
| QR Engine | qr-code-styling v1.5.0+ | Client-side, MIT |
| Database | Supabase PostgreSQL | Free tier, 500 MB |
| ORM | Drizzle ORM | Lightweight, type-safe, edge-native |
| Auth | Supabase Auth | Built-in, handles auth emails |
| Storage | Supabase Storage | Free tier, 1 GB |
| Page Builder | Puck | MIT, React-native visual editor |
| Charts | Recharts | For scan analytics dashboards |
| Device Detection | ua-parser-js | User-agent parsing |
| Geo Lookup | ip-api.com | Free, 45 req/min, no API key |
| Short Codes | nanoid | Custom safe alphabet, 6-char |
| Hosting | Vercel Hobby | Free tier |
| Package Manager | pnpm | Required — do not use npm or yarn |
| Unit Testing | Vitest + React Testing Library | Fast, Vite-native |
| E2E Testing | Playwright | Chromium-only for this project |
| Linting | ESLint + @typescript-eslint/strict | Next.js defaults extended |
| Formatting | Prettier | Single quotes, trailing commas, 100 chars |

---

## Project Structure

```
memento-qr/
├── public/
│   └── logos/                          # Default logos/icons
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx              # Sidebar + header layout
│   │   │   ├── page.tsx                # Dashboard home
│   │   │   ├── qr/
│   │   │   │   ├── page.tsx            # QR code list
│   │   │   │   ├── new/page.tsx        # QR designer
│   │   │   │   └── [id]/page.tsx       # Edit QR
│   │   │   ├── templates/page.tsx      # QR design templates
│   │   │   ├── pages/
│   │   │   │   ├── page.tsx            # Landing page templates list
│   │   │   │   ├── new/page.tsx        # Puck editor
│   │   │   │   └── [id]/page.tsx       # Edit page template
│   │   │   └── analytics/page.tsx      # Scan analytics dashboard
│   │   ├── q/[shortCode]/route.ts      # Dynamic QR redirect (PUBLIC)
│   │   ├── p/[shortCode]/page.tsx      # Published landing page (PUBLIC, SSR)
│   │   ├── api/                        # API route handlers
│   │   ├── layout.tsx                  # Root layout
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                         # shadcn/ui components
│   │   ├── qr/                         # QR-specific components
│   │   ├── analytics/                  # Chart components
│   │   └── pages/                      # Puck custom components
│   ├── lib/
│   │   ├── qr/
│   │   │   ├── generator.ts            # QR code generation
│   │   │   ├── payloads.ts             # 11 QR type payload builders
│   │   │   ├── templates.ts            # System template definitions
│   │   │   └── short-code.ts           # nanoid short code generation
│   │   ├── analytics/
│   │   │   ├── device-parser.ts        # ua-parser-js wrapper
│   │   │   └── geo-lookup.ts           # ip-api.com client
│   │   ├── pages/
│   │   │   ├── puck-config.ts          # Puck component configs
│   │   │   ├── html-exporter.ts        # HTML export function
│   │   │   └── page-publisher.ts       # Publish/unpublish helpers + status
│   │   ├── auth/
│   │   │   ├── supabase-client.ts      # Browser client
│   │   │   ├── supabase-server.ts      # Server client (cookies)
│   │   │   └── middleware.ts           # Auth middleware
│   │   ├── db/
│   │   │   ├── schema.ts              # Drizzle schema (all tables)
│   │   │   ├── index.ts               # Drizzle client instance
│   │   │   └── migrations/            # Generated migration files
│   │   ├── storage.ts                  # Supabase Storage helpers
│   │   └── utils.ts                    # Shared utilities (cn, etc.)
│   ├── hooks/
│   │   └── use-qr-code.ts              # QR preview hook
│   └── types/
│       └── index.ts                    # Shared TypeScript types
├── __tests__/                          # Unit + integration tests
│   ├── lib/
│   │   ├── qr/
│   │   │   ├── generator.test.ts
│   │   │   ├── payloads.test.ts
│   │   │   └── short-code.test.ts
│   │   ├── analytics/
│   │   │   ├── device-parser.test.ts
│   │   │   └── geo-lookup.test.ts
│   │   ├── pages/
│   │   │   ├── html-exporter.test.ts
│   │   │   └── page-publisher.test.ts
│   │   └── storage.test.ts
│   ├── api/
│   │   ├── qr.test.ts
│   │   ├── templates.test.ts
│   │   ├── pages.test.ts
│   │   ├── pages-publish.test.ts
│   │   ├── pages-expiry.test.ts
│   │   ├── analytics.test.ts
│   │   └── redirect.test.ts
│   └── components/
│       ├── qr/
│       └── analytics/
├── e2e/                                # Playwright E2E tests
│   ├── auth.spec.ts
│   ├── qr-generator.spec.ts
│   ├── qr-templates.spec.ts
│   ├── dynamic-qr.spec.ts
│   ├── analytics.spec.ts
│   └── page-builder.spec.ts
├── drizzle.config.ts
├── vitest.config.mts
├── playwright.config.ts
├── .env.local                          # Local env (never commit)
├── .env.example                        # Template for env vars
├── middleware.ts                        # Next.js middleware (auth)
└── next.config.ts
```

---

## Code Conventions

### TypeScript

- **Strict mode is mandatory.** No `any` types. Use `unknown` and narrow.
- Explicit return types on all exported functions.
- Use `interface` for object shapes, `type` for unions/intersections.
- Prefer `const` assertions and `as const` for literals.
- Exhaustive switch statements with `never` checks.

```typescript
// Good
export function getQRType(type: QRType): string {
  switch (type) {
    case 'url': return 'URL';
    case 'vcard': return 'Contact';
    // ... all cases
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown QR type: ${_exhaustive}`);
    }
  }
}

// Bad
export function getQRType(type: any) { ... }
```

### File Naming

- **Files and folders:** `kebab-case` (`qr-designer.tsx`, `device-parser.ts`)
- **Components:** `PascalCase` exports (`QRDesigner`, `ScanChart`)
- **Hooks:** `camelCase` with `use` prefix (`useQRCode`, `useScanData`)
- **Types:** `PascalCase` (`QRDesignConfig`, `ScanEvent`)
- **Constants:** `UPPER_SNAKE_CASE` (`SAFE_ALPHABET`, `MAX_SCAN_LIMIT`)

### Imports

- Use `@/` path alias for all imports from `src/`.
- Group imports in this order: (1) React/Next, (2) external packages, (3) `@/` internal, (4) relative. Separate groups with blank lines.

```typescript
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { createQRCode } from '@/lib/qr/generator';
import { cn } from '@/lib/utils';

import { QRPreview } from './qr-preview';
```

### Components

- **Server Components by default.** Only add `'use client'` when the component needs browser APIs, event handlers, hooks, or state.
- Client Components that need interactivity: forms, QR preview canvas, Puck editor, Recharts.
- Keep Client Components small — extract the interactive part, keep data fetching in Server Components.
- Use `shadcn/ui` as the base. Customize with Tailwind classes, do not override component internals.
- Composition over prop drilling. Use React Context sparingly and only within feature boundaries.

```typescript
// Good: Server Component fetches, passes to Client Component
// app/(dashboard)/qr/page.tsx (Server Component)
export default async function QRListPage() {
  const qrCodes = await getQRCodes();
  return <QRCodeList initialData={qrCodes} />;
}

// components/qr/qr-code-list.tsx (Client Component)
'use client';
export function QRCodeList({ initialData }: { initialData: QRCode[] }) {
  // Client-side interactivity here
}
```

### Error Handling

**API Routes:** Return consistent JSON error responses. Always include an error code.

```typescript
// Consistent API error shape
type APIError = {
  error: string;     // Human-readable message
  code: string;      // Machine-readable code (e.g., 'QR_NOT_FOUND')
};

// In route handlers
if (!qrCode) {
  return Response.json(
    { error: 'QR code not found', code: 'QR_NOT_FOUND' },
    { status: 404 }
  );
}
```

**Client-side:** Use `sonner` toast notifications for user-facing errors.

```typescript
import { toast } from 'sonner';

try {
  await saveQRCode(data);
  toast.success('QR code saved');
} catch (error) {
  toast.error('Failed to save QR code. Please try again.');
  console.error('QR save error:', error);
}
```

**Never swallow errors silently.** Always log to console at minimum. Use `console.error` for caught exceptions, never `console.log`.

**Geo lookup and non-critical services:** Use timeouts and graceful degradation. A geo lookup failure must never block a QR redirect.

```typescript
// Good: geo failure degrades gracefully
const geo = await lookupGeo(ip).catch(() => null);
// redirect happens regardless
```

### Database Conventions

- **UUIDs** for all primary keys (`gen_random_uuid()`).
- **Timestamps** on every table: `created_at` (default `now()`), `updated_at` (updated via trigger or application code).
- **Soft delete** preferred over hard delete for QR codes — add `deleted_at` column and filter in queries.
- **JSONB** for flexible config: QR `style_config`, Puck `puck_data`. Always validate JSONB shape at the application layer before writing.
- **Atomic operations** for scan counters — use `sql\`scan_count + 1\`` instead of read-then-write.
- **Indexes** on: `short_code` (unique), `user_id` (FK lookups), `status` (filtering), `scanned_at` (range queries), `country` (analytics grouping).

### Drizzle ORM

- Schema defined in `src/db/schema.ts` using Drizzle's TypeScript API.
- Run `pnpm drizzle-kit generate` to create migrations after schema changes.
- Run `pnpm drizzle-kit push` for development, `pnpm drizzle-kit migrate` for production.
- Always use Drizzle query builder — no raw SQL except for complex analytics aggregations.

---

## Testing Strategy

Testing is organized in three tiers. Each tier has a specific purpose and scope.

### Tier 1: Unit Tests (Vitest + React Testing Library)

Fast, isolated tests for pure logic and component rendering. These run in milliseconds and should cover the majority of the codebase.

**Setup:** `vitest.config.mts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**', 'src/components/**'],
      exclude: ['src/components/ui/**'],  // shadcn/ui is third-party
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
```

**Test setup file:** `__tests__/setup.ts`

```typescript
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Mock Supabase client globally
vi.mock('@/lib/auth/supabase-client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    storage: { from: vi.fn() },
  })),
}));
```

**What to unit test and how:**

| Area | What to Test | Example |
| --- | --- | --- |
| QR Payloads (`src/lib/qr/payloads.ts`) | Every payload builder produces correct format strings | `buildWifiPayload()` returns valid `WIFI:T:...` string with escaped special chars |
| QR Generator (`src/lib/qr/generator.ts`) | `createQRCode()` returns a QRCodeStyling instance with correct options | Config mapping, default values, gradient handling |
| Short Codes (`src/lib/short-code.ts`) | Generates correct length, uses only safe alphabet, no collisions in batch | Generate 10,000 codes, assert uniqueness and character set |
| Device Parser (`src/lib/analytics/device-parser.ts`) | Parses common user-agent strings correctly | Chrome on Windows, Safari on iPhone, bot detection |
| Geo Lookup (`src/lib/analytics/geo-lookup.ts`) | Handles success, timeout, private IPs, API errors | Mock `fetch`, test each code path |
| HTML Exporter (`src/lib/pages/html-exporter.ts`) | Produces valid self-contained HTML | Check for `<!DOCTYPE html>`, inline styles, no external references |
| Page Publisher (`src/lib/pages/page-publisher.ts`) | `getPublishStatus()` returns correct status, handles expired/unpublished states | Published page returns URL, expired page has `isExpired: true`, unpublished returns `isPublished: false` |
| Components | Renders correctly, handles user interaction | Click template card, fill QR form, toggle dynamic mode |
| Utility functions | Edge cases, input validation | `cn()` merging, date formatting, URL validation |

**Example test file:** `__tests__/lib/qr/payloads.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildUrlPayload,
  buildWifiPayload,
  buildVCardPayload,
  buildPhonePayload,
  buildSmsPayload,
  buildEmailPayload,
  buildWhatsAppPayload,
  buildEventPayload,
  buildLocationPayload,
} from '@/lib/qr/payloads';

describe('QR Payload Builders', () => {
  describe('buildUrlPayload', () => {
    it('returns the URL as-is', () => {
      expect(buildUrlPayload('https://example.com')).toBe('https://example.com');
    });

    it('adds https:// if no protocol is provided', () => {
      expect(buildUrlPayload('example.com')).toBe('https://example.com');
    });
  });

  describe('buildWifiPayload', () => {
    it('generates valid WIFI QR string', () => {
      const result = buildWifiPayload('MyNetwork', 'secret123', 'WPA', false);
      expect(result).toBe('WIFI:T:WPA;S:MyNetwork;P:secret123;H:false;;');
    });

    it('escapes special characters in SSID and password', () => {
      const result = buildWifiPayload('Net;work', 'pass:word', 'WPA', false);
      expect(result).toContain('S:Net\\;work');
      expect(result).toContain('P:pass\\:word');
    });

    it('handles hidden network flag', () => {
      const result = buildWifiPayload('Hidden', 'pass', 'WPA', true);
      expect(result).toContain('H:true');
    });

    it('handles no-password networks', () => {
      const result = buildWifiPayload('OpenNet', 'nopass', '', false);
      expect(result).toBe('WIFI:T:nopass;S:OpenNet;P:;H:false;;');
    });
  });

  describe('buildVCardPayload', () => {
    it('generates valid vCard 3.0 format', () => {
      const result = buildVCardPayload({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        phone: '+639171234567',
        email: 'juan@example.com',
      });
      expect(result).toContain('BEGIN:VCARD');
      expect(result).toContain('VERSION:3.0');
      expect(result).toContain('FN:Juan Dela Cruz');
      expect(result).toContain('TEL;TYPE=WORK,VOICE:+639171234567');
      expect(result).toContain('EMAIL:juan@example.com');
      expect(result).toContain('END:VCARD');
    });

    it('omits optional fields when not provided', () => {
      const result = buildVCardPayload({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
      });
      expect(result).not.toContain('TEL');
      expect(result).not.toContain('EMAIL');
      expect(result).not.toContain('ORG');
    });
  });

  describe('buildPhonePayload', () => {
    it('generates tel: URI', () => {
      expect(buildPhonePayload('+639171234567')).toBe('tel:+639171234567');
    });
  });

  // ... similar thorough tests for each payload builder
});
```

**Testing conventions for unit tests:**

- Use `describe` blocks to group tests by function/component.
- Use `it` with a sentence describing expected behavior (`it('escapes special characters in SSID')`).
- One assertion per test where practical; multiple assertions are fine when testing one logical behavior.
- Mock external dependencies (Supabase, fetch) — never hit real APIs in unit tests.
- Test edge cases: empty strings, undefined optionals, special characters, boundary values.
- Test error paths: what happens when inputs are invalid.

### Tier 2: Integration Tests (Vitest)

Tests that exercise API route handlers with a mocked database layer. These verify that the request/response contract is correct.

**What to test:**

| Route | Test Cases |
| --- | --- |
| `POST /api/qr` | Creates QR code with valid data; rejects invalid payload; returns 401 without auth |
| `GET /api/qr` | Returns paginated list; filters by status, type; returns empty for no results |
| `PUT /api/qr/[id]` | Updates fields; rejects non-existent ID; validates style_config shape |
| `DELETE /api/qr/[id]` | Soft-deletes; returns 404 for non-existent; prevents deleting another user's QR |
| `GET /q/[shortCode]` | Redirects with 302; returns 404 for unknown code; respects pause/expiry/scan limit; logs scan event |
| `GET /api/analytics` | Returns aggregated data; respects date range filters; handles empty data |
| `POST /api/upload` | Accepts valid file types; rejects oversized files; returns storage URL |
| `GET /api/pages/[id]/export` | Returns valid HTML; includes inline styles; handles missing template |
| `POST /api/pages/[id]/publish` | Publishes page with short code; returns 404 for non-existent page; returns 401 without auth |
| `DELETE /api/pages/[id]/publish` | Unpublishes page (preserves short code); returns 404 for non-existent page |
| `PUT /api/pages/[id]/expiry` | Sets expiration date; removes expiration when null; rejects past dates; returns 404 for non-existent page |
| `GET /p/[shortCode]` | Renders published page; returns 404 for unknown/unpublished code; shows expired message for expired pages |

**Example pattern for API route integration tests:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the database module
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock auth
vi.mock('@/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'test-user-id' } } })),
    },
  })),
}));

describe('POST /api/qr', () => {
  it('creates a QR code with valid data', async () => {
    const { POST } = await import('@/app/api/qr/route');
    const request = new NextRequest('http://localhost:3000/api/qr', {
      method: 'POST',
      body: JSON.stringify({
        qr_type: 'url',
        payload: 'https://example.com',
        style_config: { dotStyle: 'rounded', dotColor: '#000000' },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.id).toBeDefined();
    expect(body.qr_type).toBe('url');
  });

  it('returns 400 for missing required fields', async () => {
    const { POST } = await import('@/app/api/qr/route');
    const request = new NextRequest('http://localhost:3000/api/qr', {
      method: 'POST',
      body: JSON.stringify({ qr_type: 'url' }), // missing payload
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without authentication', async () => {
    // Override auth mock to return no user
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    });

    const { POST } = await import('@/app/api/qr/route');
    const request = new NextRequest('http://localhost:3000/api/qr', {
      method: 'POST',
      body: JSON.stringify({
        qr_type: 'url',
        payload: 'https://example.com',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
```

### Tier 3: E2E Tests (Playwright)

Full browser tests that run against the actual application. These are the slowest but most realistic tests.

**Setup:** `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile viewport for responsive testing
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

**What E2E tests cover:**

| Test File | Scenarios |
| --- | --- |
| `auth.spec.ts` | Login flow, redirect to dashboard after login, protected route redirect to login, logout |
| `qr-generator.spec.ts` | Select QR type, fill form, see live preview, change styling, download PNG/SVG, save to database |
| `qr-templates.spec.ts` | Browse templates, apply template to designer, edit template, create from scratch |
| `dynamic-qr.spec.ts` | Create dynamic QR, scan redirect works, change target URL, pause/unpause, verify scan is logged |
| `analytics.spec.ts` | Dashboard loads charts, date range filter works, per-QR drill-down shows data |
| `page-builder.spec.ts` | Open Puck editor, drag components, edit content, export HTML, verify downloaded file, publish page and get shareable URL, visit published page, set expiration date, verify expired page shows expiration message, unpublish page and verify 404 |

**Example E2E test:**

```typescript
// e2e/qr-generator.spec.ts
import { test, expect } from '@playwright/test';

test.describe('QR Code Generator', () => {
  test.beforeEach(async ({ page }) => {
    // Login helper (use a test account seeded in the database)
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@memento.local');
    await page.fill('[name="password"]', 'test-password-123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('generates a URL QR code with live preview', async ({ page }) => {
    await page.goto('/qr/new');

    // Select URL type
    await page.click('[data-testid="qr-type-url"]');

    // Enter URL
    await page.fill('[name="url"]', 'https://example.com');

    // Verify live preview renders (canvas or SVG element appears)
    const preview = page.locator('[data-testid="qr-preview"] canvas, [data-testid="qr-preview"] svg');
    await expect(preview).toBeVisible({ timeout: 5000 });
  });

  test('applies a template and customizes it', async ({ page }) => {
    await page.goto('/qr/new');
    await page.click('[data-testid="qr-type-url"]');
    await page.fill('[name="url"]', 'https://example.com');

    // Open template picker
    await page.click('[data-testid="template-picker"]');

    // Select "Business Blue" template
    await page.click('[data-testid="template-business-blue"]');

    // Verify dot style changed to the template's setting
    const dotStyleSelect = page.locator('[data-testid="dot-style-select"]');
    await expect(dotStyleSelect).toHaveValue('rounded');
  });

  test('saves a QR code to the database', async ({ page }) => {
    await page.goto('/qr/new');
    await page.click('[data-testid="qr-type-url"]');
    await page.fill('[name="url"]', 'https://example.com');
    await page.click('[data-testid="save-qr"]');

    // Should show success toast
    await expect(page.locator('[data-sonner-toast]')).toContainText('saved');

    // Should redirect or show in list
    await page.goto('/qr');
    await expect(page.locator('text=https://example.com')).toBeVisible();
  });

  test('downloads QR code as PNG', async ({ page }) => {
    await page.goto('/qr/new');
    await page.click('[data-testid="qr-type-url"]');
    await page.fill('[name="url"]', 'https://example.com');

    // Trigger download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-png"]'),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.png$/);
  });
});
```

**E2E test conventions:**

- Use `data-testid` attributes for test selectors — never rely on CSS classes or text content that changes.
- Seed test data in a `beforeAll` or use a test setup script that creates a test user and sample QR codes in Supabase.
- Clean up test data after each run to keep the test database predictable.
- Use `page.waitForURL()` and `expect().toBeVisible()` instead of arbitrary `waitForTimeout()`.
- Keep E2E tests high-level — test user journeys, not implementation details.

### Test Scripts in `package.json`

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "vitest run && playwright test"
  }
}
```

### When to Write Tests

- **Before submitting a PR:** Every new feature or bug fix should include tests.
- **Payload builders:** Every QR payload type must have tests covering valid input, edge cases, and special character handling.
- **API routes:** Every route handler needs at least: success case, validation error, auth error, not-found case.
- **Dynamic QR redirect:** This is the most critical path (external users hit it). Test: valid redirect, expired code, paused code, scan limit reached, unknown code, scan event logging.
- **Components:** Test rendering and user interactions. Skip testing shadcn/ui component internals.
- **Not required:** Styling-only changes, config file tweaks, copy/text changes.

### Coverage Targets

| Category | Minimum Coverage |
| --- | --- |
| `src/lib/qr/payloads.ts` | 100% |
| `src/lib/qr/generator.ts` | 90% |
| `src/lib/analytics/` | 90% |
| `src/lib/pages/html-exporter.ts` | 90% |
| `src/lib/pages/page-publisher.ts` | 90% |
| `src/lib/qr/short-code.ts` | 100% |
| API route handlers | 85% |
| Components (non-ui) | 75% |
| Overall | 80% |

---

## Security Practices

### Authentication

- All routes except `/q/[shortCode]` (dynamic QR redirect) and `/p/[shortCode]` (published landing pages) are protected by Supabase Auth middleware.
- Auth state is verified server-side using `@supabase/ssr` with HTTP-only cookies.
- No client-side token storage in localStorage or sessionStorage.
- Users are created manually (admin via Supabase dashboard or seed script). There is no public registration.

### Input Validation

- Validate all API request bodies at the route handler level before any database operation.
- Use Zod schemas for runtime validation of request payloads and JSONB data shapes.
- Sanitize any user input that could end up in HTML exports (XSS prevention in the landing page exporter).

```typescript
import { z } from 'zod';

const CreateQRSchema = z.object({
  qr_type: z.enum(['url', 'text', 'phone', 'sms', 'email', 'wifi', 'vcard', 'whatsapp', 'event', 'location', 'social']),
  payload: z.string().min(1).max(4096),
  style_config: z.record(z.unknown()).optional(),
  is_dynamic: z.boolean().optional().default(false),
  target_url: z.string().url().optional(),
});
```

### Data Privacy

- IP addresses in scan events are hashed (SHA-256) before storage — never store raw IPs.
- Geo lookup data is approximate (city level) — no precise coordinates from IP.
- No personal data is collected from QR code scanners beyond device/browser metadata.

### Environment Variables

- Never commit `.env.local`. Use `.env.example` as a template.
- Supabase keys: use the `anon` key on the client, `service_role` key only in server-side API routes.
- The `service_role` key bypasses Row Level Security. Use it only where necessary and never expose it to the client bundle.

---

## Performance Guidelines

### Client-Side

- QR code generation is client-side (qr-code-styling runs in the browser). Use debouncing (150ms) on live preview to avoid regenerating on every keystroke.
- Lazy load heavy components: Puck editor, Recharts charts, QR code designer. Use `next/dynamic` with `ssr: false` for client-only libraries.

```typescript
import dynamic from 'next/dynamic';

const QRDesigner = dynamic(() => import('@/components/qr/qr-designer'), {
  ssr: false,
  loading: () => <QRDesignerSkeleton />,
});
```

- Use `React.memo` on the QR preview component to prevent unnecessary re-renders.
- Images and logos should be optimized (WebP preferred, max 500KB).

### Server-Side

- The `/q/[shortCode]` redirect must be fast (<200ms). Keep the query simple: one indexed lookup, one atomic increment, one insert. Geo lookup runs with a 2-second timeout and must never block the redirect.
- Use database indexes on all frequently queried columns (they are defined in the schema).
- Paginate all list endpoints (default 20 items, max 100).
- Cache static data where appropriate (template list, QR type definitions).

### Bundle Size

- Keep the client bundle lean. Drizzle ORM (33KB) was chosen over Prisma (800KB+) for this reason.
- shadcn/ui components are tree-shakeable (copy-paste, not a monolithic dependency).
- Monitor bundle size with `next build` output — flag any single page over 200KB first-load JS.

---

## Git Workflow

```
main              Production-ready code
├── dev           Integration branch
    ├── feat/     Feature branches (feat/qr-designer, feat/analytics)
    ├── fix/      Bug fixes (fix/redirect-timeout)
    └── chore/    Maintenance (chore/update-deps, chore/lint-config)
```

### Commit Messages

Use conventional commits. Keep the subject line under 72 characters.

```
feat: add WiFi QR type with security selection
fix: handle special characters in vCard payload
chore: update Supabase SDK to latest
test: add unit tests for all payload builders
docs: update architecture with scan analytics flow
refactor: extract QR preview into separate component
```

### Branch Workflow

1. Create a feature branch from `dev`: `git checkout -b feat/qr-designer`
2. Make changes, commit often with meaningful messages.
3. Run `pnpm test:run` and `pnpm lint` before pushing.
4. Create a PR to `dev`. Include a summary of changes.
5. After review (even self-review for solo dev), merge to `dev`.
6. When `dev` is stable and tested, merge to `main` for deployment.

### Pre-Commit Checks

Set up in `package.json` or with `lint-staged`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

Run before every commit:
1. TypeScript check (`tsc --noEmit`)
2. ESLint (`eslint .`)
3. Prettier (`prettier --check .`)
4. Unit tests on changed files (`vitest related`)

---

## Development Commands

```bash
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Production build
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm format           # Run Prettier (write)
pnpm format:check     # Check Prettier (no write)
pnpm typecheck        # TypeScript check (tsc --noEmit)
pnpm test             # Run Vitest in watch mode
pnpm test:run         # Run Vitest once
pnpm test:coverage    # Run with coverage report
pnpm test:e2e         # Run Playwright tests (headless)
pnpm test:e2e:headed  # Run Playwright (visible browser)
pnpm test:e2e:ui      # Run Playwright interactive UI
pnpm test:all         # Run all tests (unit + E2E)
pnpm db:generate      # Generate Drizzle migrations
pnpm db:push          # Push schema to database (dev)
pnpm db:migrate       # Run migrations (production)
pnpm db:studio        # Open Drizzle Studio (database GUI)
```

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key      # Server-side only
DATABASE_URL=postgresql://...                         # Drizzle direct connection

# App
NEXT_PUBLIC_APP_URL=https://memento-qr.vercel.app    # Or http://localhost:3000 in dev
CRON_SECRET=random-secret-for-cron-endpoint           # Vercel cron auth
```

---

## Key Reminders

1. **This is an internal tool.** No public sign-up, no customer-facing features. Keep the scope tight.
2. **Free tier only.** All services must stay within free-tier limits. If a feature would push past a limit, flag it and discuss alternatives.
3. **Test the redirect path thoroughly.** `/q/[shortCode]` is the one route that external users (QR scanners) hit. It must be fast, reliable, and handle every edge case.
4. **Published pages are public.** `/p/[shortCode]` serves published landing pages to anyone with the link, no auth required. Always check `is_published` and `expires_at` before rendering. Expired pages show a friendly expiration message, not the page content.
5. **Server Components first.** Default to Server Components. Only use `'use client'` when the component genuinely needs browser APIs or interactivity.
6. **Check the architecture doc.** For detailed specs on any feature (QR payload formats, template definitions, Puck components, database schema, API routes), see `docs/architecture.md`.
