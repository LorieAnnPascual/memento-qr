# Memento QR

An internal QR code generator and landing-page builder for a small team. Sign-in only (no public sign-up), runs on free tiers (Vercel + Supabase).

Live site: <https://memento-qr.vercel.app>

## Features

- **QR codes**: 11 types (URL, text, phone, SMS, email, WiFi, vCard, WhatsApp, event, location, social) with full styling: dot and corner shapes, colors and gradients, logos, card layouts, and PNG / SVG / JPEG / WebP downloads.
- **Dynamic codes**: the printed code never changes, but its destination can. Pause, set an expiry date or a scan limit. Every scan is counted.
- **Analytics**: scans over time, devices, browsers, countries and cities (IP addresses are hashed, never stored), per-code drill-down, CSV export, side-by-side comparison.
- **Templates**: built-in and team-made QR design templates, plus a card designer with real print sizes (business card, postcard, custom mm or inches), bleed, and on-canvas guides (cut line, safe area, crop marks).
- **Page builder**: drag-and-drop landing pages (hero, text, buttons, FAQ, gallery, video, map, columns, contact, social and more) with page background color or image. Export as one HTML file or publish at a shareable link with an optional expiry date.
- **Organizing**: folders, batch import from CSV (up to 200 rows), duplicate a code for A/B variants, media library, activity log.
- **Health check**: "Is this QR working?" gives a plain verdict (Looks good, Needs attention, Not working) with a suggested fix. It decodes the code with a test reader, checks contrast, logo size and density, and confirms the destination answers.
- **Link monitoring**: a daily check of every dynamic code (paused, expired, scan limit, broken destination) with a "Needs attention" card on the dashboard and an entry in the activity log.
- **Destination history**: every change to a dynamic code's destination (who, when, from what), with one-click restore, plus a purpose note per code.
- **Print-ready cards**: real sizes (business card, postcard, custom mm or inches), optional bleed and crop marks, a scan-size warning, and a print-ready PDF.
- **Team workspace**: everything is shared. Assign items to a teammate with a next action, note and optional checklist, search across everything, and check whether a saved QR still works.
- **Data and account**: JSON backup and restore, dark mode, collapsible sidebar, in-app user guide, password reset.

## Latest improvements

### v1.3.0
- **Real card sizes in the card builder**: business card (US/EU), postcard (6×4 in, A6), square or a custom width and height in mm or inches, with bleed and on-canvas guides (cut line, safe area, crop marks). The print dialog opens at the card's size.
- Elements are moved proportionally when the card size changes (the QR stays square).
- Live-tested against the real database with temporary accounts: destination history and restore, purpose notes, the daily link check, and saving card templates with a real size.

### v1.2.0
- **QR health check verdict**: Looks good / Needs attention / Not working, each problem with a suggested fix; a test reader decodes the rendered code to prove it scans.
- **Ongoing link monitoring**: a daily cron checks dynamic codes and flags broken ones on the dashboard and in the activity log (in-app only; there is no email sending).
- **Destination history and restore**, and a **purpose** note on codes and pages.
- **Print-ready PDF** with bleed and crop marks, real print sizes and a warning when the QR would print too small.
- Fixes: functions now run next to the database (Tokyo), and the database pool was resized so pages no longer stall on the transaction pooler.

### v1.1.0
- **Shared team workspace**: QR codes, pages, folders, media and analytics are visible to and editable by everyone. Each item records who created it and who last edited it.
- **Handoff**: assign to a teammate, set a next action and internal note; an "Assigned to you" card on the dashboard.
- **Checklist**: optional, editable steps on any QR code or page.
- **Unified search**: QR codes, pages, folders and templates from one box, including notes and next actions.
- **"Is this QR working?" check**: reports paused, expired, scan-limit and destination status without counting a scan.

### v1.0.0
- Public launch after full QA (unit, end-to-end, security and accessibility suites), keep-alive cron for the free database tier, and login/upload/redirect hardening.

## Ideas being explored

- **Memorial and keepsake pages**: QR-linked pages with family contributions, approval before publishing, private invitations and downloadable archives. This is a direction to try with real users before building.

## Tech stack

Next.js 16 (App Router, TypeScript strict), Tailwind CSS v4 + shadcn/ui, Supabase (Auth, Postgres, Storage), Drizzle ORM, `qr-code-styling`, `jsqr` (scan test), `pdf-lib` (print PDFs), Puck page editor, Recharts, Vitest + Testing Library, Playwright, pnpm.

## Getting started

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase keys, `DATABASE_URL`, `NEXT_PUBLIC_APP_URL` and `CRON_SECRET`.
3. Create the tables: `pnpm db:push`
4. Seed the built-in templates: `pnpm db:seed-templates` and `pnpm db:seed-page-templates`
5. Create a user in the Supabase dashboard (Authentication → Users, Auto Confirm), then link it to a profile:

   ```bash
   pnpm db:seed-user -- --auth-id=<uuid> --email=<email> --name="Full Name" --role=admin
   ```

   A user needs both the Supabase account and a profile row, or the app sends them back to the login page.
6. Start the app: `pnpm dev` (<http://localhost:3000>)

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Develop, build, run production |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test:run` | Unit and integration tests |
| `pnpm test:e2e` | Playwright end-to-end tests (see below) |
| `pnpm db:generate` / `db:push` / `db:studio` | Database schema tools |

End-to-end tests seed test data into the connected database (`pnpm db:seed`) and must be followed by `pnpm db:teardown`. Because the workspace is shared, do not run them against a database your team is using.

## Deploying

Deployed on Vercel from `main`. Set the environment variables from `.env.example`; use Supabase's transaction pooler (port 6543) for `DATABASE_URL`. Two daily crons (`vercel.json`) keep the free Supabase project awake and check dynamic QR links (both need `CRON_SECRET`). Functions run in `hnd1` (Tokyo) next to the database. Database changes are applied with the SQL files in `src/lib/db/migrations/` (or `pnpm db:push`); apply any new one **before** deploying code that uses it (0003 shared workspace and handoff, 0004 history, purpose and link health). Before going live, work through `docs/qa/manual-checklist.md`.

## Documentation

- `docs/architecture.md`: full technical specification
- `docs/qa/qa-report.md`: pre-launch QA report
- `docs/qa/manual-checklist.md`: checks that need real devices
- `CLAUDE.md`: development notes and conventions
