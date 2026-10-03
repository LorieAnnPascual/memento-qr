import Link from 'next/link';

interface GuideSection {
  id: string;
  title: string;
  intro?: string;
  steps?: string[];
  tips?: string[];
  link?: { href: string; label: string };
}

const SECTIONS: GuideSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    intro:
      'Memento QR is the team’s shared place to make QR codes, track scans and build small landing pages. There is no public sign-up: your account is created for you, and you sign in with your email and password.',
    steps: [
      'Sign in, then open Settings → Security and choose your own password.',
      'Add your name under Settings → Profile.',
      'Use the sidebar to move around: Dashboard, QR Codes, Templates, Pages, Media, Analytics and Activity.',
    ],
  },
  {
    id: 'create-qr',
    title: 'Create a QR code',
    steps: [
      'Go to QR Codes → New QR code.',
      'Give it a name, then pick what it holds: a website link, text, phone, SMS, email, WiFi, contact card, WhatsApp, event, location, social links or a video.',
      'Fill in the details on the Content tab. The preview on the right updates as you type.',
      'Use the Layout tab to wrap the code in a printable card, and the Style tab for colors, dot shapes, a logo and templates.',
      'Click Save QR code and confirm. You stay on the page after saving.',
      'Use Export to download a PNG, SVG, JPEG or WebP (choose the high-resolution option for printing).',
    ],
    tips: ['Keep good contrast (dark dots on a light background) and always test-scan before printing.'],
    link: { href: '/qr/new', label: 'Create a QR code' },
  },
  {
    id: 'static-dynamic',
    title: 'Static vs. dynamic codes (important for tracking)',
    intro:
      'A static code holds your link directly. It works forever, but nothing can be counted and the link can never change. A dynamic code holds a short Memento link that forwards to your real link, so scans are counted and you can change where it goes without reprinting.',
    steps: [
      'Open a code, go to the Dynamic QR tab and turn on Make this dynamic. Save it.',
      'Copy or re-download the code after saving: the image you had before still points at the old direct link and will not be counted.',
      'Optional: set an expiry date or a scan limit, or pause the code at any time.',
    ],
    tips: [
      'Only dynamic codes appear in Analytics.',
      'A paused, expired or fully used code shows a friendly message to anyone who scans it.',
    ],
  },
  {
    id: 'custom-links',
    title: 'Custom link names',
    intro:
      'Instead of a random link like /q/k7x2mq, give a dynamic QR code or a published page a name of your own, like /q/ana-memorial or /p/ana-memorial, so the link looks personal and professional.',
    steps: [
      'QR codes: open the Dynamic QR tab, turn on Make this dynamic, and type a name under Custom link name. Pages: open Publish and use the same field.',
      'Use letters, numbers and single hyphens, 3 to 30 characters. Spaces and capitals are tidied up for you as you type.',
      'It says Available, or that the name is already taken. Leave it blank to get a random link.',
      'To change a name later, edit the field and save. The page or code gets the new link, and the old link keeps working and forwards to it, so printed codes and links you already shared never break.',
      'After renaming a QR code, download it again if you want the printed version to show the new link.',
    ],
    tips: [
      'Shorter names make a cleaner QR code that scans better when printed small.',
      'A name stays reserved after it is changed, so nobody else can take your old link.',
      'QR link names and page link names are separate lists, so a page and a QR code can share the same name.',
    ],
  },
  {
    id: 'analytics',
    title: 'Track scans (Analytics)',
    steps: [
      'Open Analytics to see total and unique scans, scans per day, devices, browsers, countries and cities.',
      'Filter by date range or by a single QR code.',
      'Export the raw scan data as a CSV file.',
    ],
    tips: ['Visitor IP addresses are never stored; they are scrambled (hashed) first. Locations are approximate.'],
    link: { href: '/analytics', label: 'Open Analytics' },
  },
  {
    id: 'templates',
    title: 'Templates',
    intro:
      'A template saves a QR design (colors, shapes, logo, card layout) so the whole team can reuse it.',
    steps: [
      'On the Style tab of the QR editor, click Choose template to apply one, or save your current style as a new template.',
      'Open Templates to browse system templates and to edit or delete the ones you made.',
      'Use the card builder to design a custom card with text, graphics and your QR code.',
    ],
    link: { href: '/templates', label: 'Browse templates' },
  },
  {
    id: 'pages',
    title: 'Build and publish a landing page',
    steps: [
      'Go to Pages and start from a template or a blank page.',
      'Drag blocks from the left (hero, text, buttons, images, gallery, video, map, contact, social links, FAQ) onto the page and edit them on the right.',
      'Click the page itself (or the page settings) to change the font, background color or background image.',
      'Save, then Publish to get a public link that anyone can open. You can set an expiry date, unpublish at any time, or download the page as an HTML file.',
      'Turn the public link into a QR code by pasting it into a new QR code’s website field.',
    ],
    tips: [
      'Published pages are public to anyone with the link, so do not put private information on them.',
      'Video blocks play a video you uploaded to Media (add an optional cover image), or a YouTube or Vimeo link.',
    ],
    link: { href: '/pages', label: 'Open Pages' },
  },
  {
    id: 'media',
    title: 'Media library',
    steps: [
      'Every image and video you upload (logos, backgrounds, page images, videos) is kept under Media.',
      'To host a video, click Upload media and choose an MP4, WebM or MOV file. A progress bar shows while it uploads; keep the tab open until it finishes.',
      'Copy link gives you the file’s web address, for example to paste into a QR code.',
      'Anywhere an image is needed, use Choose from media to reuse one instead of uploading it again. In a page’s Video block, use Upload video or From media.',
      'Deleting a file from Media removes it everywhere it was used.',
    ],
    tips: [
      'Images can be PNG, JPG, WebP or SVG, up to 500 KB. Videos can be up to 50 MB.',
      'MP4 (H.264) plays on every phone and browser; WebM may not play on older iPhones. If an edited video is too big, export it at 720p or 1080p with a lower bitrate.',
      'The Media page shows how much of the 1 GB of free storage is used. Videos use it up quickly, so delete clips you no longer need.',
      'A deleted video can keep playing for anyone who watched it recently for up to an hour, because copies are cached.',
    ],
    link: { href: '/media', label: 'Open Media' },
  },
  {
    id: 'video-qr',
    title: 'Make a video QR code',
    intro:
      'A video QR code plays a video you upload when someone scans it. The video opens right on the code’s own link, so there is no file to download and no YouTube needed.',
    steps: [
      'Go to QR Codes → New QR code and choose Video.',
      'On the Content tab, click Upload video (MP4, WebM or MOV, up to 50 MB) or From media to reuse one you already uploaded. You see a preview with the file name and size.',
      'Optionally type a custom link name right under the video, for example ana-memorial. Leave it blank for a random link.',
      'Save, then download the code. The code’s link looks like https://memento-qr.vercel.app/q/ana-memorial and the video itself is served from https://memento-qr.vercel.app/media/..., never from another site.',
      'To change the video later, open the code, upload or choose a different one and save. The printed code stays the same.',
    ],
    tips: [
      'Video codes are always dynamic, so the Make this dynamic switch is locked on. You can still pause the code, give it an expiry date or a scan limit.',
      'If you rename the link, the old link keeps playing the video, so printed codes never break.',
      'If you delete the video from Media, every video code using it stops working (the scan shows a "not found" message) until you choose another video.',
      'Videos older than this feature keep their original storage address in Media; their codes still work, and new uploads use the app’s own address.',
      'A video is sent through the app’s server, so it counts toward the free hosting traffic limits, and a very long video on a very slow phone connection may not finish loading. Keep videos short and exported at 720p or 1080p.',
      'A deleted video can keep playing for anyone who watched it recently for up to an hour, because copies are cached.',
    ],
    link: { href: '/qr/new', label: 'New QR code' },
  },
  {
    id: 'team',
    title: 'Working together',
    steps: [
      'Everything is shared: QR codes, pages, folders, media and analytics are visible to and editable by the whole team. Each item remembers who created it and who edited it last.',
      'Handoff: on the QR Codes or Pages list, click the person icon to assign an item to a teammate, write the next action and an internal note, and tick off an optional checklist. Things assigned to you show on the dashboard.',
      'Is it working? Click the heart-pulse icon on a QR code. You get Looks good, Needs attention or Not working, with a suggested fix for each problem. A test reader scans the code, the design is checked (contrast, logo size, density) and the destination page is checked. This never counts as a scan.',
      'Ongoing checks: every day the app re-checks dynamic codes. Broken ones show "Not working" in the list and in a "Needs attention" card on the dashboard, naming the person responsible (who it is assigned to, or its creator).',
      'Destination history: for a dynamic code, the same dialog lists every change of destination (who and when). Restore an earlier one with a click; the printed code does not change.',
      'Purpose: in the handoff dialog, note what a code is for (for example, table cards for the June event).',
      'Search: the box at the top searches QR codes, pages, folders and templates, including notes and next actions.',
    ],
  },
  {
    id: 'organize',
    title: 'Stay organized',
    steps: [
      'Folders: group codes into folders from the QR Codes list. Deleting a folder keeps its codes.',
      'Card sizes: in the card builder, choose Card size (business card, postcard, square or your own width and height in mm or inches). Turn on Show print guides to see the cut line, the safe area and the bleed, with crop marks at the corners.',
      'Print-ready card: in the QR designer choose Download, then Print-ready PDF. Pick a size (business card, postcard or your own), optionally add bleed and crop marks, check the warnings, and download the PDF. The preview shows proportions only; print the PDF at 100% (Actual size) and scan it before a big run.',
      'Batch import: create many website, text, phone or email codes at once from a CSV file (up to 200 rows).',
      'Duplicate: copy a code to test an A/B variant, then Compare two codes side by side.',
      'Activity: see what the team created, changed or deleted.',
    ],
  },
  {
    id: 'account',
    title: 'Your account and data',
    steps: [
      'Settings → Appearance switches between light and dark mode.',
      'Settings → Your data downloads a JSON backup of the codes, templates and pages you created.',
      'Forgot your password? On the sign-in page click "Forgot password?", enter your email and follow the link in the reset email (check spam). If no email arrives after a few minutes, wait a bit and try again, or ask an admin.',
    ],
  },
  {
    id: 'help',
    title: 'Something not working?',
    steps: [
      'Save failed or a blank page: refresh once and try again.',
      'A scan is not counted: check that the code is dynamic and was re-downloaded after you turned that on.',
      'A video will not play on a downloaded HTML file: publish the page and share the link instead.',
      'Still stuck? Tell the team admin what you clicked and what you saw.',
    ],
  },
];

/** The in-app user guide (shown under Settings and linked from the dashboard). */
export function UserGuide() {
  return (
    <div className="space-y-6">
      <nav aria-label="Guide contents" className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#guide-${section.id}`}
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {section.title.split(' (')[0]}
          </a>
        ))}
      </nav>

      {SECTIONS.map((section) => (
        <section key={section.id} id={`guide-${section.id}`} className="scroll-mt-6 space-y-3">
          <h3 className="text-lg font-semibold">{section.title}</h3>
          {section.intro && <p className="text-sm text-muted-foreground">{section.intro}</p>}
          {section.steps && (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
          {section.tips && (
            <ul className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              {section.tips.map((tip) => (
                <li key={tip}>Tip: {tip}</li>
              ))}
            </ul>
          )}
          {section.link && (
            <Link href={section.link.href} className="inline-block text-sm font-medium underline underline-offset-4">
              {section.link.label}
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}
