'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { SlugKind } from '@/lib/slugs/slug';

import { SlugField, type SlugStatus } from './slug-field';

interface ForwardLinksProps {
  kind: SlugKind;
  /** The QR code or page the old links are forwarded to. */
  itemId: string;
  /** False until the item has a link of its own to forward to (a dynamic, saved code / a published page). */
  hasLink: boolean;
  /** Everything before the name, e.g. "https://memento-qr.vercel.app/q/". */
  prefix: string;
}

const NOUN: Record<SlugKind, string> = { qr: 'QR code', page: 'page' };
const API: Record<SlugKind, string> = { qr: 'qr', page: 'pages' };

/**
 * "Forward an old link here": sends a link that is no longer used (for example one left by a
 * deleted QR code) to this QR code or page with a permanent redirect (301), so old printed
 * codes and shared links still arrive somewhere useful.
 */
export function ForwardLinks({ kind, itemId, hasLink, prefix }: ForwardLinksProps) {
  const [forwards, setForwards] = useState<string[]>([]);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<SlugStatus>('idle');
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const endpoint = `/api/${API[kind]}/${itemId}/forwards`;
  const shown = prefix.replace(/^https?:\/\//, '');

  useEffect(() => {
    if (!hasLink) return;

    let cancelled = false;
    fetch(endpoint)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load (${response.status})`);
        return response.json() as Promise<{ forwards: { code: string }[] }>;
      })
      .then((body) => {
        if (!cancelled) setForwards(body.forwards.map((forward) => forward.code));
      })
      .catch((error: unknown) => console.error('Forward list error:', error));

    return () => {
      cancelled = true;
    };
  }, [hasLink, endpoint]);

  async function handleAdd(): Promise<void> {
    setIsBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: value, ...(status === 'reclaim' && { reclaimDeletedLink: true }) }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; code?: string; forwards?: { code: string }[] } | null;
      if (!response.ok) throw new Error(body?.error ?? 'Could not forward that link.');

      setForwards((body?.forwards ?? []).map((forward) => forward.code));
      toast.success(`${shown}${body?.code ?? value} now forwards here`);
      setValue('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not forward that link.');
      console.error('Forward add error:', error);
    } finally {
      setIsBusy(false);
      setConfirmAdd(false);
    }
  }

  async function handleRemove(): Promise<void> {
    if (!pendingRemove) return;
    setIsBusy(true);
    try {
      const response = await fetch(`${endpoint}?code=${encodeURIComponent(pendingRemove)}`, { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as { error?: string; forwards?: { code: string }[] } | null;
      if (!response.ok) throw new Error(body?.error ?? 'Could not stop forwarding that link.');

      setForwards((body?.forwards ?? []).map((forward) => forward.code));
      toast.success(`${shown}${pendingRemove} no longer forwards here`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not stop forwarding that link.');
      console.error('Forward remove error:', error);
    } finally {
      setIsBusy(false);
      setPendingRemove(null);
    }
  }

  const canAdd = (status === 'ok' || status === 'reclaim') && !isBusy;

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid={`forward-links-${kind}`}>
      <div>
        <h3 className="text-sm font-medium">Old links that forward here</h3>
        <p className="text-xs text-muted-foreground">
          Send an old link (for example one from a deleted {NOUN[kind]}) to this {NOUN[kind]}. Visitors are redirected
          permanently (301).
        </p>
      </div>

      {!hasLink ? (
        <p className="text-sm text-muted-foreground">
          {kind === 'qr'
            ? 'Make this code dynamic and save it first. Then you can forward old links to it.'
            : 'Publish this page first. Then you can forward old links to it.'}
        </p>
      ) : (
        <>
          {forwards.length > 0 && (
            <ul className="space-y-1" aria-label="Forwarded links">
              {forwards.map((code) => (
                <li key={code} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm">
                  <span className="min-w-0 truncate font-mono text-xs">
                    {shown}
                    {code}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Stop forwarding ${code}`}
                    disabled={isBusy}
                    onClick={() => setPendingRemove(code)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <SlugField
            kind={kind}
            id={`${kind}-forward-slug`}
            label="Old link to forward"
            value={value}
            onChange={setValue}
            currentSlug={null}
            prefix={prefix}
            placeholder="e.g. samsam"
            hint="The old link name. It must not be in use, unless it belonged to a deleted QR code."
            disabled={isBusy}
            onStatusChange={setStatus}
          />
          <Button type="button" size="sm" variant="outline" disabled={!canAdd} onClick={() => setConfirmAdd(true)}>
            Forward this link here
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirmAdd}
        onOpenChange={setConfirmAdd}
        title="Forward this old link?"
        description={`${shown}${value} will redirect to this ${NOUN[kind]} with a permanent (301) redirect. Browsers may remember it for up to a day.${
          status === 'reclaim' ? ' That name belonged to a deleted QR code, so anyone who scans its old printed code will now reach this one.' : ''
        }`}
        confirmLabel="Forward link"
        pendingLabel="Forwarding…"
        isPending={isBusy}
        onConfirm={() => void handleAdd()}
      />
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title="Stop forwarding this link?"
        description={`${shown}${pendingRemove ?? ''} will stop working. The name becomes free for anyone to use.`}
        confirmLabel="Stop forwarding"
        pendingLabel="Removing…"
        variant="destructive"
        isPending={isBusy}
        onConfirm={() => void handleRemove()}
      />
    </div>
  );
}
