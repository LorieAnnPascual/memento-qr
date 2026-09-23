import { describe, it, expect } from 'vitest';
import type { Data } from '@puckeditor/core';

import { exportToHTML } from '@/lib/pages/html-exporter';
import { normalizePageData } from '@/lib/pages/normalize';

function page(root: Record<string, unknown>, content: unknown[] = []): Data {
  return { root: { props: root }, content, zones: {} } as unknown as Data;
}

function block(type: string, props: Record<string, unknown>): unknown {
  return { type, props: { id: `${type}-1`, ...props } };
}

describe('normalizePageData', () => {
  it('upgrades legacy gallery and social text lists to arrays', () => {
    const data = page({}, [
      block('ImageGallery', { images: 'https://a.test/1.png\n\nhttps://a.test/2.png', columns: '3' }),
      block('SocialLinks', { links: 'Site|https://a.test\nMail|mailto:a@a.test' }),
    ]);

    const [gallery, social] = normalizePageData(data).content as unknown as {
      props: { images?: unknown; links?: unknown };
    }[];

    expect(gallery.props.images).toEqual([
      { url: 'https://a.test/1.png', alt: '' },
      { url: 'https://a.test/2.png', alt: '' },
    ]);
    expect(social.props.links).toEqual([
      { label: 'Site', url: 'https://a.test' },
      { label: 'Mail', url: 'mailto:a@a.test' },
    ]);
  });

  it('upgrades blocks nested inside column slots', () => {
    const data = page({}, [
      block('Columns', {
        columns: '2',
        column1: [block('SocialLinks', { links: 'Site|https://a.test' })],
        column2: [],
      }),
    ]);

    const [columns] = normalizePageData(data).content as unknown as {
      props: { column1: { props: { links: unknown } }[] };
    }[];

    expect(columns.props.column1[0].props.links).toEqual([{ label: 'Site', url: 'https://a.test' }]);
  });

  it('leaves already-upgraded data untouched', () => {
    const images = [{ url: 'https://a.test/1.png', alt: 'One' }];
    const data = page({}, [block('ImageGallery', { images, columns: '2' })]);

    const [gallery] = normalizePageData(data).content as unknown as { props: { images: unknown } }[];

    expect(gallery.props.images).toEqual(images);
  });
});

describe('page background', () => {
  it('renders the color, image, overlay and fixed scrolling on the page wrapper', () => {
    const html = exportToHTML(
      page({
        pageBackground: '#112233',
        pageBackgroundImage: 'https://cdn.test/bg.jpg',
        pageBackgroundFit: 'cover',
        pageBackgroundAttachment: 'fixed',
        pageBackgroundOverlay: 40,
      }),
      'Bg',
    );

    expect(html).toContain('background-color:#112233');
    expect(html).toContain('url(&quot;https://cdn.test/bg.jpg&quot;)');
    expect(html).toContain('rgba(0,0,0,0.4)');
    expect(html).toContain('background-attachment:fixed');
    expect(html).toContain('background-size:cover');
  });

  it('tiles the image when asked to', () => {
    const html = exportToHTML(
      page({ pageBackgroundImage: 'https://cdn.test/tile.png', pageBackgroundFit: 'tile' }),
      'Bg',
    );

    expect(html).toContain('background-repeat:repeat');
  });

  it('caps the darkening at 80%', () => {
    const html = exportToHTML(
      page({ pageBackgroundImage: 'https://cdn.test/bg.jpg', pageBackgroundOverlay: 999 }),
      'Bg',
    );

    expect(html).toContain('rgba(0,0,0,0.8)');
  });

  it('drops a background image with an unsafe protocol', () => {
    const html = exportToHTML(page({ pageBackgroundImage: 'javascript:alert(1)' }), 'Bg');

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('background-image');
  });

  it('has no background image by default', () => {
    expect(exportToHTML(page({}), 'Bg')).not.toContain('background-image');
  });
});

describe('new blocks', () => {
  it('drops unsafe button links and shows a hint instead', () => {
    const html = exportToHTML(
      page({}, [block('ButtonBlock', { label: 'Click', url: 'javascript:alert(1)', variant: 'solid', color: '#000000', alignment: 'center' })]),
      'Btn',
    );

    expect(html).not.toContain('javascript:');
    expect(html).toContain('Add button text and a link.');
  });

  it('renders a safe button as a link', () => {
    const html = exportToHTML(
      page({}, [block('ButtonBlock', { label: 'Call us', url: 'tel:+1234567', variant: 'outline', color: '#ff0000', alignment: 'left' })]),
      'Btn',
    );

    expect(html).toContain('href="tel:+1234567"');
    expect(html).toContain('Call us');
  });

  it('renders images with their description and refuses unsafe sources', () => {
    const ok = exportToHTML(
      page({}, [block('ImageBlock', { src: 'https://cdn.test/a.png', alt: 'A dog', caption: 'Rex', link: '', size: 'medium', rounded: 'yes' })]),
      'Img',
    );
    const bad = exportToHTML(
      page({}, [block('ImageBlock', { src: 'data:text/html,<script>1</script>', alt: '', caption: '', link: '', size: 'medium', rounded: 'yes' })]),
      'Img',
    );

    expect(ok).toContain('alt="A dog"');
    expect(ok).toContain('Rex');
    expect(bad).not.toContain('data:text/html');
    expect(bad).toContain('Add an image.');
  });

  it('renders gallery images from the array field with alt text', () => {
    const html = exportToHTML(
      page({}, [block('ImageGallery', { images: [{ url: 'https://cdn.test/1.png', alt: 'First' }, { url: 'javascript:1', alt: 'Bad' }], columns: '2' })]),
      'Gal',
    );

    expect(html).toContain('alt="First"');
    expect(html).not.toContain('Bad');
  });

  it('renders FAQ entries as escaped, collapsible details', () => {
    const html = exportToHTML(
      page({}, [block('FAQ', { heading: 'Help', items: [{ question: 'Where?', answer: '<script>alert(1)</script>' }] })]),
      'Faq',
    );

    expect(html).toContain('<details');
    expect(html).toContain('Where?');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders content placed inside columns', () => {
    const html = exportToHTML(
      page({}, [
        block('Columns', {
          columns: '2',
          column1: [block('TextBlock', { heading: '', content: 'Left side', backgroundColor: '', textColor: '' })],
          column2: [block('TextBlock', { heading: '', content: 'Right side', backgroundColor: '', textColor: '' })],
          column3: [],
        }),
      ]),
      'Cols',
    );

    expect(html).toContain('Left side');
    expect(html).toContain('Right side');
  });

  it('clamps spacer height', () => {
    const html = exportToHTML(page({}, [block('Spacer', { height: 5000 })]), 'Sp');

    expect(html).toContain('height:240px');
  });

  it('lets the page background show through text blocks by default', () => {
    const html = exportToHTML(
      page({}, [block('TextBlock', { heading: '', content: 'Hi', backgroundColor: '', textColor: '' })]),
      'Tx',
    );

    expect(html).toContain('background-color:transparent');
    expect(html).toContain('color:inherit');
  });
});
