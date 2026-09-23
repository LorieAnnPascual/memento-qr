import type { APIRequestContext } from '@playwright/test';

export interface CreatedQR {
  id: string;
  shortCode: string | null;
  name: string;
  payload: string;
}

let counter = 0;

/** Unique, tagged name so teardown (and a human) can tell test data apart. */
export function qaName(label: string): string {
  counter += 1;
  return `[QA] e2e ${label} ${Date.now().toString(36)}${counter}`;
}

/** Creates a QR code through the real API as the signed-in user. */
export async function createQR(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<CreatedQR> {
  const response = await request.post('/api/qr', {
    data: {
      name: qaName('qr'),
      qrType: 'url',
      payload: 'https://example.com/e2e',
      styleConfig: { dotStyle: 'rounded', dotColor: '#000000', backgroundColor: '#FFFFFF' },
      ...overrides,
    },
  });
  if (!response.ok()) throw new Error(`createQR failed: ${response.status()} ${await response.text()}`);
  return response.json() as Promise<CreatedQR>;
}

export async function deleteQR(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`/api/qr/${id}`);
}

export async function createPage(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const response = await request.post('/api/pages', {
    data: { name: qaName('page'), category: 'custom', ...overrides },
  });
  if (!response.ok()) throw new Error(`createPage failed: ${response.status()} ${await response.text()}`);
  return response.json() as Promise<{ id: string; name: string }>;
}

export async function deletePage(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`/api/pages/${id}`);
}
