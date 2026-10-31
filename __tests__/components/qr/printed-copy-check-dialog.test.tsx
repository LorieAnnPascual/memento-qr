import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { readQrFromFileMock } = vi.hoisted(() => ({ readQrFromFileMock: vi.fn() }));

vi.mock('@/lib/qr/read-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/qr/read-image')>()),
  readQrFromFile: readQrFromFileMock,
}));

import { PrintedCopyCheckDialog } from '@/components/qr/printed-copy-check-dialog';

const LINK = 'https://memento.example/q/ana-memorial';

function png(name = 'qr.png'): File {
  return new File(['x'], name, { type: 'image/png' });
}

async function openAndChoose(file: File): Promise<void> {
  await userEvent.click(screen.getByTestId('check-printed-copy'));
  await userEvent.upload(screen.getByTestId('printed-copy-input'), file);
}

describe('PrintedCopyCheckDialog', () => {
  beforeEach(() => {
    readQrFromFileMock.mockReset();
  });

  it('says it is safe to change the type when the print is this dynamic code', async () => {
    readQrFromFileMock.mockResolvedValue(LINK);
    render(<PrintedCopyCheckDialog expectedPayload={LINK} isDynamic />);

    await openAndChoose(png());

    const result = await screen.findByTestId('printed-copy-result');
    expect(result).toHaveTextContent('safe to change the type');
    expect(result).toHaveTextContent(LINK);
  });

  it('says a print holding a Canva address is static', async () => {
    readQrFromFileMock.mockResolvedValue('https://www.canva.com/design/abc');
    render(<PrintedCopyCheckDialog expectedPayload={LINK} isDynamic />);

    await openAndChoose(png());

    expect(await screen.findByTestId('printed-copy-result')).toHaveTextContent('does not hold a Memento link');
  });

  it('says so when no code can be read', async () => {
    readQrFromFileMock.mockResolvedValue(null);
    render(<PrintedCopyCheckDialog expectedPayload={LINK} isDynamic />);

    await openAndChoose(png());

    expect(await screen.findByTestId('printed-copy-result')).toHaveTextContent('No QR code could be read');
  });

  it('refuses a file that is not a PNG or JPG without reading it', async () => {
    render(<PrintedCopyCheckDialog expectedPayload={LINK} isDynamic />);

    await userEvent.click(screen.getByTestId('check-printed-copy'));
    const input = screen.getByTestId('printed-copy-input');
    // `accept` would stop this in a real file picker; fire the change directly as a drag-and-drop would.
    await userEvent.upload(input, new File(['x'], 'qr.pdf', { type: 'application/pdf' }), { applyAccept: false });

    await waitFor(() => expect(screen.getByText('Choose a PNG or JPG picture.')).toBeInTheDocument());
    expect(readQrFromFileMock).not.toHaveBeenCalled();
  });

  it('says so when the picture cannot be opened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    readQrFromFileMock.mockRejectedValue(new Error('bad image'));
    render(<PrintedCopyCheckDialog expectedPayload={LINK} isDynamic />);

    await openAndChoose(png());

    await waitFor(() => expect(screen.getByText(/could not be opened/i)).toBeInTheDocument());
  });
});
