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
- [ ] A code with the default **Memento logo** (every new code) scans on an iPhone and an Android phone, also printed small (about 3 cm) and with a long link
- [ ] A code with a **large logo** still scans
- [ ] A **gradient** code still scans
- [ ] Light dots on a light background: note whether it scans (it may not)
- [ ] Download a **2048px / high-res SVG**, print it small (about 3 cm) and scan it
- [ ] Dynamic code: scan → lands on the target. Change the target in the app, scan again → new target
- [ ] Pause it in the app, scan → friendly "paused" page. Resume → works again
- [ ] Custom link name: make a dynamic code with a name (e.g. ana-memorial), print it, scan it. Rename it in the app, scan the **old printout** again: it must still open the same place
- [ ] Forward an old link to a live code (Dynamic QR tab), then scan the **old printout** with a phone: it must land on the live code's destination, and the scan shows in Analytics for the live code
- [ ] A page published at a custom link opens on a phone, and its old link (after a rename) forwards to the new one

## 2. Published pages on real phones (10 min)
- [ ] Open a published page link on an iPhone (Safari) and an Android phone (Chrome): looks right, text readable, no sideways scrolling
- [ ] Video block plays; map block shows the right place; buttons open the right link (tel:, mailto:)
- [ ] Background image page: image fills the screen; darkening makes text readable
- [ ] Uploaded video (page builder Video block, MP4 made by the team's editing tool): plays on an iPhone (Safari) and an Android phone (Chrome) with sound, goes full screen, and a portrait (phone-shot) video is not cropped
- [ ] Uploaded WebM: note whether it plays on the oldest iPhone available (it may not; MP4 is the safe choice)
- [ ] A real edited video near the 50 MB limit uploads on the office connection and on mobile data; the progress bar moves and it appears under Media
- [ ] Open the **exported .html file** in Chrome, Firefox and Safari: matches the published page

### Video QR codes
- [ ] Create a Video QR code (upload a real edited MP4), print or show it on a screen, and scan it with an iPhone camera (Safari) and an Android phone (Chrome): the video plays on the same link (`/q/...`) with sound, goes full screen, and the address bar never shows supabase.co
- [ ] Seeking works on both phones: drag the progress bar to the middle of the video and it jumps without restarting (Range requests through the `/media/` rewrite)
- [ ] Rename the code's link name, scan the **old** printed code again: it still plays the video
- [ ] Pause the code: the scan shows the paused message; resume it and it plays again
- [ ] Delete the video from Media: scanning the code shows the "not found" message (not an error page); after an hour the old copy is gone from the cache
- [ ] A video near 50 MB on a slow mobile connection (try 3G throttling or one bar of signal): note whether it finishes loading. Vercel proxies the file, so a very slow download may be cut off

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

## 6. QR frames (15 min, real phones)
- [ ] Print one code per frame design (Simple, Business, Wedding, Birthday, Graduation, Baby, Memorial, Pets), once at about 25 mm and once at about 80 mm wide for the code itself
- [ ] Scan each with an iPhone camera and an Android camera from about 20 to 40 cm: all read within a second or two
- [ ] Repeat with a dense code (a 300-character text) and with the Memento logo in the middle
- [ ] Try a very dark frame colour and a coloured (not white) code background: the code is still read, and the designer shows a warning where it should
- [ ] The caption is legible and not cut off in PNG, SVG and the print PDF; open the SVG in a browser and in a vector editor
- [ ] Print PDF: the dialog's "QR will be about N mm" matches a ruler measure of the code inside the frame
- [ ] The picker looks right in dark mode and has no sideways scroll at 375 px wide

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
