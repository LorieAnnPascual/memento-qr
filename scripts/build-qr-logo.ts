/**
 * Builds `public/memento-qr-logo.png`, the small logo placed in the middle of every QR code by
 * default, from the full artwork in `public/logo.svg` (a 500 KB traced drawing, far too heavy to
 * load into every preview and to embed in every download). The result is a transparent square,
 * so the logo is drawn at the same relative size whatever its shape.
 *
 *   pnpm tsx scripts/build-qr-logo.ts
 *
 * Re-run it whenever `public/logo.svg` changes.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

const SIZE = 384;

async function main(): Promise<void> {
  const svg = readFileSync(resolve('public/logo.svg'), 'utf8');
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
    await page.setContent(`<!DOCTYPE html>
      <html><body style="margin:0;background:transparent;width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center">
        <img id="logo" src="${dataUri}" style="max-width:100%;max-height:100%;object-fit:contain" />
      </body></html>`);
    await page.waitForFunction(() => {
      const image = document.getElementById('logo') as HTMLImageElement | null;
      return Boolean(image?.complete && image.naturalWidth > 0);
    });

    const output = resolve('public/memento-qr-logo.png');
    await page.screenshot({ path: output, omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
    console.log(`wrote ${output} (${(statSync(output).size / 1024).toFixed(1)} KB, ${SIZE}x${SIZE})`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
