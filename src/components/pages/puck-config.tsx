import type { Config, CustomField, Slot } from '@puckeditor/core';

import {
  resolveFontStack,
  safeColor,
  safeImageUrl,
  safeLinkUrl,
  toMapEmbedUrl,
  toVideoEmbedUrl,
} from '@/lib/pages/sanitize';

import { ImageFieldInput } from './image-field';

// No hooks or client-only APIs in here: the same config drives the editor,
// the public /p/[shortCode] server render, and the standalone HTML export.

type Alignment = 'left' | 'center' | 'right';

export interface PageProps {
  HeroSection: {
    title: string;
    subtitle: string;
    ctaText: string;
    ctaUrl: string;
    backgroundImage: string;
    backgroundColor: string;
    textColor: string;
    alignment: Alignment;
  };
  TextBlock: { heading: string; content: string; backgroundColor: string; textColor: string };
  ImageGallery: { images: { url: string; alt: string }[]; columns: '2' | '3' | '4' };
  ImageBlock: {
    src: string;
    alt: string;
    caption: string;
    link: string;
    size: 'small' | 'medium' | 'full';
    rounded: 'yes' | 'no';
  };
  ButtonBlock: {
    label: string;
    url: string;
    variant: 'solid' | 'outline';
    color: string;
    alignment: Alignment;
  };
  Columns: { columns: '2' | '3'; column1: Slot; column2: Slot; column3: Slot };
  Spacer: { height: number };
  Divider: { color: string; width: 'short' | 'full' };
  FAQ: { heading: string; items: { question: string; answer: string }[] };
  ContactCard: { name: string; phone: string; email: string; address: string };
  VideoEmbed: { url: string };
  SocialLinks: { links: { label: string; url: string }[] };
  MapEmbed: { address: string };
  Footer: { text: string; backgroundColor: string };
}

export interface RootProps {
  fontFamily: 'sans' | 'serif' | 'elegant' | 'mono';
  pageBackground: string;
  pageBackgroundImage: string;
  pageBackgroundFit: 'cover' | 'contain' | 'tile';
  pageBackgroundAttachment: 'scroll' | 'fixed';
  pageBackgroundOverlay: number;
  pageTextColor: string;
}

function imageField(label: string): CustomField<string> {
  return {
    type: 'custom',
    label,
    render: ({ value, onChange, readOnly }) => (
      <ImageFieldInput label={label} value={value ?? ''} onChange={onChange} readOnly={readOnly} />
    ),
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

const ALIGNMENT_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
] as const;

export const puckConfig: Config<PageProps, RootProps> = {
  root: {
    fields: {
      fontFamily: {
        type: 'select',
        label: 'Font',
        options: [
          { label: 'Modern sans-serif', value: 'sans' },
          { label: 'Classic serif', value: 'serif' },
          { label: 'Elegant serif', value: 'elegant' },
          { label: 'Monospace', value: 'mono' },
        ],
      },
      pageBackground: { type: 'text', label: 'Page background color (hex)' },
      pageBackgroundImage: imageField('Page background image'),
      pageBackgroundFit: {
        type: 'radio',
        label: 'Background image fit',
        options: [
          { label: 'Fill', value: 'cover' },
          { label: 'Fit', value: 'contain' },
          { label: 'Tile', value: 'tile' },
        ],
      },
      pageBackgroundAttachment: {
        type: 'radio',
        label: 'Background scrolling',
        options: [
          { label: 'Scrolls with page', value: 'scroll' },
          { label: 'Stays fixed', value: 'fixed' },
        ],
      },
      pageBackgroundOverlay: {
        type: 'number',
        label: 'Darken background image (0-80%)',
        min: 0,
        max: 80,
      },
      pageTextColor: { type: 'text', label: 'Text color (hex)' },
    },
    defaultProps: {
      fontFamily: 'sans',
      pageBackground: '#ffffff',
      pageBackgroundImage: '',
      pageBackgroundFit: 'cover',
      pageBackgroundAttachment: 'scroll',
      pageBackgroundOverlay: 0,
      pageTextColor: '#1f2937',
    },
    render: ({
      children,
      fontFamily,
      pageBackground,
      pageBackgroundImage,
      pageBackgroundFit,
      pageBackgroundAttachment,
      pageBackgroundOverlay,
      pageTextColor,
    }) => {
      const image = safeImageUrl(pageBackgroundImage);
      const shade = clamp(pageBackgroundOverlay, 0, 80, 0) / 100;
      const layers = image
        ? [
            ...(shade > 0 ? [`linear-gradient(rgba(0,0,0,${shade}), rgba(0,0,0,${shade}))`] : []),
            `url("${encodeURI(image)}")`,
          ].join(', ')
        : undefined;
      const size = pageBackgroundFit === 'contain' ? 'contain' : pageBackgroundFit === 'tile' ? 'auto' : 'cover';

      return (
        <div
          style={{
            fontFamily: resolveFontStack(fontFamily),
            backgroundColor: safeColor(pageBackground, '#ffffff'),
            color: safeColor(pageTextColor, '#1f2937'),
            minHeight: '100vh',
            ...(layers && {
              backgroundImage: layers,
              backgroundSize: size,
              backgroundRepeat: pageBackgroundFit === 'tile' ? 'repeat' : 'no-repeat',
              backgroundPosition: 'center',
              backgroundAttachment: pageBackgroundAttachment === 'fixed' ? 'fixed' : 'scroll',
            }),
          }}
        >
          {children}
        </div>
      );
    },
  },
  categories: {
    layout: { title: 'Layout', components: ['Columns', 'Spacer', 'Divider'] },
    content: { title: 'Content', components: ['HeroSection', 'TextBlock', 'ButtonBlock', 'FAQ'] },
    media: { title: 'Media', components: ['ImageBlock', 'ImageGallery', 'VideoEmbed', 'MapEmbed'] },
    contact: { title: 'Contact & social', components: ['ContactCard', 'SocialLinks', 'Footer'] },
  },
  components: {
    HeroSection: {
      fields: {
        title: { type: 'text', label: 'Title' },
        subtitle: { type: 'textarea', label: 'Subtitle' },
        ctaText: { type: 'text', label: 'CTA button text' },
        ctaUrl: { type: 'text', label: 'CTA button URL' },
        backgroundImage: imageField('Background image'),
        backgroundColor: { type: 'text', label: 'Background color (hex)' },
        textColor: { type: 'text', label: 'Text color (hex)' },
        alignment: { type: 'select', label: 'Alignment', options: [...ALIGNMENT_OPTIONS] },
      },
      defaultProps: {
        title: 'Welcome',
        subtitle: '',
        ctaText: '',
        ctaUrl: '',
        backgroundImage: '',
        backgroundColor: '#1a1a2e',
        textColor: '#ffffff',
        alignment: 'center',
      },
      render: ({ title, subtitle, ctaText, ctaUrl, backgroundImage, backgroundColor, textColor, alignment }) => {
        const bg = safeColor(backgroundColor, '#1a1a2e');
        const fg = safeColor(textColor, '#ffffff');
        const image = safeImageUrl(backgroundImage);
        const href = safeLinkUrl(ctaUrl);
        return (
          <section
            style={{
              backgroundColor: bg,
              color: fg,
              textAlign: alignment,
              padding: '4rem 2rem',
              ...(image && {
                backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url("${encodeURI(image)}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }),
            }}
          >
            <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{title}</h1>
            {subtitle && <p style={{ fontSize: '1.25rem', marginTop: '1rem' }}>{subtitle}</p>}
            {ctaText && href && (
              <a
                href={href}
                style={{
                  display: 'inline-block',
                  marginTop: '1.5rem',
                  padding: '0.75rem 2rem',
                  backgroundColor: fg,
                  color: bg,
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                }}
              >
                {ctaText}
              </a>
            )}
          </section>
        );
      },
    },

    TextBlock: {
      fields: {
        heading: { type: 'text', label: 'Heading (optional)' },
        content: { type: 'textarea', label: 'Content' },
        backgroundColor: { type: 'text', label: 'Background color (hex, empty = see-through)' },
        textColor: { type: 'text', label: 'Text color (hex, empty = page text color)' },
      },
      defaultProps: { heading: '', content: 'Your text here...', backgroundColor: '', textColor: '' },
      render: ({ heading, content, backgroundColor, textColor }) => (
        <section
          style={{
            backgroundColor: safeColor(backgroundColor, 'transparent'),
            color: safeColor(textColor, 'inherit'),
            padding: '2rem',
          }}
        >
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            {heading && (
              <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>{heading}</h2>
            )}
            <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{content}</p>
          </div>
        </section>
      ),
    },

    ImageGallery: {
      fields: {
        images: {
          type: 'array',
          label: 'Images',
          arrayFields: {
            url: imageField('Image'),
            alt: { type: 'text', label: 'Description (for screen readers)' },
          },
          defaultItemProps: { url: '', alt: '' },
          getItemSummary: (item, index) => item.alt || `Image ${(index ?? 0) + 1}`,
        },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '4', value: '4' },
          ],
        },
      },
      defaultProps: { images: [], columns: '3' },
      render: ({ images, columns }) => {
        const items = (Array.isArray(images) ? images : [])
          .map((image) => ({ url: safeImageUrl(image.url), alt: image.alt ?? '' }))
          .filter((image) => image.url);
        return (
          <section style={{ padding: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1rem' }}>
              {items.map((image, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary team-entered URLs, also used in standalone HTML export
                <img key={i} src={image.url} alt={image.alt} style={{ width: '100%', borderRadius: '8px' }} />
              ))}
            </div>
          </section>
        );
      },
    },

    ContactCard: {
      fields: {
        name: { type: 'text', label: 'Name' },
        phone: { type: 'text', label: 'Phone' },
        email: { type: 'text', label: 'Email' },
        address: { type: 'textarea', label: 'Address' },
      },
      defaultProps: { name: '', phone: '', email: '', address: '' },
      render: ({ name, phone, email, address }) => {
        const tel = phone.replace(/[^\d+]/g, '');
        return (
          <section style={{ padding: '2rem' }}>
            <div style={{ maxWidth: '480px', margin: '0 auto' }}>
              {name && <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{name}</h3>}
              {phone && (
                <p>
                  Phone: <a href={`tel:${tel}`}>{phone}</a>
                </p>
              )}
              {email && (
                <p>
                  Email: <a href={safeLinkUrl(`mailto:${email}`)}>{email}</a>
                </p>
              )}
              {address && <p style={{ whiteSpace: 'pre-wrap' }}>Address: {address}</p>}
            </div>
          </section>
        );
      },
    },

    VideoEmbed: {
      fields: { url: { type: 'text', label: 'YouTube or Vimeo URL' } },
      defaultProps: { url: '' },
      render: ({ url }) => {
        const embedUrl = toVideoEmbedUrl(url);
        return (
          <section style={{ padding: '2rem' }}>
            {embedUrl ? (
              <div style={{ maxWidth: '720px', margin: '0 auto', aspectRatio: '16/9' }}>
                <iframe
                  src={embedUrl}
                  title="Embedded video"
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
                  allowFullScreen
                />
              </div>
            ) : (
              <p style={{ textAlign: 'center', opacity: 0.6 }}>Add a YouTube or Vimeo link.</p>
            )}
          </section>
        );
      },
    },

    SocialLinks: {
      fields: {
        links: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            url: { type: 'text', label: 'URL' },
          },
          defaultItemProps: { label: 'Website', url: 'https://' },
          getItemSummary: (item) => item.label || 'Link',
        },
      },
      defaultProps: { links: [] },
      render: ({ links }) => {
        const items = (Array.isArray(links) ? links : [])
          .map((link) => ({ label: (link.label ?? '').trim(), url: safeLinkUrl(link.url) }))
          .filter((item) => item.label && item.url);
        return (
          <section style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {items.map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '0.5rem 1.5rem',
                    backgroundColor: '#1a1a2e',
                    color: '#fff',
                    borderRadius: '2rem',
                    textDecoration: 'none',
                  }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </section>
        );
      },
    },

    MapEmbed: {
      fields: { address: { type: 'text', label: 'Address' } },
      defaultProps: { address: '' },
      render: ({ address }) => {
        const src = toMapEmbedUrl(address);
        return (
          <section style={{ padding: '2rem' }}>
            {src ? (
              <iframe
                src={src}
                title="Map"
                style={{ width: '100%', height: '300px', border: 'none', borderRadius: '8px' }}
              />
            ) : (
              <p style={{ textAlign: 'center', opacity: 0.6 }}>Add an address to show a map.</p>
            )}
          </section>
        );
      },
    },

    ImageBlock: {
      fields: {
        src: imageField('Image'),
        alt: { type: 'text', label: 'Description (for screen readers)' },
        caption: { type: 'text', label: 'Caption (optional)' },
        link: { type: 'text', label: 'Link when clicked (optional)' },
        size: {
          type: 'radio',
          label: 'Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Full width', value: 'full' },
          ],
        },
        rounded: {
          type: 'radio',
          label: 'Rounded corners',
          options: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ],
        },
      },
      defaultProps: { src: '', alt: '', caption: '', link: '', size: 'medium', rounded: 'yes' },
      render: ({ src, alt, caption, link, size, rounded }) => {
        const url = safeImageUrl(src);
        const href = safeLinkUrl(link);
        const maxWidth = size === 'small' ? '280px' : size === 'full' ? '100%' : '560px';
        if (!url) {
          return (
            <section style={{ padding: '2rem' }}>
              <p style={{ textAlign: 'center', opacity: 0.6 }}>Add an image.</p>
            </section>
          );
        }
        const image = (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary team-entered URLs, also used in standalone HTML export
          <img
            src={url}
            alt={alt}
            style={{ width: '100%', display: 'block', borderRadius: rounded === 'yes' ? '12px' : 0 }}
          />
        );
        return (
          <section style={{ padding: '2rem', textAlign: 'center' }}>
            <figure style={{ maxWidth, margin: '0 auto' }}>
              {href ? <a href={href}>{image}</a> : image}
              {caption && <figcaption style={{ marginTop: '0.5rem', opacity: 0.75 }}>{caption}</figcaption>}
            </figure>
          </section>
        );
      },
    },

    ButtonBlock: {
      fields: {
        label: { type: 'text', label: 'Button text' },
        url: { type: 'text', label: 'Link (https://, mailto:, tel:)' },
        variant: {
          type: 'radio',
          label: 'Style',
          options: [
            { label: 'Solid', value: 'solid' },
            { label: 'Outline', value: 'outline' },
          ],
        },
        color: { type: 'text', label: 'Button color (hex)' },
        alignment: { type: 'select', label: 'Alignment', options: [...ALIGNMENT_OPTIONS] },
      },
      defaultProps: { label: 'Learn more', url: '', variant: 'solid', color: '#1a1a2e', alignment: 'center' },
      render: ({ label, url, variant, color, alignment }) => {
        const href = safeLinkUrl(url);
        const accent = safeColor(color, '#1a1a2e');
        const solid = variant !== 'outline';
        return (
          <section style={{ padding: '1rem 2rem', textAlign: alignment }}>
            {label && href ? (
              <a
                href={href}
                style={{
                  display: 'inline-block',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  textDecoration: 'none',
                  border: `2px solid ${accent}`,
                  backgroundColor: solid ? accent : 'transparent',
                  color: solid ? '#ffffff' : accent,
                }}
              >
                {label}
              </a>
            ) : (
              <p style={{ opacity: 0.6 }}>Add button text and a link.</p>
            )}
          </section>
        );
      },
    },

    Columns: {
      fields: {
        columns: {
          type: 'radio',
          label: 'Columns',
          options: [
            { label: '2', value: '2' },
            { label: '3', value: '3' },
          ],
        },
        column1: { type: 'slot', disallow: ['Columns'] },
        column2: { type: 'slot', disallow: ['Columns'] },
        column3: { type: 'slot', disallow: ['Columns'] },
      },
      defaultProps: { columns: '2', column1: [], column2: [], column3: [] },
      render: ({ columns, column1: Column1, column2: Column2, column3: Column3 }) => (
        <section style={{ padding: '1rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(${columns === '3' ? '200px' : '280px'}, 1fr))`,
              gap: '1rem',
            }}
          >
            <Column1 />
            <Column2 />
            {columns === '3' && <Column3 />}
          </div>
        </section>
      ),
    },

    Spacer: {
      fields: { height: { type: 'number', label: 'Height (px)', min: 8, max: 240 } },
      defaultProps: { height: 40 },
      render: ({ height }) => <div aria-hidden style={{ height: `${clamp(height, 8, 240, 40)}px` }} />,
    },

    Divider: {
      fields: {
        color: { type: 'text', label: 'Line color (hex)' },
        width: {
          type: 'radio',
          label: 'Width',
          options: [
            { label: 'Short', value: 'short' },
            { label: 'Full', value: 'full' },
          ],
        },
      },
      defaultProps: { color: '#9ca3af', width: 'short' },
      render: ({ color, width }) => (
        <div style={{ padding: '1rem 2rem' }}>
          <hr
            style={{
              border: 0,
              borderTop: `2px solid ${safeColor(color, '#9ca3af')}`,
              width: width === 'full' ? '100%' : '80px',
              margin: '0 auto',
            }}
          />
        </div>
      ),
    },

    FAQ: {
      fields: {
        heading: { type: 'text', label: 'Heading (optional)' },
        items: {
          type: 'array',
          label: 'Questions',
          arrayFields: {
            question: { type: 'text', label: 'Question' },
            answer: { type: 'textarea', label: 'Answer' },
          },
          defaultItemProps: { question: 'Question', answer: 'Answer' },
          getItemSummary: (item) => item.question || 'Question',
        },
      },
      defaultProps: { heading: 'Frequently asked questions', items: [] },
      render: ({ heading, items }) => (
        <section style={{ padding: '2rem' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            {heading && <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1rem' }}>{heading}</h2>}
            {(Array.isArray(items) ? items : []).map((item, i) => (
              <details key={i} style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(128,128,128,0.35)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{item.question}</summary>
                <p style={{ marginTop: '0.5rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ),
    },

    Footer: {
      fields: {
        text: { type: 'text', label: 'Footer text' },
        backgroundColor: { type: 'text', label: 'Background color (hex)' },
      },
      defaultProps: { text: '© 2026 Memento', backgroundColor: '#1a1a2e' },
      render: ({ text, backgroundColor }) => (
        <footer
          style={{
            backgroundColor: safeColor(backgroundColor, '#1a1a2e'),
            color: '#ffffff',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <p>{text}</p>
        </footer>
      ),
    },
  },
};
