import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, count, desc, eq, gt, isNull, or, sum } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates, qrCodes, qrTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import type { QRStyleConfig } from '@/lib/qr/generator';
import { getQRTypeLabel, type QRType } from '@/types/qr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QRPreview } from '@/components/qr/qr-preview';

const RECENT_LIMIT = 5;

export default async function DashboardHomePage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const where = and(eq(qrCodes.userId, user.profile.id), isNull(qrCodes.deletedAt));
  const templatesWhere = and(eq(qrTemplates.userId, user.profile.id), eq(qrTemplates.isSystem, false));

  const livePagesWhere = and(
    eq(pageTemplates.userId, user.profile.id),
    eq(pageTemplates.isPublished, true),
    or(isNull(pageTemplates.expiresAt), gt(pageTemplates.expiresAt, new Date())),
  );

  const [[{ total }], [{ totalScans }], recent, recentTemplates, [{ livePages }]] = await Promise.all([
    db.select({ total: count() }).from(qrCodes).where(where),
    db.select({ totalScans: sum(qrCodes.scanCount) }).from(qrCodes).where(where),
    db.select().from(qrCodes).where(where).orderBy(desc(qrCodes.createdAt)).limit(RECENT_LIMIT),
    db
      .select()
      .from(qrTemplates)
      .where(templatesWhere)
      .orderBy(desc(qrTemplates.createdAt))
      .limit(RECENT_LIMIT),
    db.select({ livePages: count() }).from(pageTemplates).where(livePagesWhere),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your QR codes and pages.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>QR codes</CardTitle>
            <CardDescription>Total saved QR codes</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Total scans</CardTitle>
              <CardDescription>All-time dynamic QR scans</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/analytics">View</Link>
            </Button>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{totalScans ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Published pages</CardTitle>
              <CardDescription>Live landing pages</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/pages">View</Link>
            </Button>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{livePages}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Recent QR codes</CardTitle>
            <CardDescription>Your most recently saved codes.</CardDescription>
          </div>
          {total > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href="/qr">View all</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
              <p>No QR codes yet.</p>
              <Button asChild className="mt-3" size="sm">
                <Link href="/qr/new">Create your first QR code</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map((item) => (
                <li key={item.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <QRPreview
                    config={{
                      data: item.payload,
                      ...(item.styleConfig as QRStyleConfig),
                      cardLayout: 'none',
                    }}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <Link href={`/qr/${item.id}`} className="font-medium hover:underline">
                      {item.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {getQRTypeLabel(item.qrType as QRType)} ·{' '}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {recentTemplates.length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Recent templates</CardTitle>
              <CardDescription>Custom design templates you&apos;ve saved.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/templates">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recentTemplates.map((template) => (
                <li key={template.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <QRPreview
                    config={{
                      data: 'https://memento-qr.vercel.app',
                      ...(template.styleConfig as QRStyleConfig),
                      cardLayout: 'none',
                    }}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <Link href="/templates" className="font-medium hover:underline">
                      {template.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {template.category} · {new Date(template.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
