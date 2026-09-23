import { Render, type Data } from '@puckeditor/core';
import { renderToStaticMarkup } from 'react-dom/server';

import { puckConfig } from '@/components/pages/puck-config';
import { normalizePageData } from '@/lib/pages/normalize';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Renders Puck JSON into a complete, self-contained HTML document (all CSS inline, no external assets). */
export function exportToHTML(puckData: Data, title: string, description?: string): string {
  const bodyHTML = renderToStaticMarkup(<Render config={puckConfig} data={normalizePageData(puckData)} />);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
${description ? `  <meta name="description" content="${escapeHtml(description)}">
` : ''}  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    img { max-width: 100%; height: auto; }
    a { color: inherit; }
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
}

/** File-name-safe slug for the downloaded .html file. */
export function slugifyFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'page'
  );
}
