import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PageTemplate } from '@/lib/db/schema';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock, replace: vi.fn() }),
}));

// The real Puck editor needs a full browser; the editor shell around it is
// what these tests exercise.
vi.mock('@puckeditor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@puckeditor/core')>()),
  Puck: ({ renderHeaderActions }: { renderHeaderActions?: () => React.ReactNode }) => (
    <div data-testid="puck-stub">{renderHeaderActions?.()}</div>
  ),
}));
vi.mock('@puckeditor/core/no-external.css', () => ({}));

import { PageEditor } from '@/components/pages/page-editor';
import { PageList } from '@/components/pages/page-list';
import { PageTemplateGallery } from '@/components/pages/page-template-gallery';

const HOUR = 60 * 60 * 1000;

function makePage(overrides: Partial<PageTemplate> = {}): PageTemplate {
  return {
    id: 'page-1',
    userId: 'profile-1',
    name: 'Menu',
    description: null,
    category: 'restaurant',
    thumbnailUrl: null,
    puckData: { root: { props: {} }, content: [], zones: {} },
    isPublic: false,
    isSystem: false,
    isPublished: false,
    shortCode: null,
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'new-1' }) });
  vi.stubGlobal('fetch', fetchMock);
});

describe('PageList', () => {
  it('shows an empty state with a call to action', () => {
    render(<PageList initialItems={[]} />);
    expect(screen.getByText('No pages yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first page' })).toHaveAttribute('href', '/pages/new');
  });

  it('shows Draft, Published, Unpublished and Expired statuses', () => {
    render(
      <PageList
        initialItems={[
          makePage({ id: 'a', name: 'Draft page' }),
          makePage({ id: 'b', name: 'Live page', isPublished: true, shortCode: 'live12' }),
          makePage({ id: 'c', name: 'Off page', shortCode: 'off123' }),
          makePage({
            id: 'd',
            name: 'Old page',
            isPublished: true,
            shortCode: 'old123',
            expiresAt: new Date(Date.now() - HOUR),
          }),
        ]}
      />,
    );

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Unpublished')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('only offers a public link for pages that are live', () => {
    render(
      <PageList
        initialItems={[
          makePage({ id: 'a', name: 'Draft page' }),
          makePage({ id: 'b', name: 'Live page', isPublished: true, shortCode: 'live12' }),
        ]}
      />,
    );

    expect(screen.queryByLabelText('Open Draft page')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Open Live page')).toHaveAttribute('href', expect.stringContaining('/p/live12'));
  });

  it('asks for confirmation before deleting, then removes the row', async () => {
    const user = userEvent.setup();
    render(<PageList initialItems={[makePage({ name: 'Menu' })]} />);

    await user.click(screen.getByLabelText('Delete Menu'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Delete this page?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/pages/page-1', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByText('Menu')).not.toBeInTheDocument());
  });

  it('warns that deleting a live page takes its link offline', async () => {
    const user = userEvent.setup();
    render(<PageList initialItems={[makePage({ isPublished: true, shortCode: 'live12' })]} />);

    await user.click(screen.getByLabelText('Delete Menu'));
    expect(await screen.findByText(/takes its public link offline/)).toBeInTheDocument();
  });
});

describe('PageTemplateGallery', () => {
  const templates = [
    makePage({ id: 't1', name: 'Memorial Page', category: 'memorial', isSystem: true, userId: null, isPublic: true }),
    makePage({ id: 't2', name: 'Pet Profile', category: 'pet', isSystem: true, userId: null, isPublic: true }),
  ];

  it('lists templates and filters by category', async () => {
    const user = userEvent.setup();
    render(<PageTemplateGallery templates={templates} />);

    expect(screen.getByText('Memorial Page')).toBeInTheDocument();
    expect(screen.getByText('Pet Profile')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Category filter' }));
    await user.click(await screen.findByRole('option', { name: 'pet' }));

    expect(screen.queryByText('Memorial Page')).not.toBeInTheDocument();
    expect(screen.getByText('Pet Profile')).toBeInTheDocument();
  });

  it('shows a sized, scriptless preview of the template content', async () => {
    const user = userEvent.setup();
    const withContent = makePage({
      id: 't3',
      name: 'Card',
      isSystem: true,
      userId: null,
      isPublic: true,
      puckData: {
        root: { props: {} },
        content: [{ type: 'TextBlock', props: { id: 'x', content: 'Preview body text' } }],
        zones: {},
      },
    });
    render(<PageTemplateGallery templates={[withContent]} />);

    await user.click(screen.getByRole('button', { name: /preview/i }));

    const frame = (await screen.findByTitle('Preview of Card')) as HTMLIFrameElement;
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('Preview body text'));
    expect(frame.style.height).toBe('60vh');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts');
  });

  it('creates a copy of the chosen template and opens it', async () => {
    const user = userEvent.setup();
    render(<PageTemplateGallery templates={templates} />);

    await user.click(screen.getAllByRole('button', { name: 'Use template' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Page name')).toHaveValue('Memorial Page copy');
    await user.click(within(dialog).getByRole('button', { name: 'Create page' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/pages/new-1'));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ name: 'Memorial Page copy', fromTemplateId: 't1' });
  });

  it('starts a blank page without a template id', async () => {
    const user = userEvent.setup();
    render(<PageTemplateGallery templates={templates} />);

    await user.click(screen.getByRole('button', { name: 'Start blank' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create page' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 'Untitled page' });
  });

  it('refuses an empty name', async () => {
    const user = userEvent.setup();
    render(<PageTemplateGallery templates={templates} />);

    await user.click(screen.getByRole('button', { name: 'Start blank' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Page name'));
    await user.click(within(dialog).getByRole('button', { name: 'Create page' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PageEditor', () => {
  it('loads the editor and shows the page status', async () => {
    render(<PageEditor page={makePage({ name: 'Menu' })} />);

    expect(await screen.findByTestId('puck-stub')).toBeInTheDocument();
    expect(screen.getByLabelText('Page name')).toHaveValue('Menu');
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('confirms before saving, and stays on the page afterwards', async () => {
    const user = userEvent.setup();
    render(<PageEditor page={makePage({ name: 'Menu' })} />);

    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    expect(fetchMock).not.toHaveBeenCalled();

    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/pages/page-1', expect.objectContaining({ method: 'PUT' })),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('publishes after confirmation and reveals the shareable link', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ shortCode: 'abc123', url: 'http://localhost:3000/p/abc123', expiresAt: null }),
    });
    const user = userEvent.setup();
    render(<PageEditor page={makePage()} />);

    await user.click(screen.getByRole('button', { name: /^Publish$/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).queryByText('Shareable link')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Publish' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Publish' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/pages/page-1/publish', expect.objectContaining({ method: 'POST' })),
    );
    expect(await screen.findByDisplayValue('http://localhost:3000/p/abc123')).toBeInTheDocument();
  });

  it('shows the link and unpublish action for a live page', async () => {
    const user = userEvent.setup();
    render(<PageEditor page={makePage({ isPublished: true, shortCode: 'live12' })} />);

    await user.click(screen.getByRole('button', { name: /Published/ }));
    const panel = await screen.findByRole('dialog');

    expect(within(panel).getByDisplayValue(/\/p\/live12$/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Update expiration' })).toBeInTheDocument();
  });

  it('flags an expired page in the publish panel', async () => {
    const user = userEvent.setup();
    render(
      <PageEditor
        page={makePage({ isPublished: true, shortCode: 'old123', expiresAt: new Date(Date.now() - HOUR) })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Publish$/ }));
    expect(await screen.findByText(/This page has expired/)).toBeInTheDocument();
  });
});
