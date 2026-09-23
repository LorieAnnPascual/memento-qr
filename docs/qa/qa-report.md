# Memento QR: final QA report (pre-launch)

## Verdict
**Ready to deploy once the four items under "Before you go live" are done.** No open critical or high-severity bugs. The automated checks all pass; what remains is real-device checking, which only a person can do (`manual-checklist.md`).

## Results
| Layer | Result |
| --- | --- |
| Type check | Pass |
| Lint | 0 errors (3 unused-variable warnings in test files) |
| Unit + integration | **504 / 504** (40 files) |
| Coverage thresholds | Pass (see Coverage) |
| Production build | Pass |
| End-to-end, desktop Chrome | **269 / 269** |
| End-to-end, Pixel 5 + iPhone 13 (phone-tagged tests) | **57 / 57** |
| Security probes | 64 / 64 |
| Accessibility (WCAG 2.1 A + AA, axe) | 0 violations on every dashboard page, light and dark, plus dialogs and public pages |
| Test data | Removed (`pnpm db:teardown`: 354 QR codes, 6 pages, 930 activity rows, 7 files, 4 accounts) |

## Bugs found and fixed
| # | Severity | Bug | Fix |
| --- | --- | --- | --- |
| 1 | **High** | The login guard (`proxy.ts`) sat outside `src/`, so Next.js never ran it: no server-side session refresh, no return-to-page after login | Moved to `src/proxy.ts`; `/q/` and `/p/` skip the auth call so scans stay fast |
| 2 | **High** | Open redirect: `/login?redirectTo=https://evil.example` was followed after sign-in | Only same-site paths accepted (tests for 11 hostile forms) |
| 3 | **High** | Uploads trusted file name and type: an `.exe` renamed `.png` and HTML sent as an image were accepted; a crafted name could add path segments to the storage path | File bytes are verified; extension comes from the verified type; SVGs with scripts refused |
| 4 | Medium | Dashboard had no clickjacking protection, no `nosniff`, no referrer policy, and sent `X-Powered-By` | Headers added in `next.config.ts`, `poweredByHeader` off |
| 5 | Medium | A 2 MB `styleConfig` was accepted (database bloat) | Design fields capped |
| 6 | Medium | Supabase free tier pauses idle projects and nothing kept it awake | `/api/cron/keep-alive` + `vercel.json` (daily), protected by `CRON_SECRET` |
| 7 | Medium | Scan limit could be overshot by simultaneous scans (found in Phase 4, verified here: 10 concurrent scans, limit 3 → exactly 3) | Single conditional query |
| 8 | Low | Empty URL field produced a downloadable QR for `https://` | Empty means no content |
| 9 | Low | Accessibility: unlabeled selects, hex inputs and slider thumbs; low-contrast tabs, badges, placeholder text (also in dark mode); scrollable tables not keyboard-reachable | Fixed |
| 10 | Low | Compare page silently ignored a link with the same code twice | Shows "Pick two different QR codes" |

## What was verified
- **Login and access:** 12 pages redirect to login when signed out; 33 API endpoints return 401; a second user gets 404/403 on another person's QR codes and pages; only admins can export the whole team; system templates cannot be edited.
- **Redirect path (`/q/`):** live, paused, expired, deleted, unknown, scan-limited codes; query strings, fragments, encoded characters, `mailto:`/`tel:`, a ~1,900-character URL; rapid, simultaneous and 100-request floods produce no server errors. Error pages leak nothing.
- **Public pages (`/p/`):** live page, expired message (no content), 404 for unpublished/unknown, `noindex`, strict CSP; script text in a page renders as text and never runs; publish, expiry, unpublish, republish keeps the same link.
- **Everything else:** QR generator (every type, styling, PNG/SVG/JPEG/WebP downloads, logo upload, save/edit/delete with confirmations, staying on the page), templates, page builder (preview, create, edit, save, export, publish), analytics (numbers agree with the API and QR list), folders, batch import, duplicate + compare, activity log, backup export, dark mode, settings.
- **Responsive:** no sideways page scrolling on any page at 375, 768, 1280 and 1920 px; sidebar becomes a menu on phones; exported HTML is responsive on its own.
- **Privacy and secrets:** scan data holds hashed IPs only and never exposes them; the service-role key and database URL are not in any browser bundle; no auth tokens in local/session storage.

## Coverage
Enforced per area in `vitest.config.mts`: API routes ≥ 85%, pages/analytics/activity logic ≥ 90%, payload builders 100%, overall floor 55%.
Actual: analytics 99%, pages 98%, activity 100%, API routes 87–100%, payloads 100%. Overall is 59%, **below the plan's 80% target**: canvas and card-export code and form components cannot run in jsdom and are exercised by the E2E suite instead.

## Performance
- Redirect: median **173 ms** on a production build from a laptop to a database on another continent (round trip alone is ~78 ms); expect much lower once deployed near the database. Target was < 200 ms.
- JavaScript downloaded on first visit (compressed): login ≈ 290 KB, designer/analytics ≈ 120 KB extra, **page editor ≈ 600 KB extra** (Puck, loaded only on that page), published page ≈ 4 KB. The plan's 200 KB per-page / 100 KB shared budgets are exceeded by the shared framework baseline. Acceptable for a six-person internal tool; not a launch blocker.
- Lighthouse was not run (would need a new tool download); the numbers above and measured load times (published page under 1 s, dashboard pages 2–3 s locally) stand in.

## Known limitations (documented, not blocking)
1. **Session cookies are not `HttpOnly`.** Supabase's browser client sets them, so `CLAUDE.md`'s "HTTP-only cookies" is inaccurate. They are `SameSite=Lax`, tokens are not in storage, and pages are sanitized with a CSP. Fixing it means moving sign-in to a server route (an auth change I did not make without your say-so).
2. The Puck page editor is third-party: its own controls were excluded from the accessibility scan and may need a mouse for drag-and-drop.
3. `GET /api/pages/[id]/export` and `GET /api/analytics/[qrId]` from the plan do not exist by design (export runs in the browser; analytics uses `?qrId=`).
4. Restoring from a backup is not built; scan notifications are not built (no email).
5. Prettier is not installed, so `format` scripts and the pre-commit format check do not exist yet.

## Before you go live
1. In Vercel set `DATABASE_URL` to Supabase's **transaction pooler (port 6543)**, `NEXT_PUBLIC_APP_URL` to the real https URL, and `CRON_SECRET` to a long random value.
2. Run `pnpm db:push` against the production database (adds the Phase 4 tables and indexes).
3. Work through `docs/qa/manual-checklist.md` (real phones, Safari/Firefox, screen reader).
4. Confirm no `*@memento.local` accounts exist in Supabase (they were removed by teardown).

## How to re-run
`pnpm db:seed`, `pnpm build`, `pnpm test:e2e`, then **always** `pnpm db:teardown`. CI is defined in `.github/workflows/ci.yml` and should point at a separate test Supabase project.
