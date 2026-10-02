import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UploadedFile } from '@/lib/db/schema';

const uploadVideoMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/upload/upload-video', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/upload/upload-video')>()),
  uploadVideo: uploadVideoMock,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';

import { MediaLibrary } from '@/components/media/media-library';
import { MediaPickerButton } from '@/components/media/media-picker';

const MB = 1024 * 1024;
const file = (over: Partial<UploadedFile>): UploadedFile => ({
  id: 'id',
  userId: 'u',
  fileName: 'file.png',
  fileSize: 1000,
  mimeType: 'image/png',
  storagePath: 'u/file.png',
  publicUrl: 'https://s.example/file.png',
  createdAt: new Date(),
  ...over,
});

const IMAGE = file({ id: 'i1', fileName: 'logo.png' });
const VIDEO = file({
  id: 'v1',
  fileName: 'tribute.mp4',
  fileSize: 12 * MB,
  mimeType: 'video/mp4',
  publicUrl: 'https://s.example/tribute.mp4',
});

describe('MediaPickerButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ files: [IMAGE, VIDEO] }) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers only images by default, so a video can never land in an image field', async () => {
    const onSelect = vi.fn();
    render(<MediaPickerButton onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /choose from media/i }));

    expect(await screen.findByText('logo.png')).toBeInTheDocument();
    expect(screen.queryByText('tribute.mp4')).not.toBeInTheDocument();
  });

  it('offers only videos for a video field and returns the chosen one', async () => {
    const onSelect = vi.fn();
    render(<MediaPickerButton kind="video" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /choose from media/i }));
    await userEvent.click(await screen.findByText('tribute.mp4'));

    expect(screen.queryByText('logo.png')).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith('https://s.example/tribute.mp4');
  });

  it('says so when there are no videos yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ files: [IMAGE] }) }));
    render(<MediaPickerButton kind="video" onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /choose from media/i }));

    expect(await screen.findByText(/no uploaded videos yet/i)).toBeInTheDocument();
  });
});

describe('MediaLibrary with videos', () => {
  beforeEach(() => {
    uploadVideoMock.mockReset();
    vi.mocked(toast.error).mockClear();
  });

  it('shows videos with a player and their size, and images as before', () => {
    render(<MediaLibrary initialFiles={[IMAGE, VIDEO]} />);

    expect(screen.getByLabelText('tribute.mp4', { selector: 'video' })).toHaveAttribute(
      'src',
      'https://s.example/tribute.mp4#t=0.1',
    );
    expect(screen.getByText(/Video · 12\.0 MB/)).toBeInTheDocument();
    expect(screen.getByAltText('logo.png')).toBeInTheDocument();
  });

  it('shows how much storage is used', () => {
    render(<MediaLibrary initialFiles={[IMAGE, VIDEO]} />);

    expect(screen.getByText(/Storage used: 12\.0 MB of 1\.00 GB/)).toBeInTheDocument();
  });

  it('warns when storage is nearly full', () => {
    const huge = file({ id: 'v2', fileName: 'big.mp4', mimeType: 'video/mp4', fileSize: 900 * MB });
    render(<MediaLibrary initialFiles={[huge]} />);

    expect(screen.getByText(/delete files you no longer need/i)).toBeInTheDocument();
  });

  it('copies a file’s link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MediaLibrary initialFiles={[VIDEO]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy link to tribute.mp4' }));

    expect(writeText).toHaveBeenCalledWith('https://s.example/tribute.mp4');
  });

  it('uploads a chosen video straight to storage and adds it to the list', async () => {
    const uploaded = file({ id: 'v9', fileName: 'new edit.mp4', mimeType: 'video/mp4', publicUrl: 'https://s.example/new.mp4' });
    uploadVideoMock.mockResolvedValue(uploaded);
    const { container } = render(<MediaLibrary initialFiles={[]} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'new edit.mp4', { type: 'video/mp4' })] } });

    await waitFor(() => expect(screen.getByLabelText('new edit.mp4', { selector: 'video' })).toBeInTheDocument());
    expect(uploadVideoMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the library unchanged when a video upload fails', async () => {
    uploadVideoMock.mockImplementation(async () => {
      throw new Error('too big');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<MediaLibrary initialFiles={[]} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.mp4', { type: 'video/mp4' })] } });

    // The failure is reported to the person, and nothing is added to the library.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('too big'));
    expect(screen.getByText(/no media uploaded yet/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('accepts videos in the file chooser', () => {
    const { container } = render(<MediaLibrary initialFiles={[]} />);

    expect(container.querySelector('input[type="file"]')?.getAttribute('accept')).toContain('video/mp4');
  });
});
