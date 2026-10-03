import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { Render, type Data } from '@puckeditor/core';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { puckConfig } from '@/components/pages/puck-config';
import { normalizePageData } from '@/lib/pages/normalize';
import { resolveAlias } from '@/lib/slugs/slugs';

// The dashboard's global styles (heading font, paragraph width, root font
// size) must not leak into a published page — it should look like its export.
const PAGE_RESET_CSS = `
  .published-page, .published-page * { box-sizing: border-box; }
  .published-page :is(h1, h2, h3, h4, h5, h6, p) { margin: 0; max-width: none; font-family: inherit; line-height: 1.5; }
  .published-page :is(h1, h2, h3) { line-height: 1.25; }
  .published-page img { max-width: 100%; height: auto; }
  .published-page a { color: inherit; }
`;

/**
 * The page behind a link. An old name of a renamed page finds it too, and so does an old
 * link someone chose to forward to a page (`forwarded`); see `slug_aliases`.
 */
async function getPage(shortCode: string) {
  const code = shortCode.toLowerCase();
  const [page] = await db.select().from(pageTemplates).where(eq(pageTemplates.shortCode, code)).limit(1);
  if (page) return { page, forwarded: false };

  const alias = await resolveAlias('page', code);
  if (!alias) return { page: undefined, forwarded: false };
  const [target] = await db.select().from(pageTemplates).where(eq(pageTemplates.id, alias.id)).limit(1);
  return { page: target, forwarded: alias.redirect };
}

export async function generateMetadata({ params }: PageProps<'/p/[shortCode]'>): Promise<Metadata> {
  const { shortCode } = await params;
  const { page } = await getPage(shortCode);

  if (!page || !page.isPublished) return { title: 'Page Not Found' };

  return {
    title: page.name,
    description: page.description || `${page.name} — powered by Memento`,
    // Memorials, pets and events are shared by link, not meant for search.
    robots: { index: false, follow: false },
  };
}

export default async function PublishedPage({ params }: PageProps<'/p/[shortCode]'>) {
  const { shortCode } = await params;
  const { page, forwarded } = await getPage(shortCode);

  // Unpublished pages are indistinguishable from ones that never existed.
  if (!page || !page.isPublished) {
    notFound();
  }

  // Reached through an old link: send the visitor to the page's current address. A link that was
  // forwarded on purpose is a permanent redirect; a renamed page's old name is a plain one.
  if (page.shortCode && page.shortCode !== shortCode.toLowerCase()) {
    if (forwarded) permanentRedirect(`/p/${page.shortCode}`);
    redirect(`/p/${page.shortCode}`);
  }

  if (page.expiresAt && new Date(page.expiresAt) < new Date()) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>This page has expired</h1>
        <p style={{ color: '#666', margin: '0 auto' }}>This page is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="published-page">
      <style>{PAGE_RESET_CSS}</style>
      <Render config={puckConfig} data={normalizePageData(page.puckData as Data)} />
    </div>
  );
}
