import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VersionHistoryDialog } from '@/components/qr/version-history-dialog';

const VERSIONS = [
  { id: 'v2', number: 2, isCurrent: true, summary: 'Changed type, destination', isRestore: false, createdAt: '2026-10-31T01:00:00Z', changedBy: 'Maria', name: 'Memorial', qrType: 'video', destination: 'http://x/new.mp4' },
  { id: 'v1', number: 1, isCurrent: false, summary: 'Original version', isRestore: false, createdAt: '2026-10-01T01:00:00Z', changedBy: null, name: 'Memorial', qrType: 'url', destination: 'https://canva.example/old' },
];

const DETAIL = {
  id: 'v1',
  rows: [
    { label: 'Type', now: 'video', then: 'url' },
    { label: 'Destination', now: 'http://x/new.mp4', then: 'https://canva.example/old' },
  ],
  canRestore: true,
};

function respond(body: unknown, ok = true): Promise<unknown> {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe('VersionHistoryDialog', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/qr/qr-1/versions') return respond({ versions: VERSIONS });
      if (url === '/api/qr/qr-1/versions/v1') return respond(DETAIL);
      if (url === '/api/qr/qr-1/versions/v1/restore') return respond({});
      return respond({}, false);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the versions and marks the current one', async () => {
    render(<VersionHistoryDialog qrId="qr-1" qrName="Memorial" />);

    await userEvent.click(screen.getByTestId('version-history'));

    await waitFor(() => expect(screen.getByTestId('version-2')).toBeInTheDocument());
    expect(screen.getByTestId('version-2')).toHaveTextContent('Current');
    expect(screen.getByTestId('version-1')).toHaveTextContent('Original version');
  });

  it('shows how a picked version differs from now before offering to use it', async () => {
    render(<VersionHistoryDialog qrId="qr-1" qrName="Memorial" />);

    await userEvent.click(screen.getByTestId('version-history'));
    await waitFor(() => expect(screen.getByTestId('version-1')).toBeInTheDocument());
    await userEvent.click(within(screen.getByTestId('version-1')).getAllByRole('button')[0]);

    const preview = await screen.findByTestId('version-preview');
    await waitFor(() => expect(preview).toHaveTextContent('https://canva.example/old'));
    expect(preview).toHaveTextContent('In this version');
    expect(screen.getByRole('button', { name: 'Use this version' })).toBeInTheDocument();
  });

  it('asks before restoring and sends the restore for the picked version', async () => {
    const fakeLocation = { href: '' };
    vi.stubGlobal('location', fakeLocation);
    render(<VersionHistoryDialog qrId="qr-1" qrName="Memorial" />);

    await userEvent.click(screen.getByTestId('version-history'));
    await waitFor(() => expect(screen.getByTestId('version-1')).toBeInTheDocument());
    await userEvent.click(within(screen.getByTestId('version-1')).getAllByRole('button')[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Use this version' }));

    expect(screen.getByText('Use version 1?')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/qr/qr-1/versions/v1/restore', expect.anything());

    await userEvent.click(screen.getAllByRole('button', { name: 'Use this version' }).at(-1)!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/qr/qr-1/versions/v1/restore', { method: 'POST' }),
    );
    await waitFor(() => expect(fakeLocation.href).toBe('/qr/qr-1'));
  });

  it('opens straight on a version it was linked to', async () => {
    render(<VersionHistoryDialog qrId="qr-1" qrName="Memorial" openVersionId="v1" />);

    expect(await screen.findByText('Version history', { selector: '[data-slot="dialog-title"], h2' })).toBeInTheDocument();
    expect(await screen.findByTestId('version-preview')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/qr/qr-1/versions/v1');
  });

  it('says so when the history cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockImplementation(() => respond({}, false));
    render(<VersionHistoryDialog qrId="qr-1" qrName="Memorial" />);

    await userEvent.click(screen.getByTestId('version-history'));

    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
  });
});
