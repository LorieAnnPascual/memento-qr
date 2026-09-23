import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import type { AnalyticsSummary } from '@/lib/analytics/queries';

const getCurrentUserMock = vi.fn();
const getAnalyticsSummaryMock = vi.fn();
const getScanEventsForExportMock = vi.fn();

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/analytics/queries', () => ({
  getAnalyticsSummary: getAnalyticsSummaryMock,
  getScanEventsForExport: getScanEventsForExportMock,
}));

const AUTHED_USER = { authId: 'auth-1', email: 'test@memento.local', profile: { id: 'profile-1' } };

const SUMMARY: AnalyticsSummary = {
  totalScans: 12,
  uniqueVisitors: 8,
  dailyScans: [{ date: '2026-01-01', count: 12 }],
  deviceBreakdown: [{ type: 'mobile', count: 10 }],
  browserBreakdown: [{ browser: 'Chrome', count: 9 }],
  topCountries: [{ country: 'Philippines', count: 12 }],
  topCities: [{ city: 'Manila', country: 'Philippines', count: 12 }],
  topQrCode: { id: 'qr-1', name: 'Test QR', count: 12 },
  recentScans: [
    {
      id: 'scan-1',
      qrCodeId: 'qr-1',
      qrCodeName: 'Test QR',
      deviceType: 'mobile',
      browser: 'Chrome',
      os: 'Android',
      country: 'Philippines',
      city: 'Manila',
      referrer: null,
      scannedAt: new Date('2026-01-01T00:00:00Z'),
    },
  ],
};

describe('GET /api/analytics', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getAnalyticsSummaryMock.mockReset();
    getScanEventsForExportMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/analytics/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/analytics'));

    expect(response.status).toBe(401);
  });

  it('returns the analytics summary as JSON', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    getAnalyticsSummaryMock.mockResolvedValue(SUMMARY);

    const { GET } = await import('@/app/api/analytics/route');
    const response = await GET(new NextRequest('http://localhost:3000/api/analytics'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalScans).toBe(12);
    expect(getAnalyticsSummaryMock).toHaveBeenCalledWith({
      userId: 'profile-1',
      qrId: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it('passes qrId and date range filters through to the query', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    getAnalyticsSummaryMock.mockResolvedValue(SUMMARY);

    const { GET } = await import('@/app/api/analytics/route');
    await GET(
      new NextRequest(
        'http://localhost:3000/api/analytics?qrId=qr-1&from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z',
      ),
    );

    const call = getAnalyticsSummaryMock.mock.calls[0][0];
    expect(call.qrId).toBe('qr-1');
    expect(call.from).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(call.to).toEqual(new Date('2026-01-31T00:00:00.000Z'));
  });

  it('returns CSV of the full (uncapped) scan history when format=csv is requested', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    getScanEventsForExportMock.mockResolvedValue(SUMMARY.recentScans);

    const { GET } = await import('@/app/api/analytics/route');
    const response = await GET(new NextRequest('http://localhost:3000/api/analytics?format=csv'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv');
    const text = await response.text();
    expect(text).toContain('Scanned At,QR Code,Device,Browser,OS,Country,City,Referrer');
    expect(text).toContain('Test QR');
    expect(text).toContain('Manila');
    expect(getAnalyticsSummaryMock).not.toHaveBeenCalled();
  });

  it('escapes commas and quotes in CSV fields', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    getScanEventsForExportMock.mockResolvedValue([
      { ...SUMMARY.recentScans[0], qrCodeName: 'Cafe, "Best" Menu' },
    ]);

    const { GET } = await import('@/app/api/analytics/route');
    const response = await GET(new NextRequest('http://localhost:3000/api/analytics?format=csv'));

    expect(await response.text()).toContain('"Cafe, ""Best"" Menu"');
  });
});
