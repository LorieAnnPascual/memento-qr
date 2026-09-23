import type { Data } from '@puckeditor/core';

import { STANDALONE_PAGE_CSP } from './csp';

// The renderer pulls in react-dom/server, which Next.js only allows outside
// server components, so it is loaded on demand in the browser.

/** Builds and downloads a standalone .html file for a page design. */
export async function downloadPageHtml(name: string, data: Data): Promise<void> {
  const { exportToHTML, slugifyFileName } = await import('./html-exporter');
  const html = exportToHTML(data, name);

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slugifyFileName(name)}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** HTML for a sandboxed preview iframe (`srcDoc`), with a no-scripts CSP baked in. */
export async function buildPreviewHtml(name: string, data: Data): Promise<string> {
  const { exportToHTML } = await import('./html-exporter');
  return exportToHTML(data, name).replace(
    '<head>',
    `<head>\n  <meta http-equiv="Content-Security-Policy" content="${STANDALONE_PAGE_CSP}">`,
  );
}
