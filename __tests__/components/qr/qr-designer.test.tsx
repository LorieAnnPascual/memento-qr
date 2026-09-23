import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QRDesigner } from '@/components/qr/qr-designer';
import { SYSTEM_QR_TEMPLATES } from '@/lib/qr/templates';

const MOCK_TEMPLATES = SYSTEM_QR_TEMPLATES.map((template, index) => ({
  id: `system-${index}`,
  userId: null,
  name: template.name,
  description: template.description,
  category: template.category,
  thumbnailUrl: null,
  styleConfig: template.styleConfig,
  isPublic: true,
  isSystem: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

describe('QRDesigner', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      if (url === '/api/templates') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: MOCK_TEMPLATES }),
        } as Response);
      }
      if (url === '/api/qr') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'qr-1', name: 'Test QR' }),
        } as Response);
      }
      return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('defaults to the URL type and builds a URL payload', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    const urlInput = screen.getByLabelText('Website URL');
    await user.type(urlInput, 'example.com');

    expect(screen.getByTestId('qr-payload-preview')).toHaveTextContent('https://example.com');
  });

  it('switches forms and payloads when a different type is selected', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('qr-type-wifi'));

    const ssidInput = screen.getByLabelText('Network name (SSID)');
    await user.type(ssidInput, 'OfficeWifi');

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'letmein123');

    expect(screen.getByTestId('qr-payload-preview')).toHaveTextContent(
      'WIFI:T:WPA;S:OfficeWifi;P:letmein123;H:false;;',
    );
  });

  it('preserves values entered for a type after switching away and back', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Website URL'), 'memento.example');
    await user.click(screen.getByTestId('qr-type-text'));
    await user.click(screen.getByTestId('qr-type-url'));

    expect(screen.getByLabelText('Website URL')).toHaveValue('memento.example');
  });

  it('applies a template from the picker to the style editor', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /choose template/i }));
    await user.click(await screen.findByTestId('qr-template-elegant-memorial'));

    expect(screen.getByLabelText('Dot color')).toHaveValue('#2c3e50');
  });

  it('applying a template preserves the previously chosen card layout', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('qr-layout-horizontal'));
    await user.click(screen.getByRole('button', { name: /choose template/i }));
    await user.click(await screen.findByTestId('qr-template-elegant-memorial'));

    expect(screen.getByTestId('qr-layout-horizontal')).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to a card layout and shows the caption field', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    expect(screen.queryByLabelText('Caption (optional)')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('qr-layout-vertical'));

    expect(screen.getByTestId('qr-layout-vertical')).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('Caption (optional)'), 'Scan to visit');
    expect(screen.getByLabelText('Caption (optional)')).toHaveValue('Scan to visit');
  });

  it('enables gradient controls for the dot color', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('qr-style-dot-gradient-toggle'));

    expect(screen.getByLabelText('Start color')).toBeInTheDocument();
    expect(screen.getByLabelText('End color')).toBeInTheDocument();
  });

  it('requires confirmation before saving, and only calls the API after confirming', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Website URL'), 'example.com');
    await user.type(screen.getByLabelText('Name'), 'My QR');
    await user.click(screen.getByRole('button', { name: 'Save QR code' }));

    expect(await screen.findByText('Save this QR code?')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/qr', expect.anything());

    const saveButtons = screen.getAllByRole('button', { name: 'Save QR code' });
    await user.click(saveButtons[saveButtons.length - 1]);

    expect(fetchMock).toHaveBeenCalledWith('/api/qr', expect.objectContaining({ method: 'POST' }));
  });

  it('does not prompt to save when the name is missing', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Website URL'), 'example.com');
    await user.click(screen.getByRole('button', { name: 'Save QR code' }));

    expect(screen.queryByText('Save this QR code?')).not.toBeInTheDocument();
  });
});

describe('QRDesigner dynamic QR settings', () => {
  const fetchMock = vi.fn((...args: [string, { body?: string }?]) =>
    args &&
    Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) }),
  );

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('hides dynamic options until the switch is turned on', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    expect(screen.queryByLabelText('Scan limit (optional)')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Make this dynamic'));

    expect(screen.getByLabelText('Scan limit (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Expires (optional)')).toBeInTheDocument();
    expect(screen.getByText('A short link will be generated the first time you save.')).toBeInTheDocument();
  });

  it('sends isDynamic and the scan limit when saving', async () => {
    render(<QRDesigner />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Website URL'), 'example.com');
    await user.type(screen.getByLabelText('Name'), 'Dyn');
    await user.click(screen.getByLabelText('Make this dynamic'));
    await user.type(screen.getByLabelText('Scan limit (optional)'), '50');
    await user.click(screen.getByRole('button', { name: 'Save QR code' }));

    const saveButtons = await screen.findAllByRole('button', { name: 'Save QR code' });
    await user.click(saveButtons[saveButtons.length - 1]);

    const call = fetchMock.mock.calls.find(([url]) => url === '/api/qr');
    const body = JSON.parse(call?.[1]?.body ?? '{}');
    expect(body.isDynamic).toBe(true);
    expect(body.scanLimit).toBe(50);
    expect(body.payload).toBe('https://example.com');
  });
});
