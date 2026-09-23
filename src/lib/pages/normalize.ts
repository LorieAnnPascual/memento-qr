import type { Data } from '@puckeditor/core';

// Early pages stored the gallery and social links as text lists. They are now
// array fields, so old data is upgraded whenever it is loaded or rendered.

interface ComponentLike {
  type: string;
  props: Record<string, unknown>;
}

function isComponent(value: unknown): value is ComponentLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.props === 'object' &&
    candidate.props !== null
  );
}

function nonEmptyLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function upgradeProps(type: string, props: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...props };

  if (type === 'ImageGallery' && typeof props.images === 'string') {
    next.images = nonEmptyLines(props.images).map((url) => ({ url, alt: '' }));
  }
  if (type === 'SocialLinks' && typeof props.links === 'string') {
    next.links = nonEmptyLines(props.links).map((line) => {
      const [label = '', url = ''] = line.split('|');
      return { label: label.trim(), url: url.trim() };
    });
  }

  // Slot contents (e.g. Columns) are arrays of nested components.
  for (const [key, value] of Object.entries(next)) {
    if (Array.isArray(value) && value.some(isComponent)) {
      next[key] = value.map((item) =>
        isComponent(item) ? { ...item, props: upgradeProps(item.type, item.props) } : item,
      );
    }
  }
  return next;
}

/** Returns page data with legacy text-list props converted to array props. */
export function normalizePageData(data: Data): Data {
  const content = Array.isArray(data.content) ? data.content : [];
  return {
    ...data,
    content: content.map((item) =>
      isComponent(item) ? { ...item, props: upgradeProps(item.type, item.props) } : item,
    ) as Data['content'],
  };
}
