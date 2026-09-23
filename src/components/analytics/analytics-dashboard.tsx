'use client';

import { useEffect, useRef, useState } from 'react';

import { toast } from 'sonner';
import { Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { AnalyticsSummary } from '@/lib/analytics/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface RangeState {
  range: string;
  customFrom: string;
  customTo: string;
}

/** Adds from/to query params for the selected range. Custom `to` is inclusive of the whole chosen day. */
function applyRange(params: URLSearchParams, { range, customFrom, customTo }: RangeState): void {
  if (range === 'custom') {
    if (customFrom) params.set('from', new Date(`${customFrom}T00:00:00`).toISOString());
    if (customTo) params.set('to', new Date(`${customTo}T23:59:59.999`).toISOString());
    return;
  }
  if (range === 'all') return;
  const from = new Date();
  from.setDate(from.getDate() - Number.parseInt(range, 10));
  params.set('from', from.toISOString());
}

export interface QrFilterOption {
  id: string;
  name: string;
}

interface AnalyticsDashboardProps {
  qrId?: string;
  initialSummary: AnalyticsSummary;
  showTopQrCode?: boolean;
  /** When provided (global view), renders a per-QR filter dropdown. */
  qrOptions?: QrFilterOption[];
}

export function AnalyticsDashboard({
  qrId,
  initialSummary,
  showTopQrCode = true,
  qrOptions,
}: AnalyticsDashboardProps) {
  const [range, setRange] = useState('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedQr, setSelectedQr] = useState('all');
  const [summary, setSummary] = useState(initialSummary);
  const [isLoading, setIsLoading] = useState(false);
  const hasFetchedOnce = useRef(false);

  const effectiveQrId = qrId ?? (selectedQr === 'all' ? undefined : selectedQr);

  useEffect(() => {
    if (!hasFetchedOnce.current) {
      hasFetchedOnce.current = true;
      return;
    }

    const controller = new AbortController();
    Promise.resolve().then(() => setIsLoading(true));

    const params = new URLSearchParams();
    if (effectiveQrId) params.set('qrId', effectiveQrId);
    applyRange(params, { range, customFrom, customTo });

    fetch(`/api/analytics?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<AnalyticsSummary>)
      .then((data) => setSummary(data))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast.error('Failed to load analytics.');
        console.error('Analytics fetch error:', error);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [range, customFrom, customTo, effectiveQrId]);

  const csvParams = new URLSearchParams({ format: 'csv' });
  if (effectiveQrId) csvParams.set('qrId', effectiveQrId);
  applyRange(csvParams, { range, customFrom, customTo });
  const csvHref = `/api/analytics?${csvParams.toString()}`;

  const deviceData = summary.deviceBreakdown.map((d) => ({ name: d.type, value: d.count }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-44" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {range === 'custom' && (
            <>
              <Input
                type="date"
                aria-label="From date"
                className="w-40"
                value={customFrom}
                max={customTo || undefined}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                className="w-40"
                value={customTo}
                min={customFrom || undefined}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </>
          )}
          {qrOptions && qrOptions.length > 0 && (
            <Select value={selectedQr} onValueChange={setSelectedQr}>
              <SelectTrigger className="w-56" aria-label="QR code filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All QR codes</SelectItem>
                {qrOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={csvHref} download="scan-events.csv">
            <Download className="size-4" />
            Export CSV
          </a>
        </Button>
      </div>

      <div className={`grid gap-4 sm:grid-cols-2 ${showTopQrCode ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Card>
          <CardHeader>
            <CardTitle>Total scans</CardTitle>
            <CardDescription>In the selected period</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{summary.totalScans}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unique visitors</CardTitle>
            <CardDescription>By hashed IP</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{summary.uniqueVisitors}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Countries reached</CardTitle>
            <CardDescription>Distinct scan locations</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{summary.topCountries.length}</CardContent>
        </Card>
        {showTopQrCode && (
          <Card>
            <CardHeader>
              <CardTitle>Top QR code</CardTitle>
              <CardDescription>Most scanned</CardDescription>
            </CardHeader>
            <CardContent className="truncate text-lg font-semibold">
              {summary.topQrCode ? summary.topQrCode.name : '—'}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scans over time</CardTitle>
            <CardDescription>Daily scan count</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {summary.dailyScans.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.dailyScans}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>Scans by device type</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {deviceData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deviceData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {deviceData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Browsers</CardTitle>
            <CardDescription>Scans by browser</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {summary.browserBreakdown.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.browserBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="browser" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top locations</CardTitle>
            <CardDescription>By country and city</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topCountries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No scans yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Scans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topCountries.map((row) => (
                    <TableRow key={row.country}>
                      <TableCell>{row.country}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {summary.topCities.length > 0 && (
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>City</TableHead>
                    <TableHead className="text-right">Scans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topCities.map((row) => (
                    <TableRow key={`${row.city}-${row.country}`}>
                      <TableCell>
                        {row.city}
                        {row.country !== 'Unknown' ? `, ${row.country}` : ''}
                      </TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent scans</CardTitle>
          <CardDescription>Latest {summary.recentScans.length} scan events</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.recentScans.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No scans yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scanned</TableHead>
                    {!effectiveQrId && <TableHead>QR code</TableHead>}
                    <TableHead>Device</TableHead>
                    <TableHead>Browser / OS</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recentScans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(scan.scannedAt).toLocaleString()}
                      </TableCell>
                      {!effectiveQrId && <TableCell>{scan.qrCodeName}</TableCell>}
                      <TableCell className="capitalize">{scan.deviceType ?? 'Unknown'}</TableCell>
                      <TableCell>
                        {scan.browser ?? 'Unknown'} / {scan.os ?? 'Unknown'}
                      </TableCell>
                      <TableCell>
                        {scan.city && scan.city !== 'Unknown' ? `${scan.city}, ` : ''}
                        {scan.country ?? 'Unknown'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && <p className="text-center text-sm text-muted-foreground">Refreshing…</p>}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data for this period.
    </div>
  );
}
