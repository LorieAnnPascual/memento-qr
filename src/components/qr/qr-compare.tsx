'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { QRStyleConfig } from '@/lib/qr/generator';
import {
  COMPARE_DAY_OPTIONS,
  compareScans,
  type ComparisonPoint,
  type CompareDays,
} from '@/lib/analytics/compare';
import { getQRTypeLabel, type QRType } from '@/types/qr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QRPreview } from './qr-preview';

export interface CompareSide {
  id: string;
  name: string;
  qrType: string;
  payload: string;
  styleConfig: unknown;
  isDynamic: boolean;
  totalScans: number;
  uniqueVisitors: number;
  mobileShare: number | null;
  topCountry: string | null;
}

interface QRCompareProps {
  a: CompareSide;
  b: CompareSide;
  series: ComparisonPoint[];
  days: CompareDays;
}

const COLOR_A = '#2563eb';
const COLOR_B = '#ea580c';

function styleSummary(style: unknown): string {
  const s = style as Partial<QRStyleConfig> | null;
  if (!s) return '—';
  return [s.dotStyle, s.dotColor].filter(Boolean).join(' · ') || '—';
}

function Verdict({ a, b }: { a: CompareSide; b: CompareSide }) {
  if (!a.isDynamic && !b.isDynamic) {
    return (
      <p className="text-sm text-muted-foreground">
        Neither code is dynamic, so scans can&apos;t be counted. Turn on dynamic mode to measure which design
        gets scanned more.
      </p>
    );
  }

  const verdict = compareScans(a.totalScans, b.totalScans);
  if (verdict.kind === 'no-data') {
    return <p className="text-sm text-muted-foreground">No scans yet in this period. Check back once both have been scanned.</p>;
  }
  if (verdict.kind === 'tie') {
    return <p className="text-sm">It is a tie: {verdict.scans} scans each.</p>;
  }

  const leader = verdict.leader === 'a' ? a : b;
  return (
    <p className="text-sm">
      <span className="font-medium">{leader.name}</span> is ahead with {verdict.leaderScans} scans versus{' '}
      {verdict.otherScans}
      {verdict.percentMore !== null ? ` (${verdict.percentMore}% more)` : ''}.
    </p>
  );
}

function SideCard({ side, label, color }: { side: CompareSide; label: string; color: string }) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <Badge variant="outline">{side.isDynamic ? 'Dynamic' : 'Static'}</Badge>
      </div>
      <div className="flex justify-center rounded-md bg-muted/30 p-4">
        <QRPreview
          config={{ data: side.payload, ...(side.styleConfig as QRStyleConfig), cardLayout: 'none' }}
          size={200}
        />
      </div>
      <div>
        <p className="font-medium">{side.name}</p>
        <p className="text-sm text-muted-foreground">{getQRTypeLabel(side.qrType as QRType)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Style</dt>
        <dd className="text-right">{styleSummary(side.styleConfig)}</dd>
        <dt className="text-muted-foreground">Scans</dt>
        <dd className="text-right">{side.isDynamic ? side.totalScans : '—'}</dd>
        <dt className="text-muted-foreground">Unique visitors</dt>
        <dd className="text-right">{side.isDynamic ? side.uniqueVisitors : '—'}</dd>
        <dt className="text-muted-foreground">On mobile</dt>
        <dd className="text-right">{side.mobileShare === null ? '—' : `${side.mobileShare}%`}</dd>
        <dt className="text-muted-foreground">Top country</dt>
        <dd className="text-right">{side.topCountry ?? '—'}</dd>
      </dl>
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href={`/qr/${side.id}`}>Open in editor</Link>
      </Button>
    </div>
  );
}

export function QRCompare({ a, b, series, days }: QRCompareProps) {
  const router = useRouter();
  const showChart = a.isDynamic || b.isDynamic;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <SideCard side={a} label="A" color={COLOR_A} />
        <SideCard side={b} label="B" color={COLOR_B} />
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Scans over time</p>
            <Verdict a={a} b={b} />
          </div>
          <div className="flex gap-1" role="group" aria-label="Time range">
            {COMPARE_DAY_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={option === days ? 'default' : 'outline'}
                onClick={() => router.push(`/qr/compare?a=${a.id}&b=${b.id}&days=${option}`)}
              >
                {option} days
              </Button>
            ))}
          </div>
        </div>

        {showChart && (
          <div className="h-64" aria-label="Scans per day for each code">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="a" name={`A: ${a.name}`} stroke={COLOR_A} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="b" name={`B: ${b.name}`} stroke={COLOR_B} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
