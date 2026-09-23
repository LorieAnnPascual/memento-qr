import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AnalyticsSummary } from '@/lib/analytics/queries';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';

const EMPTY: AnalyticsSummary = {
  totalScans: 5,
  uniqueVisitors: 3,
  dailyScans: [],
  deviceBreakdown: [],
  browserBreakdown: [],
  topCountries: [{ country: 'Philippines', count: 5 }],
  topCities: [{ city: 'Manila', country: 'Philippines', count: 5 }],
  topQrCode: { id: 'qr-1', name: 'Menu QR', count: 5 },
  recentScans: [],
};

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve(EMPTY) }));
  });

  it('renders stats, top QR code and both location tables', () => {
    render(<AnalyticsDashboard initialSummary={EMPTY} />);

    expect(screen.getByText('5', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText('Menu QR')).toBeInTheDocument();
    expect(screen.getByText('Philippines')).toBeInTheDocument();
    expect(screen.getByText('Manila, Philippines')).toBeInTheDocument();
  });

  it('exports CSV for the default last-30-days range', () => {
    render(<AnalyticsDashboard initialSummary={EMPTY} />);

    const href = screen.getByRole('link', { name: /export csv/i }).getAttribute('href') ?? '';
    expect(href).toContain('format=csv');
    expect(href).toContain('from=');
  });

  it('shows date inputs for a custom range and includes them in the request', async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard initialSummary={EMPTY} />);

    await user.click(screen.getByRole('combobox', { name: 'Date range' }));
    await user.click(await screen.findByRole('option', { name: 'Custom range' }));

    await user.type(screen.getByLabelText('From date'), '2026-01-01');
    await user.type(screen.getByLabelText('To date'), '2026-01-31');

    const href = screen.getByRole('link', { name: /export csv/i }).getAttribute('href') ?? '';
    expect(href).toContain('from=');
    expect(href).toContain('to=');
  });

  it('shows a QR filter only for the global view', () => {
    const { rerender } = render(
      <AnalyticsDashboard initialSummary={EMPTY} qrOptions={[{ id: 'qr-1', name: 'Menu QR' }]} />,
    );
    expect(screen.getByRole('combobox', { name: 'QR code filter' })).toBeInTheDocument();

    rerender(<AnalyticsDashboard initialSummary={EMPTY} qrId="qr-1" />);
    expect(screen.queryByRole('combobox', { name: 'QR code filter' })).not.toBeInTheDocument();
  });
});
