import { describe, it, expect } from 'vitest';
import type { Data } from '@puckeditor/core';

import { exportToHTML, slugifyFileName } from '@/lib/pages/html-exporter';
import { SYSTEM_PAGE_TEMPLATES, BLANK_PAGE } from '@/lib/pages/templates';
import { puckConfig } from '@/components/pages/puck-config';

function pageWith(type: string, props: Record<string, unknown>, root: Record<string, unknown> = {}): Data {
  return { root: { props: root }, content: [{ type, props: { id: 'x', ...props } }], zones: {} } as Data;
}

describe('exportToHTML', () => {
  it('produces a complete standalone document with inline styles only', () => {
    const html = exportToHTML(SYSTEM_PAGE_TEMPLATES[0].puckData, 'My Page');

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>My Page</title>');
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<script/i);
  });

  it('escapes the title and description', () => {
    const html = exportToHTML(BLANK_PAGE, '<script>alert(1)</script>', 'a "quoted" <b>desc</b>');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a &quot;quoted&quot; &lt;b&gt;desc&lt;/b&gt;');
  });

  it('renders every system template without throwing, using only known components', () => {
    expect(SYSTEM_PAGE_TEMPLATES).toHaveLength(5);
    for (const template of SYSTEM_PAGE_TEMPLATES) {
      const html = exportToHTML(template.puckData, template.name);
      expect(html).toContain('</html>');
      for (const item of template.puckData.content) {
        expect(Object.keys(puckConfig.components)).toContain(item.type);
      }
    }
  });

  it('applies the page theme (font and colors) from root props', () => {
    const html = exportToHTML(
      pageWith('TextBlock', { content: 'Hi' }, { fontFamily: 'serif', pageBackground: '#123456' }),
      'T',
    );

    expect(html).toContain('Georgia');
    expect(html).toContain('#123456');
  });

  it('drops javascript: links from hero buttons and social links', () => {
    const hero = exportToHTML(
      pageWith('HeroSection', { title: 'T', ctaText: 'Go', ctaUrl: 'javascript:alert(1)' }),
      'T',
    );
    expect(hero).not.toContain('javascript:');
    expect(hero).not.toContain('>Go<');

    const social = exportToHTML(
      pageWith('SocialLinks', { links: 'Bad|javascript:alert(1)\nGood|https://ok.com' }),
      'T',
    );
    expect(social).not.toContain('javascript:');
    expect(social).toContain('href="https://ok.com"');
    expect(social).toContain('rel="noopener noreferrer"');
  });

  it('escapes user text instead of injecting markup', () => {
    const html = exportToHTML(pageWith('TextBlock', { content: '<img src=x onerror=alert(1)>' }), 'T');

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('only embeds recognised video hosts', () => {
    const bad = exportToHTML(pageWith('VideoEmbed', { url: 'https://evil.com/x' }), 'T');
    expect(bad).not.toContain('<iframe');

    const good = exportToHTML(pageWith('VideoEmbed', { url: 'https://youtu.be/dQw4w9WgXcQ' }), 'T');
    expect(good).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('filters gallery images to safe URLs', () => {
    const html = exportToHTML(
      pageWith('ImageGallery', { images: 'https://a.com/1.png\ndata:text/html,x\njavascript:x', columns: '2' }),
      'T',
    );

    expect(html).toContain('https://a.com/1.png');
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('javascript:');
  });
});

describe('slugifyFileName', () => {
  it('makes a safe file name', () => {
    expect(slugifyFileName('Menu 2026!')).toBe('menu-2026');
    expect(slugifyFileName('***')).toBe('page');
  });
});
