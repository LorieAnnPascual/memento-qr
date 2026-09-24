import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const scanTestMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: toastMock }));
// The real scan test draws a canvas, which jsdom cannot.
vi.mock('@/lib/qr/scan-test', () => ({ scanTest: scanTestMock }));

import type { QRCode } from '@/lib/db/schema';
import { QrCheckDialog } from '@/components/qr/qr-check-dialog';
import { WorkflowDialog, type WorkflowFields } from '@/components/workflow/workflow-dialog';

const MEMBERS = [
  { id: 'm1', name: 'Maria Santos' },
  { id: 'm2', name: 'Yayen' },
];

const EMPTY: WorkflowFields = { assignedTo: null, nextAction: null, notes: null, checklist: null };

let fetchMock: ReturnType<typeof vi.fn>;

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

beforeEach(() => {
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  fetchMock = vi.fn().mockResolvedValue(ok(EMPTY));
  vi.stubGlobal('fetch', fetchMock);
});

function renderDialog(value: WorkflowFields = EMPTY, onSaved = vi.fn()) {
  render(
    <WorkflowDialog
      kind="qr"
      itemId="qr-1"
      itemName="Menu QR"
      value={value}
      members={MEMBERS}
      open
      onOpenChange={vi.fn()}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe('WorkflowDialog', () => {
  it('shows the item, and an optional empty checklist', () => {
    renderDialog();

    expect(screen.getByText('Menu QR')).toBeInTheDocument();
    expect(screen.getByText(/Optional\. Add your own steps/)).toBeInTheDocument();
  });

  it('loads the saved next action, note and checklist progress', () => {
    renderDialog({
      assignedTo: 'm1',
      nextAction: 'Send to printer',
      notes: 'Blue one',
      checklist: [
        { id: 'a', label: 'Verify the QR destination', done: true },
        { id: 'b', label: 'Prepare the export', done: false },
      ],
    });

    expect(screen.getByLabelText('Next action')).toHaveValue('Send to printer');
    expect(screen.getByLabelText('Internal note')).toHaveValue('Blue one');
    expect(screen.getByText('(1 of 2 done)')).toBeInTheDocument();
    expect(screen.getByLabelText('Done: Verify the QR destination')).toBeChecked();
  });

  it('adds the usual steps once, without duplicating them', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Add the usual steps' }));
    await user.click(screen.getByRole('button', { name: 'Add the usual steps' }));

    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByLabelText('Step: Verify the QR destination')).toBeInTheDocument();
  });

  it('adds a custom step with the Add button and with Enter, and removes one', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('New checklist step'), 'Call the printer');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('New checklist step'), 'Email the client{Enter}');

    expect(screen.getByLabelText('Step: Call the printer')).toBeInTheDocument();
    expect(screen.getByLabelText('Step: Email the client')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove step: Call the printer' }));
    expect(screen.queryByLabelText('Step: Call the printer')).not.toBeInTheDocument();
  });

  it('does not add a blank step', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('asks for confirmation before saving, and saves nothing if cancelled', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Next action'), 'Proofread');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText('Save these handoff details?')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves the handoff after confirming, stays open, and confirms with a message', async () => {
    const user = userEvent.setup();
    const saved: WorkflowFields = { assignedTo: 'm2', nextAction: 'Proofread', notes: null, checklist: [] };
    fetchMock.mockResolvedValue(ok(saved));
    const onSaved = renderDialog();

    await user.click(screen.getByRole('combobox', { name: 'Assigned to' }));
    await user.click(await screen.findByRole('option', { name: 'Yayen' }));
    await user.type(screen.getByLabelText('Next action'), 'Proofread');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText(/assigned to Yayen/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/workflow/qr/qr-1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toMatchObject({ assignedTo: 'm2', nextAction: 'Proofread', notes: null });
    expect(toastMock.success).toHaveBeenCalledWith('Handoff details saved');
    // The dialog stays open so nobody is thrown out of what they were doing.
    expect(screen.getByText('Handoff & checklist')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Saved at/);
  });

  it('sends null when nobody is assigned', async () => {
    const user = userEvent.setup();
    renderDialog({ ...EMPTY, assignedTo: 'm1' });

    await user.click(screen.getByRole('combobox', { name: 'Assigned to' }));
    await user.click(await screen.findByRole('option', { name: 'Nobody' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).assignedTo).toBeNull();
  });

  it('shows an error and keeps the details when saving fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const onSaved = renderDialog();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await user.type(screen.getByLabelText('Next action'), 'Proofread');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Next action')).toHaveValue('Proofread');
    spy.mockRestore();
  });
});

describe('QrCheckDialog', () => {
  const QR = {
    id: 'qr-1',
    name: 'Menu QR',
    payload: 'https://memento-qr.vercel.app/q/abc234',
    isDynamic: true,
    styleConfig: {},
  } as unknown as QRCode;

  const check = (health: string, label: string, destination: object) => ({
    status: { health, label, detail: label + ' detail', destination: 'https://example.com/menu' },
    destination,
    checkedAt: '2026-06-01T12:00:00Z',
  });

  const HISTORY = {
    isDynamic: true,
    current: 'https://example.com/menu',
    entries: [
      {
        id: 'h2',
        destination: 'https://example.com/menu',
        previousDestination: 'https://example.com/old',
        isRestore: false,
        createdAt: '2026-06-02T10:00:00Z',
        changedBy: 'Maria',
      },
      {
        id: 'h1',
        destination: 'https://example.com/old',
        previousDestination: null,
        isRestore: false,
        createdAt: '2026-06-01T10:00:00Z',
        changedBy: 'Yayen',
      },
    ],
  };

  /** Answers each endpoint the dialog calls. */
  function respond(checkBody: unknown, historyBody: unknown = HISTORY): void {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith('/check')) return Promise.resolve(ok(checkBody));
      if (String(url).endsWith('/history')) return Promise.resolve(ok(historyBody));
      return Promise.resolve(ok({}));
    });
  }

  const SCAN_OK = { found: true, text: QR.payload, version: 3 };

  beforeEach(() => {
    scanTestMock.mockReset();
    scanTestMock.mockResolvedValue({ full: SCAN_OK, small: SCAN_OK });
  });

  it('stays closed while no code is selected', () => {
    render(<QrCheckDialog qr={null} onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Is this QR working?')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says Looks good for a healthy, readable code, and that no scan was counted', async () => {
    respond(check('ok', 'Working', { result: 'reachable', message: 'The destination answered (HTTP 200).' }));
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    expect(await screen.findByText('Looks good')).toBeInTheDocument();
    expect(screen.getByText('The destination answered (HTTP 200).')).toBeInTheDocument();
    expect(screen.getByText(/does not count as a scan/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open destination/ })).toHaveAttribute('href', 'https://example.com/menu');
    expect(fetchMock).toHaveBeenCalledWith('/api/qr/qr-1/check');
  });

  it('says Not working with a suggested fix for a paused code', async () => {
    respond(check('problem', 'Paused', { result: 'unchecked', message: 'Not checked.' }));
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    expect(await screen.findByText('Not working')).toBeInTheDocument();
    expect(screen.getByText(/Resume the code in the editor/)).toBeInTheDocument();
  });

  it('says Not working when the destination does not answer', async () => {
    respond(check('ok', 'Working', { result: 'unreachable', httpStatus: 404, message: 'The destination returned HTTP 404.' }));
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    expect(await screen.findByText('Not working')).toBeInTheDocument();
    expect(screen.getAllByText('The destination returned HTTP 404.').length).toBeGreaterThan(0);
  });

  it('says Not working when the test reader cannot read the code', async () => {
    scanTestMock.mockResolvedValue({ full: { found: false, text: null, version: null }, small: { found: false, text: null, version: null } });
    respond(check('ok', 'Working', { result: 'reachable', message: 'ok' }));
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    expect(await screen.findByText('Not working')).toBeInTheDocument();
    expect(screen.getByText(/could not read this code/)).toBeInTheDocument();
  });

  it('says Needs attention for a design warning (low contrast) on a working code', async () => {
    respond(check('ok', 'Working', { result: 'reachable', message: 'ok' }));
    const lowContrast = { ...QR, styleConfig: { dotColor: '#777777', backgroundColor: '#FFFFFF' } } as unknown as QRCode;
    render(<QrCheckDialog qr={lowContrast} onOpenChange={vi.fn()} />);

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText(/Contrast between the dots and background/)).toBeInTheDocument();
  });

  it('still gives a verdict when the browser cannot run the scan test', async () => {
    scanTestMock.mockRejectedValue(new Error('no canvas'));
    respond(check('ok', 'Working', { result: 'reachable', message: 'ok' }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    expect(await screen.findByText('Looks good')).toBeInTheDocument();
    expect(screen.getByText(/scan test could not run/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('does not offer to open an address it could not check', async () => {
    respond(check('ok', 'Working', { result: 'unchecked', message: 'Not a public web link.' }));
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    await screen.findByText('Looks good');
    expect(screen.queryByRole('link', { name: /Open destination/ })).not.toBeInTheDocument();
  });

  it('says so when the check itself fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    expect(await screen.findByText(/could not run/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('lists who changed the destination and when, marking the current one', async () => {
    respond(check('ok', 'Working', { result: 'reachable', message: 'ok' }));
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    expect(await screen.findByText('Destination history')).toBeInTheDocument();
    expect(await screen.findByText(/Changed by Maria/)).toBeInTheDocument();
    expect(screen.getByText(/Set by Yayen/)).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    // Only the older destination can be restored.
    expect(screen.getAllByRole('button', { name: /Restore this destination/ })).toHaveLength(1);
  });

  it('explains an empty history', async () => {
    respond(check('ok', 'Working', { result: 'reachable', message: 'ok' }), { isDynamic: true, current: null, entries: [] });
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} />);

    expect(await screen.findByText(/No changes recorded yet/)).toBeInTheDocument();
  });

  it('does not show history for a static code', async () => {
    respond(check('ok', 'Static code', { result: 'unchecked', message: 'x' }));
    render(<QrCheckDialog qr={{ ...QR, isDynamic: false } as QRCode} onOpenChange={vi.fn()} />);

    await screen.findByText('Looks good');
    expect(screen.queryByText('Destination history')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/qr/qr-1/history');
  });

  it('asks before restoring, then restores, confirms, and refreshes the list', async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    respond(check('ok', 'Working', { result: 'reachable', message: 'ok' }));
    render(<QrCheckDialog qr={QR} onOpenChange={vi.fn()} onRestored={onRestored} />);

    await user.click(await screen.findByRole('button', { name: /Restore this destination/ }));
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText(/https:\/\/example.com\/old/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/qr/qr-1/restore', expect.anything());

    await user.click(within(confirm).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/qr/qr-1/restore');
    expect(JSON.parse(call![1].body)).toEqual({ historyId: 'h1' });
    expect(toastMock.success).toHaveBeenCalledWith('Earlier destination restored');
  });
});
