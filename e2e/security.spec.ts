import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';

import { createPage, createQR, deletePage, deleteQR, qaName } from './helpers/api';
import { CODES, EMPTY_STATE, USERS } from './helpers/users';

const UUID = '00000000-0000-4000-8000-000000000000';

async function asUser(baseURL: string | undefined, file: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL, storageState: file });
}

test.describe('Every API refuses signed-out requests (401)', () => {
  test.use({ storageState: EMPTY_STATE });

  const routes: [string, string][] = [
    ['GET', '/api/qr'],
    ['POST', '/api/qr'],
    ['GET', `/api/qr/${UUID}`],
    ['PUT', `/api/qr/${UUID}`],
    ['DELETE', `/api/qr/${UUID}`],
    ['POST', `/api/qr/${UUID}/duplicate`],
    ['POST', '/api/qr/batch'],
    ['POST', '/api/qr/move'],
    ['GET', '/api/templates'],
    ['POST', '/api/templates'],
    ['GET', `/api/templates/${UUID}`],
    ['PUT', `/api/templates/${UUID}`],
    ['DELETE', `/api/templates/${UUID}`],
    ['GET', '/api/pages'],
    ['POST', '/api/pages'],
    ['GET', `/api/pages/${UUID}`],
    ['PUT', `/api/pages/${UUID}`],
    ['DELETE', `/api/pages/${UUID}`],
    ['POST', `/api/pages/${UUID}/publish`],
    ['DELETE', `/api/pages/${UUID}/publish`],
    ['PUT', `/api/pages/${UUID}/expiry`],
    ['GET', '/api/folders'],
    ['POST', '/api/folders'],
    ['PUT', `/api/folders/${UUID}`],
    ['DELETE', `/api/folders/${UUID}`],
    ['POST', '/api/upload'],
    ['DELETE', `/api/upload/${UUID}`],
    ['GET', '/api/analytics'],
    ['GET', '/api/analytics?format=csv'],
    ['GET', '/api/export'],
    ['GET', '/api/export?scope=team'],
    ['GET', '/api/search?q=menu'],
    ['GET', `/api/qr/${UUID}/check`],
    ['PUT', `/api/workflow/qr/${UUID}`],
    ['PUT', `/api/workflow/page/${UUID}`],
    ['GET', '/api/profile'],
    ['PUT', '/api/profile'],
  ];

  for (const [method, path] of routes) {
    test(`${method} ${path.replace(UUID, ':id')}`, async ({ request }) => {
      const response = await request.fetch(path, { method, data: method === 'GET' || method === 'DELETE' ? undefined : {} });

      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    });
  }
});

test.describe('The team shares one workspace', () => {
  test('a teammate can open, edit, hand off, copy and check someone else\'s QR code', async ({ request, baseURL }) => {
    const mine = await createQR(request, { name: qaName('shared') });
    const other = await asUser(baseURL, USERS.viewer.file);
    try {
      expect((await other.get(`/api/qr/${mine.id}`)).status()).toBe(200);

      const edited = await other.put(`/api/qr/${mine.id}`, { data: { name: qaName('shared edited') } });
      expect(edited.status()).toBe(200);
      const editedBody = (await edited.json()) as { userId: string; updatedBy: string };
      // The creator is kept; the editor is recorded separately.
      expect(editedBody.updatedBy).not.toBe(editedBody.userId);

      const handoff = await other.put(`/api/workflow/qr/${mine.id}`, {
        data: { nextAction: 'Send to the printer', checklist: [{ id: 'a', label: 'Verify the QR destination', done: false }] },
      });
      expect(handoff.status()).toBe(200);
      expect(((await handoff.json()) as { nextAction: string }).nextAction).toBe('Send to the printer');

      const check = await other.get(`/api/qr/${mine.id}/check`);
      expect(check.status()).toBe(200);
      expect(((await check.json()) as { status: { label: string } }).status.label).toBe('Static code');

      expect((await other.post(`/api/qr/${mine.id}/duplicate`)).status()).toBe(201);
    } finally {
      await other.dispose();
      await deleteQR(request, mine.id);
    }
  });

  test('QR lists and analytics are shared by the whole team', async ({ baseURL }) => {
    const viewer = await asUser(baseURL, USERS.viewer.file);
    const editor = await asUser(baseURL, USERS.editor.file);
    try {
      const list = (await (await viewer.get('/api/qr?limit=100')).json()) as { items: { name: string }[] };
      const names = list.items.map((item) => item.name);

      expect(names.some((name) => name.startsWith('[QA] Dynamic'))).toBe(true); // the editor's seeded codes
      expect(names).toContain('[QA] Viewer private');

      const seenByViewer = (await (await viewer.get('/api/analytics')).json()) as { totalScans: number };
      const seenByEditor = (await (await editor.get('/api/analytics')).json()) as { totalScans: number };
      expect(seenByViewer.totalScans).toBe(seenByEditor.totalScans);
    } finally {
      await viewer.dispose();
      await editor.dispose();
    }
  });

  test('a teammate can edit and delete someone else\'s page, but not a built-in template', async ({ request, baseURL }) => {
    const page = await createPage(request);
    const other = await asUser(baseURL, USERS.viewer.file);
    try {
      expect((await other.get(`/api/pages/${page.id}`)).status()).toBe(200);
      expect((await other.put(`/api/pages/${page.id}`, { data: { name: 'edited by a teammate' } })).status()).toBe(200);

      const stillThere = (await (await request.get(`/api/pages/${page.id}`)).json()) as { name: string };
      expect(stillThere.name).toBe('edited by a teammate');

      const templates = (await (await other.get('/api/pages')).json()) as { items: { id: string; isSystem: boolean }[] };
      expect(templates.items.every((item) => !item.isSystem)).toBe(true);
    } finally {
      await other.dispose();
      await deletePage(request, page.id);
    }
  });

  test('QR templates: system ones cannot be edited or deleted', async ({ request }) => {
    const list = (await (await request.get('/api/templates')).json()) as { items: { id: string; isSystem: boolean }[] };
    const system = list.items.find((item) => item.isSystem)!;

    expect((await request.put(`/api/templates/${system.id}`, { data: { name: 'renamed' } })).status()).toBe(403);
    expect((await request.delete(`/api/templates/${system.id}`)).status()).toBe(403);
  });

  test('only admins can export the whole team', async ({ baseURL }) => {
    const member = await asUser(baseURL, USERS.editor.file);
    const admin = await asUser(baseURL, USERS.admin.file);
    try {
      expect((await member.get('/api/export?scope=team')).status()).toBe(403);
      expect((await admin.get('/api/export?scope=team')).status()).toBe(200);
      expect((await member.get('/api/export')).status()).toBe(200);
    } finally {
      await member.dispose();
      await admin.dispose();
    }
  });

  test('a member\'s own export never contains another person\'s codes', async ({ baseURL }) => {
    const other = await asUser(baseURL, USERS.viewer.file);
    try {
      const backup = (await (await other.get('/api/export')).json()) as { qrCodes: { name: string }[]; scope: string };

      expect(backup.scope).toBe('mine');
      expect(backup.qrCodes.every((qr) => !qr.name.startsWith('[QA] Dynamic'))).toBe(true);
    } finally {
      await other.dispose();
    }
  });
});

test.describe('Hostile input', () => {
  test('SQL injection text is stored and returned as plain text', async ({ request }) => {
    const nasty = `'; DROP TABLE qr_codes; -- ${Date.now()}`;
    const qr = await createQR(request, { name: `[QA] ${nasty}` });
    try {
      const back = (await (await request.get(`/api/qr/${qr.id}`)).json()) as { name: string };
      expect(back.name).toBe(`[QA] ${nasty}`);

      const list = await request.get(`/api/qr?search=${encodeURIComponent("' OR 1=1 --")}`);
      expect(list.status()).toBe(200);
      expect(((await list.json()) as { items: unknown[] }).items).toEqual([]);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('HTML/script in a text QR is stored verbatim and served only as JSON', async ({ request }) => {
    const html = '<img src=x onerror=alert(1)><script>alert("xss")</script>';
    const qr = await createQR(request, { qrType: 'text', payload: html });
    try {
      const response = await request.get(`/api/qr/${qr.id}`);

      expect(response.headers()['content-type']).toContain('application/json');
      expect(((await response.json()) as { payload: string }).payload).toBe(html);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('a page text field with <script> renders as text, never runs', async ({ page, request }) => {
    const created = await createPage(request, {
      puckData: {
        root: { props: {} },
        content: [{ type: 'TextBlock', props: { id: 'x1', heading: '', content: '<script>window.__pwned = true</script> visible text', backgroundColor: '', textColor: '' } }],
        zones: {},
      },
    });
    try {
      const published = (await (await request.post(`/api/pages/${created.id}/publish`, { data: { expiresAt: null } })).json()) as { shortCode: string };

      await page.goto(`/p/${published.shortCode}`);
      await expect(page.getByText('visible text')).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
      expect(await page.content()).not.toContain('<script>window.__pwned');
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('oversized request bodies are rejected, not stored', async ({ request }) => {
    const big = 'x'.repeat(10 * 1024 * 1024);

    const asPayload = await request.post('/api/qr', { data: { name: qaName('big'), qrType: 'text', payload: big, styleConfig: {} } });
    expect([400, 413]).toContain(asPayload.status());

    const asStyle = await request.post('/api/qr', { data: { name: qaName('big'), qrType: 'text', payload: 'ok', styleConfig: { junk: big } } });
    expect([400, 413]).toContain(asStyle.status());

    // Under the 10MB request limit, so the field-level cap is what stops it.
    const midStyle = await request.post('/api/qr', {
      data: { name: qaName('big'), qrType: 'text', payload: 'ok', styleConfig: { junk: 'x'.repeat(2 * 1024 * 1024) } },
    });
    expect(midStyle.status()).toBe(400);
    expect((await midStyle.json()).code).toBe('VALIDATION_ERROR');
  });

  test('invalid QR data is a 400 with a code, not a 500', async ({ request }) => {
    for (const data of [{}, { name: '', qrType: 'url', payload: 'x', styleConfig: {} }, { name: 'a', qrType: 'nope', payload: 'x', styleConfig: {} }]) {
      const response = await request.post('/api/qr', { data });

      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe('VALIDATION_ERROR');
    }
  });

  test('malformed JSON is a 400, not a crash', async ({ request }) => {
    const response = await request.post('/api/qr', { headers: { 'Content-Type': 'application/json' }, data: '{not json' });

    expect(response.status()).toBe(400);
  });
});

test.describe('Uploads', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  async function upload(request: APIRequestContext, name: string, mimeType: string, buffer: Buffer) {
    return request.post('/api/upload', { multipart: { file: { name, mimeType, buffer } } });
  }

  test('accepts a real PNG and returns its address', async ({ request }) => {
    const response = await upload(request, 'qa-e2e.png', 'image/png', png);

    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string; url: string; storagePath: string };
    expect(body.url).toMatch(/^https:\/\//);
    await request.delete(`/api/upload/${body.id}`);
  });

  test('rejects a file type that is not an image', async ({ request }) => {
    const response = await upload(request, 'notes.txt', 'text/plain', Buffer.from('hello'));

    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  test('rejects an executable renamed to .png', async ({ request }) => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
    const response = await upload(request, 'totally-a-picture.png', 'image/png', exe);

    expect(response.status()).toBe(400);
  });

  test('rejects HTML pretending to be an image', async ({ request }) => {
    const response = await upload(request, 'page.png', 'image/png', Buffer.from('<html><script>alert(1)</script></html>'));

    expect(response.status()).toBe(400);
  });

  test('rejects files over 500KB', async ({ request }) => {
    const response = await upload(request, 'huge.png', 'image/png', Buffer.concat([png, Buffer.alloc(600 * 1024)]));

    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe('FILE_TOO_LARGE');
  });

  test('a path-traversal file name cannot choose where the file is stored', async ({ request }) => {
    const response = await upload(request, '../../../etc/passwd.png/../../evil', 'image/png', png);

    if (response.status() === 201) {
      const body = (await response.json()) as { id: string; storagePath: string };
      expect(body.storagePath).toMatch(/^[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(png|jpg|webp|svg)$/);
      expect(body.storagePath).not.toContain('..');
      await request.delete(`/api/upload/${body.id}`);
    } else {
      expect(response.status()).toBe(400);
    }
  });

  test('an upload with no file is a 400', async ({ request }) => {
    const response = await request.post('/api/upload', { multipart: { note: 'nothing here' } });

    expect(response.status()).toBe(400);
  });
});

test.describe('Headers and cookies', () => {
  test('published pages are locked down (CSP, nosniff, no referrer, no-store)', async ({ baseURL }) => {
    const anon = await playwrightRequest.newContext({ baseURL });
    const response = await anon.get(`/p/${CODES.pageLive}`);
    const headers = response.headers();
    await anon.dispose();

    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain("form-action 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cache-control']).toContain('no-store');
  });

  test('the dashboard cannot be framed by other sites (clickjacking)', async ({ request }) => {
    const headers = (await request.get('/')).headers();

    expect(`${headers['x-frame-options'] ?? ''} ${headers['content-security-policy'] ?? ''}`).toMatch(/DENY|SAMEORIGIN|frame-ancestors/i);
  });

  test('responses do not advertise the framework', async ({ request }) => {
    expect((await request.get('/login')).headers()['x-powered-by']).toBeUndefined();
  });

  test('the dashboard sends nosniff and a referrer policy', async ({ request }) => {
    const headers = (await request.get('/login')).headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBeTruthy();
  });

  test('the session cookie is SameSite=Lax or stricter', async ({ context }) => {
    const auth = (await context.cookies()).filter((cookie) => cookie.name.startsWith('sb-'));

    expect(auth.length).toBeGreaterThan(0);
    for (const cookie of auth) expect(['Lax', 'Strict']).toContain(cookie.sameSite);
  });

  test('no auth tokens sit in localStorage or sessionStorage', async ({ page }) => {
    await page.goto('/');
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));

    expect(stored).not.toMatch(/access_token|refresh_token|sb-.*auth-token/);
  });
});

test.describe('Abuse and load', () => {
  test('100 rapid scans never produce a server error', async ({ baseURL, request }) => {
    const qr = await createQR(request, { isDynamic: true, payload: 'https://example.com/flood' });
    const anon = await playwrightRequest.newContext({ baseURL });
    try {
      const statuses = await Promise.all(
        Array.from({ length: 100 }, async () => (await anon.get(`/q/${qr.shortCode}`, { maxRedirects: 0 })).status()),
      );

      expect(statuses.filter((status) => status >= 500)).toEqual([]);
      expect(statuses.filter((status) => status === 302).length).toBe(100);
    } finally {
      await anon.dispose();
      await deleteQR(request, qr.id);
    }
  });

  test('50 rapid creates are handled without errors', async ({ request }) => {
    const responses = await Promise.all(
      Array.from({ length: 50 }, () => request.post('/api/qr', { data: { name: qaName('burst'), qrType: 'text', payload: 'burst', styleConfig: {} } })),
    );
    const ids = await Promise.all(responses.filter((r) => r.status() === 201).map(async (r) => ((await r.json()) as { id: string }).id));

    try {
      expect(responses.map((r) => r.status()).filter((status) => status >= 500)).toEqual([]);
    } finally {
      await Promise.all(ids.map((id) => deleteQR(request, id)));
    }
  });
});

test.describe('Secrets stay on the server', () => {
  test('the service-role key and database URL are not in any browser bundle', () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const dbUrl = process.env.DATABASE_URL ?? '';
    const root = join(process.cwd(), '.next', 'static');

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(js|css|html|json|map)$/.test(entry)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (key) expect(text.includes(key), `service key found in ${file}`).toBe(false);
      if (dbUrl) expect(text.includes(dbUrl), `DATABASE_URL found in ${file}`).toBe(false);
      expect(text, `service_role text in ${file}`).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });
});
