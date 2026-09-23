import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();

vi.mock('@/lib/db', () => ({ db: dbMock }));

const HOUR = 60 * 60 * 1000;
const DESIGN = {
  root: { props: {} },
  content: [{ type: 'TextBlock', props: { id: 't', content: 'Hello published world' } }],
  zones: {},
};
const PAGE = {
  id: 'page-1',
  name: 'Public Page',
  description: null as string | null,
  puckData: DESIGN,
  isPublished: true,
  expiresAt: null as Date | null,
};

const params = Promise.resolve({ shortCode: 'abc123' });

async function renderPage(): Promise<string> {
  const { default: PublishedPage } = await import('@/app/p/[shortCode]/page');
  const element = await PublishedPage({ params } as never);
  return renderToStaticMarkup(element);
}

describe('/p/[shortCode] page', () => {
  beforeEach(() => dbMock.select.mockReset());

  it('renders a published page', async () => {
    dbMock.select.mockReturnValue(chainable([PAGE]));

    const html = await renderPage();

    expect(html).toContain('Hello published world');
    expect(html).toContain('published-page');
  });

  it('resets the dashboard typography so the page matches its export', async () => {
    dbMock.select.mockReturnValue(chainable([PAGE]));

    const html = await renderPage();

    expect(html).toContain('.published-page :is(h1, h2, h3, h4, h5, h6, p)');
  });

  it('404s for an unknown code', async () => {
    dbMock.select.mockReturnValue(chainable([]));
    await expect(renderPage()).rejects.toThrow();
  });

  it('404s for an unpublished page without leaking its content', async () => {
    dbMock.select.mockReturnValue(chainable([{ ...PAGE, isPublished: false }]));
    await expect(renderPage()).rejects.toThrow();
  });

  it('shows the expiry message instead of the content when expired', async () => {
    dbMock.select.mockReturnValue(chainable([{ ...PAGE, expiresAt: new Date(Date.now() - HOUR) }]));

    const html = await renderPage();

    expect(html).toContain('This page has expired');
    expect(html).not.toContain('Hello published world');
  });

  it('still serves a page whose expiry is in the future', async () => {
    dbMock.select.mockReturnValue(chainable([{ ...PAGE, expiresAt: new Date(Date.now() + HOUR) }]));
    expect(await renderPage()).toContain('Hello published world');
  });
});

describe('/p/[shortCode] metadata', () => {
  beforeEach(() => dbMock.select.mockReset());

  it('uses the page name and a default description, and asks not to be indexed', async () => {
    dbMock.select.mockReturnValue(chainable([PAGE]));
    const { generateMetadata } = await import('@/app/p/[shortCode]/page');

    const metadata = await generateMetadata({ params } as never);

    expect(metadata.title).toBe('Public Page');
    expect(metadata.description).toBe('Public Page — powered by Memento');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('uses the custom description when set', async () => {
    dbMock.select.mockReturnValue(chainable([{ ...PAGE, description: 'A memorial' }]));
    const { generateMetadata } = await import('@/app/p/[shortCode]/page');

    expect((await generateMetadata({ params } as never)).description).toBe('A memorial');
  });

  it('reports not found for unpublished pages', async () => {
    dbMock.select.mockReturnValue(chainable([{ ...PAGE, isPublished: false }]));
    const { generateMetadata } = await import('@/app/p/[shortCode]/page');

    expect((await generateMetadata({ params } as never)).title).toBe('Page Not Found');
  });
});
