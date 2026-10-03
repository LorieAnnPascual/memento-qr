import { describe, it, expect, vi, afterEach } from 'vitest';

async function loadRewrites() {
  vi.resetModules();
  const config = (await import('../../next.config')).default;
  return config.rewrites!();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('/media rewrite', () => {
  it('forwards only video files to the public uploads bucket', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co/');

    const rewrites = (await loadRewrites()) as { source: string; destination: string }[];

    expect(rewrites).toEqual([
      {
        source: '/media/:folder([A-Za-z0-9_-]+)/:file([A-Za-z0-9_-]+\\.(?:mp4|webm|mov))',
        destination: 'https://proj.supabase.co/storage/v1/object/public/uploads/:folder/:file',
      },
    ]);
  });

  it('adds no rewrite when the storage address is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    expect(await loadRewrites()).toEqual([]);
  });
});
