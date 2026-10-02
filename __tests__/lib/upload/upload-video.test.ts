import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { uploadVideo, videoProblem } from '@/lib/upload/upload-video';

const MB = 1024 * 1024;
const file = (name = 'edit.mp4', size = 3 * MB, type = 'video/mp4'): File => {
  const f = new File([new Uint8Array(8)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

class FakeXhr {
  static last: FakeXhr | null = null;
  static status = 200;
  headers: Record<string, string> = {};
  method = '';
  url = '';
  status = 200;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: FormData | null = null;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
    FakeXhr.last = this;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: FormData): void {
    this.sent = body;
    this.status = FakeXhr.status;
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
      this.onload?.();
    });
  }
}

describe('videoProblem', () => {
  it('accepts a normal video', () => {
    expect(videoProblem(file())).toBeNull();
  });

  it('explains an unsupported type', () => {
    expect(videoProblem(file('film.avi', MB, 'video/x-msvideo'))).toMatch(/MP4, WebM or MOV/);
  });

  it('explains an oversized file with its size', () => {
    expect(videoProblem(file('big.mp4', 80 * MB))).toMatch(/80\.0 MB.*50\.0 MB/);
  });
});

describe('uploadVideo', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    FakeXhr.status = 200;
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });

  it('asks for a link, uploads there with progress, then has the server verify it', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ path: 'p1/abc.mp4', token: 't k', contentType: 'video/mp4' }))
      .mockResolvedValueOnce(reply({ id: 'f1', url: 'https://proj.supabase.co/x.mp4' }));
    const progress = vi.fn();

    const result = await uploadVideo(file(), progress);

    expect(result.id).toBe('f1');
    expect(FakeXhr.last?.method).toBe('PUT');
    expect(FakeXhr.last?.url).toBe('https://proj.supabase.co/storage/v1/object/upload/sign/uploads/p1/abc.mp4?token=t%20k');
    expect(FakeXhr.last?.headers['x-upsert']).toBe('false');
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/upload/video/sign');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/upload/video/complete');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ path: 'p1/abc.mp4', fileName: 'edit.mp4' });
  });

  it('stops before contacting anyone when the file is not acceptable', async () => {
    await expect(uploadVideo(file('x.avi', MB, ''))).rejects.toThrow(/MP4, WebM or MOV/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server’s reason when it refuses to start', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'Videos must be smaller than 50 MB' }, false));

    await expect(uploadVideo(file())).rejects.toThrow('Videos must be smaller than 50 MB');
  });

  it('reports a failed transfer and never asks the server to finish it', async () => {
    fetchMock.mockResolvedValueOnce(reply({ path: 'p1/abc.mp4', token: 't', contentType: 'video/mp4' }));
    FakeXhr.status = 413;

    await expect(uploadVideo(file())).rejects.toThrow(/too large/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the server’s reason when verification fails', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ path: 'p1/abc.mp4', token: 't', contentType: 'video/mp4' }))
      .mockResolvedValueOnce(reply({ error: 'That file is not a valid video' }, false));

    await expect(uploadVideo(file())).rejects.toThrow('That file is not a valid video');
  });
});
