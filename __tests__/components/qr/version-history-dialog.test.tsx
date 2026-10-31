import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VersionHistoryDialog } from '@/components/qr/version-history-dialog';

const VERSIONS = [
  { id: 'v2', number: 2, isCurrent: true, summary: 'Changed type, destination', isRestore: false, createdAt: '2026-10-31T01:00:00Z', changedBy: 'Maria', name: 'Memorial', qrType: 'video', destination: 'http://x/new.mp4' },
  { id: 'v1', number: 1, isCurrent: false, summary: 'Original version', isRestore: false, createdAt: '2026-10-01T01:00:00Z', changedBy: null, name: 'Memorial', qrType: 'url', destination: 'https://canva.example/old' },
];

describe('VersionHistoryDialog', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the versions with the current one marked and no restore button on it', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ versions: VERSIONS }) });
    render(<VersionHistoryDialog qrId="qr-1" qrName="Memorial" />);

    await userEvent.click(screen.getByTestId('version-history'));

    await waitFor(() => expect(screen.getByTestId('version-2')).toBeInTheDocument());
    expect(screen.getByTestId('version-2')).toHaveTextContent('Current');
    expect(screen.getByTestId('version-2')).not.toHaveTextContent('Restore');
    expect(screen.getByTestId('version-1')).toHaveTextContent('Original version');
    expect(fetchMock).toHaveBeenCalledWith('/api/qr/qr-1/versions');
  });

  it('asks before restoring and sends the restore for the chosen version', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ versions: VERSIONS }) });
    vi.stubGlobal('location', { ...window.location, reload: vi.fn() });
    render(<VersionHistoryDialog qrId="qr-1" qrName="Memorial" />);

    await userEvent.click(screen.getByTestId('version-history'));
    await waitFor(() => expect(screen.getByTestId('version-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /restore/i }));

    expect(screen.getByText('Restore version 1?')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getAllByRole('button', { name: /^restore$/i }).at(-1)!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/qr/qr-1/versions/v1/restore', { method: 'POST' }),
    );
  });

  it('says so when the history cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({ ok: false });
    render(<VersionHistoryDialog qrId="qr-1" qrName="Memorial" />);

    await userEvent.click(screen.getByTestId('version-history'));

    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
  });
});
