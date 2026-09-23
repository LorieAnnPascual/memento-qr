# Manual QA checklist (what only a person with real devices can check)

Everything a browser can automate is already covered by `pnpm test:e2e`. These are the remaining items.
Run them on the **deployed Vercel URL** (not localhost) once, before sharing it with the team.
Tick each box; write any bug with the template at the bottom.

## 1. Scan real printed/on-screen codes (15 min)
Use at least one iPhone and one Android phone.
- [ ] URL code opens the right site
- [ ] WiFi code offers to join the network (and joins it)
- [ ] vCard code offers "Add contact" with the right name/phone/email
- [ ] Phone code offers to call; text code shows the text
- [ ] A code with a **large logo** still scans
- [ ] A **gradient** code still scans
- [ ] Light dots on a light background: note whether it scans (it may not)
- [ ] Download a **2048px / high-res SVG**, print it small (about 3 cm) and scan it
- [ ] Dynamic code: scan → lands on the target. Change the target in the app, scan again → new target
- [ ] Pause it in the app, scan → friendly "paused" page. Resume → works again

## 2. Published pages on real phones (10 min)
- [ ] Open a published page link on an iPhone (Safari) and an Android phone (Chrome): looks right, text readable, no sideways scrolling
- [ ] Video block plays; map block shows the right place; buttons open the right link (tel:, mailto:)
- [ ] Background image page: image fills the screen; darkening makes text readable
- [ ] Open the **exported .html file** in Chrome, Firefox and Safari: matches the published page

## 3. Other browsers (15 min)
Firefox (desktop), Safari (macOS): sign in, create + save a QR, download PNG/SVG, open the page editor, publish a page.
- [ ] Firefox works end to end
- [ ] Safari (macOS) works end to end

## 4. Screen reader and keyboard (10 min)
- [ ] VoiceOver (Mac/iPhone) or NVDA (Windows): on the QR designer, every field is announced with its label; the save confirmation is announced
- [ ] Tab through the QR list and designer using only the keyboard: order makes sense, focus ring is visible
- [ ] Page editor: try moving a block with the keyboard. The editor (Puck) is third-party; if it needs a mouse, that is a known limitation

## 5. After deploying to Vercel (10 min)
- [ ] Sign in with a real team account (not the test accounts)
- [ ] Create a QR, scan it, look at Analytics
- [ ] Publish a page, open the public link in a private window
- [ ] Vercel → Project → Cron Jobs: `/api/cron/keep-alive` is listed and its first run returns 200
- [ ] Vercel → Settings → Environment Variables: `CRON_SECRET`, `DATABASE_URL` (use Supabase's **transaction pooler, port 6543**), `NEXT_PUBLIC_APP_URL` (the real https URL) are set
- [ ] The test accounts (`*@memento.local`) do **not** exist in Supabase → Authentication → Users

## Bug template
```
## Bug: short description
Severity: Critical / High / Medium / Low
Found on: device + browser + URL
Steps: 1. … 2. … 3. …
Expected: …
Actual: …
Screenshot / console errors: …
```
