import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { QRCode } from '@/lib/db/schema';

const pushMock = vi.fn();
const setThemeMock = vi.fn();
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: setThemeMock }) }));
// The real preview draws a canvas, which jsdom cannot.
vi.mock('@/components/qr/qr-preview', () => ({ QRPreview: () => <div data-testid="qr-preview" /> }));
vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Stub,
    LineChart: Stub,
    Line: Stub,
    XAxis: Stub,
    YAxis: Stub,
    CartesianGrid: Stub,
    Tooltip: Stub,
    Legend: Stub,
  };
});

import { AppearanceCard } from '@/components/settings/appearance-card';
import { BackupCard } from '@/components/settings/backup-card';
import { BatchQRForm } from '@/components/qr/batch-qr-form';
import { ComparePicker } from '@/components/qr/compare-picker';
import { FolderManager } from '@/components/qr/folder-manager';
import { QRCodeList } from '@/components/qr/qr-code-list';
import { QRCompare, type CompareSide } from '@/components/qr/qr-compare';

let fetchMock: ReturnType<typeof vi.fn>;

function ok(body: unknown = {}, headers: Record<string, string> = {}): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body), headers: new Headers(headers) } as Response;
}
function fail(status: number, body: unknown = {}): Response {
  return { ok: false, status, json: () => Promise.resolve(body), headers: new Headers() } as Response;
}

beforeEach(() => {
  pushMock.mockReset();
  setThemeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  fetchMock = vi.fn().mockResolvedValue(ok());
  vi.stubGlobal('fetch', fetchMock);
});

function csvFile(text: string, name = 'batch.csv'): File {
  const file = new File([text], name, { type: 'text/csv' });
  // Older jsdom Files have no .text().
  if (typeof file.text !== 'function') file.text = () => Promise.resolve(text);
  return file;
}

describe('BatchQRForm', () => {
  const folders = [{ id: 'f1', name: 'Work' }];

  it('explains a file that has no usable header', async () => {
    const user = userEvent.setup();
    render(<BatchQRForm folders={folders} templates={[]} />);

    await user.upload(screen.getByLabelText('CSV file'), csvFile('foo,bar\n1,2'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/header/);
    expect(screen.queryByRole('button', { name: /Create/ })).not.toBeInTheDocument();
  });

  it('previews rows, marks problems, and only offers to create the good ones', async () => {
    const user = userEvent.setup();
    render(<BatchQRForm folders={folders} templates={[]} />);

    await user.upload(screen.getByLabelText('CSV file'), csvFile('name,url\nSite,example.com\nMail,not a url\nBlog,blog.example.org'));

    expect(await screen.findByText('2 ready')).toBeInTheDocument();
    expect(screen.getByText('1 with problems')).toBeInTheDocument();
    expect(screen.getByText(/web address/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 2 QR codes' })).toBeEnabled();
  });

  it('asks for confirmation, then sends only valid rows and shows a success message', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(ok({ created: 2 }));
    render(<BatchQRForm folders={folders} templates={[]} />);
    await user.upload(screen.getByLabelText('CSV file'), csvFile('name,url,dynamic\nA,a.com,yes\nB,,no\nC,c.com,no'));

    await user.click(await screen.findByRole('button', { name: 'Create 2 QR codes' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/1 row has problems and will be skipped/);

    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/qr/batch', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items.map((item: { name: string }) => item.name)).toEqual(['A', 'C']);
    expect(body.items[0].isDynamic).toBe(true);
    expect(body.folderId).toBeNull();
    expect(body.styleConfig).toBeTruthy();
    expect(await screen.findByText(/2 QR codes created/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View QR codes' })).toHaveAttribute('href', '/qr');
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('shows the server error and keeps the rows when creating fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(fail(400, { error: 'Row 1: nope' }));
    render(<BatchQRForm folders={folders} templates={[]} />);
    await user.upload(screen.getByLabelText('CSV file'), csvFile('name,url\nA,a.com'));

    await user.click(await screen.findByRole('button', { name: 'Create 1 QR code' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Row 1: nope'));
    expect(screen.getByRole('button', { name: 'Create 1 QR code' })).toBeInTheDocument();
  });
});

describe('FolderManager', () => {
  function setup(folders = [{ id: 'f1', name: 'Work', qrCount: 2 }]) {
    const onFoldersChange = vi.fn();
    render(<FolderManager open onOpenChange={() => {}} folders={folders} onFoldersChange={onFoldersChange} />);
    return { onFoldersChange };
  }

  it('creates a folder', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(ok({ id: 'f2', name: 'Events', qrCount: 0 }));
    const { onFoldersChange } = setup();

    await user.type(screen.getByLabelText('New folder name'), 'Events');
    await user.click(screen.getByRole('button', { name: /Add/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/folders', expect.objectContaining({ method: 'POST' })));
    expect(onFoldersChange).toHaveBeenCalledWith([
      { id: 'f2', name: 'Events', qrCount: 0 },
      { id: 'f1', name: 'Work', qrCount: 2 },
    ]);
    expect(toastMock.success).toHaveBeenCalledWith('Folder created');
  });

  it('shows the server message for a duplicate name', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(fail(409, { error: 'You already have a folder with that name' }));
    const { onFoldersChange } = setup();

    await user.type(screen.getByLabelText('New folder name'), 'Work');
    await user.click(screen.getByRole('button', { name: /Add/ }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('You already have a folder with that name'));
    expect(onFoldersChange).not.toHaveBeenCalled();
  });

  it('renames a folder', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(ok({ id: 'f1', name: 'Office' }));
    const { onFoldersChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Rename Work' }));
    const input = screen.getByLabelText('Rename Work');
    await user.clear(input);
    await user.type(input, 'Office');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/folders/f1', expect.objectContaining({ method: 'PUT' })));
    expect(onFoldersChange).toHaveBeenCalledWith([{ id: 'f1', name: 'Office', qrCount: 2 }]);
  });

  it('confirms before deleting and reassures that QR codes are kept', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(ok());
    const { onFoldersChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Delete Work' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/QR codes inside are kept/);

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/folders/f1', { method: 'DELETE' }));
    expect(onFoldersChange).toHaveBeenCalledWith([]);
    expect(toastMock.success).toHaveBeenCalledWith('Folder deleted');
  });
});

function makeQR(id: string, name: string, over: Partial<QRCode> = {}): QRCode {
  return {
    id,
    userId: 'u1',
    name,
    qrType: 'url',
    payload: 'https://example.com',
    payloadFields: null,
    isDynamic: false,
    shortCode: null,
    targetUrl: null,
    styleConfig: {},
    templateId: null,
    folderId: null,
    isPaused: false,
    expiresAt: null,
    scanLimit: null,
    scanCount: 0,
    tags: null,
    notes: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as QRCode;
}

describe('QRCodeList folders, selection and duplicate', () => {
  const items = [makeQR('q1', 'Alpha', { folderId: 'f1' }), makeQR('q2', 'Beta'), makeQR('q3', 'Gamma')];
  const folders = [{ id: 'f1', name: 'Work' }];

  // The list refetches after a change; answer that like the real API would.
  function respond(result: unknown): void {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(String(url).startsWith('/api/qr?') ? ok({ items, total: 3 }) : ok(result)),
    );
  }

  function renderList() {
    return render(<QRCodeList initialItems={items} initialTotal={3} pageSize={20} initialFolders={folders} members={[]} />);
  }

  it('shows which folder a code is in', () => {
    renderList();

    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('shows the selection bar only when something is selected', async () => {
    const user = userEvent.setup();
    renderList();
    expect(screen.queryByRole('region', { name: 'Selection actions' })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Select Alpha'));

    const bar = screen.getByRole('region', { name: 'Selection actions' });
    expect(bar).toHaveTextContent('1 selected');
    expect(bar).toHaveTextContent(/exactly 2/);
  });

  it('offers Compare only when exactly two are selected', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));

    const link = within(screen.getByRole('region', { name: 'Selection actions' })).getByRole('link', { name: /Compare/ });
    expect(link).toHaveAttribute('href', '/qr/compare?a=q1&b=q2');

    await user.click(screen.getByLabelText('Select Gamma'));
    expect(within(screen.getByRole('region', { name: 'Selection actions' })).queryByRole('link', { name: /Compare/ })).not.toBeInTheDocument();
  });

  it('selects everything on the page with the header checkbox', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByLabelText('Select all on this page'));

    expect(screen.getByRole('region', { name: 'Selection actions' })).toHaveTextContent('3 selected');
  });

  it('moves the selected codes to a folder', async () => {
    const user = userEvent.setup();
    respond({ moved: 2 });
    renderList();
    await user.click(screen.getByLabelText('Select Beta'));
    await user.click(screen.getByLabelText('Select Gamma'));

    await user.click(screen.getByRole('combobox', { name: 'Move to folder' }));
    await user.click(await screen.findByRole('option', { name: 'Work' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/qr/move', expect.objectContaining({ method: 'POST' })));
    const moveCall = fetchMock.mock.calls.find(([url]) => url === '/api/qr/move');
    expect(JSON.parse(moveCall?.[1].body)).toEqual({ ids: ['q2', 'q3'], folderId: 'f1' });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Moved 2 QR codes to Work'));
  });

  it('duplicates a code and confirms it', async () => {
    const user = userEvent.setup();
    respond({ id: 'new' });
    renderList();

    await user.click(screen.getByLabelText('Duplicate Alpha'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/qr/q1/duplicate', { method: 'POST' }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Duplicated "Alpha"'));
  });

  it('links to batch import, compare and the folder manager', async () => {
    const user = userEvent.setup();
    renderList();

    expect(screen.getByRole('link', { name: /Batch import/ })).toHaveAttribute('href', '/qr/batch');
    expect(screen.getByRole('link', { name: /^Compare$/ })).toHaveAttribute('href', '/qr/compare');
    await user.click(screen.getByRole('button', { name: /Folders/ }));
    expect(await screen.findByText('Group related QR codes together.')).toBeInTheDocument();
  });

  it('asks the server for the chosen folder', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(ok({ items: [], total: 0 }));
    renderList();

    await user.click(screen.getByRole('combobox', { name: 'Folder filter' }));
    await user.click(await screen.findByRole('option', { name: 'No folder' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('folder=none'))).toBe(true));
  });
});

describe('ComparePicker', () => {
  const options = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ];

  it('needs two different codes before comparing', async () => {
    const user = userEvent.setup();
    render(<ComparePicker options={options} />);
    expect(screen.getByRole('button', { name: /Compare/ })).toBeDisabled();

    await user.click(screen.getByRole('combobox', { name: 'QR code A' }));
    await user.click(await screen.findByRole('option', { name: 'Alpha' }));
    await user.click(screen.getByRole('combobox', { name: 'QR code B' }));
    await user.click(await screen.findByRole('option', { name: 'Alpha' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/two different/);
    expect(screen.getByRole('button', { name: /Compare/ })).toBeDisabled();
  });

  it('navigates to the comparison', async () => {
    const user = userEvent.setup();
    render(<ComparePicker options={options} initialA="a" initialB="b" />);

    await user.click(screen.getByRole('button', { name: /Compare/ }));

    expect(pushMock).toHaveBeenCalledWith('/qr/compare?a=a&b=b');
  });
});

describe('QRCompare', () => {
  const side = (over: Partial<CompareSide>): CompareSide => ({
    id: 'x',
    name: 'X',
    qrType: 'url',
    payload: 'https://example.com',
    styleConfig: { dotStyle: 'rounded', dotColor: '#123456' },
    isDynamic: true,
    totalScans: 0,
    uniqueVisitors: 0,
    mobileShare: null,
    topCountry: null,
    ...over,
  });
  const series = [{ date: '2026-03-10', a: 1, b: 2 }];

  it('names the leader and by how much', () => {
    render(
      <QRCompare
        a={side({ id: 'a', name: 'Red design', totalScans: 10, uniqueVisitors: 8, mobileShare: 75, topCountry: 'Philippines' })}
        b={side({ id: 'b', name: 'Blue design', totalScans: 20 })}
        series={series}
        days={30}
      />,
    );

    expect(screen.getByText(/ahead with 20 scans versus 10/)).toHaveTextContent('Blue design');
    expect(screen.getByText(/100% more/)).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Philippines')).toBeInTheDocument();
    expect(screen.getAllByTestId('qr-preview')).toHaveLength(2);
  });

  it('explains that static codes cannot be measured', () => {
    render(<QRCompare a={side({ isDynamic: false })} b={side({ isDynamic: false })} series={series} days={30} />);

    expect(screen.getByText(/Neither code is dynamic/)).toBeInTheDocument();
  });

  it('says so when there are no scans yet', () => {
    render(<QRCompare a={side({})} b={side({})} series={series} days={30} />);

    expect(screen.getByText(/No scans yet/)).toBeInTheDocument();
  });

  it('switches the time range', async () => {
    const user = userEvent.setup();
    render(<QRCompare a={side({ id: 'a' })} b={side({ id: 'b' })} series={series} days={30} />);

    await user.click(screen.getByRole('button', { name: '7 days' }));

    expect(pushMock).toHaveBeenCalledWith('/qr/compare?a=a&b=b&days=7');
  });
});

describe('BackupCard', () => {
  it('downloads the file the server sends and confirms', async () => {
    const user = userEvent.setup();
    const clicked = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked(this.download);
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['{}'])),
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="memento-qr-backup-2026-03-10.json"' }),
    } as Response);
    render(<BackupCard isAdmin={false} />);

    await user.click(screen.getByRole('button', { name: /Download backup/ }));

    await waitFor(() => expect(clicked).toHaveBeenCalledWith('memento-qr-backup-2026-03-10.json'));
    expect(fetchMock).toHaveBeenCalledWith('/api/export');
    expect(toastMock.success).toHaveBeenCalledWith('Backup downloaded');
  });

  it('only offers the team option to admins, and requests it', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BackupCard isAdmin={false} />);
    expect(screen.queryByLabelText(/whole team/)).not.toBeInTheDocument();
    unmount();

    fetchMock.mockResolvedValue(fail(500));
    render(<BackupCard isAdmin />);
    await user.click(screen.getByLabelText(/whole team/));
    await user.click(screen.getByRole('button', { name: /Download backup/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/export?scope=team'));
  });

  it('reports a failed export', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(fail(403, { error: 'Only admins can export the whole team' }));
    render(<BackupCard isAdmin={false} />);

    await user.click(screen.getByRole('button', { name: /Download backup/ }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Only admins can export the whole team'));
  });
});

describe('AppearanceCard', () => {
  it('switches the theme', async () => {
    const user = userEvent.setup();
    render(<AppearanceCard />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(setThemeMock).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  });
});
