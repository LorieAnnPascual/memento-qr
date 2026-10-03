import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const uploadVideoMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/upload/upload-video', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/upload/upload-video')>()),
  uploadVideo: uploadVideoMock,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { QRDesigner } from '@/components/qr/qr-designer';

const APP = 'https://memento-qr.vercel.app';
const UPLOADED = {
  id: 'f1',
  fileName: 'tribute.mp4',
  fileSize: 5 * 1024 * 1024,
  url: `${APP}/media/p/abcdefghij123.mp4`,
};

describe('QRDesigner video type', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/templates') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
        }
        if (url.startsWith('/api/slugs/check')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ available: true }) } as Response);
        }
        return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
      }),
    );
    uploadVideoMock.mockReset();
  });

  it('turns dynamic on and locks the switch, with an explanation', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();
    const toggle = screen.getByRole('switch', { name: 'Make this dynamic' });
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByTestId('qr-type-video'));

    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText('Video codes are always dynamic so the video can be replaced without reprinting.'),
    ).toBeInTheDocument();
  });

  it('shows the link name field once, in the Content tab, for a video code', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('qr-type-video'));

    expect(screen.getAllByLabelText('Custom link name (optional)')).toHaveLength(1);
    expect(screen.getByLabelText('Custom link name (optional)').closest('[role="tabpanel"]')).toHaveAttribute(
      'id',
      expect.stringContaining('content'),
    );
  });

  it('keeps the link name field in the Dynamic QR tab for other types', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: 'Make this dynamic' }));

    expect(screen.getByLabelText('Custom link name (optional)').closest('[role="tabpanel"]')).toHaveAttribute(
      'id',
      expect.stringContaining('dynamic'),
    );
  });

  it('uploads a video, previews it with its name and size, and uses it as the content', async () => {
    uploadVideoMock.mockImplementation(async (_file: File, onProgress: (n: number) => void) => {
      onProgress(0.5);
      return UPLOADED;
    });
    render(<QRDesigner />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('qr-type-video'));

    const file = new File([new Uint8Array(10)], 'tribute.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByTestId('video-file-input'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('video-file-meta')).toHaveTextContent('tribute.mp4'));
    expect(screen.getByTestId('video-file-meta')).toHaveTextContent('5.0 MB');
    expect(screen.getByTestId('video-selected').querySelector('video')).toHaveAttribute(
      'src',
      `${UPLOADED.url}#t=0.1`,
    );
  });

  it('asks for a video before saving', async () => {
    const { toast } = await import('sonner');
    render(<QRDesigner />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('qr-type-video'));
    await user.type(screen.getByLabelText(/^Name/), 'Memorial');

    await user.click(screen.getByRole('button', { name: 'Save QR code' }));

    expect(toast.error).toHaveBeenCalledWith('Upload or choose a video first.');
  });
});
