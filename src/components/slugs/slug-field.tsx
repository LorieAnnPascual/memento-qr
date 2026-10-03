'use client';

import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cleanSlugWhileTyping, normalizeSlug, slugProblem, SLUG_MAX_LENGTH, type SlugKind } from '@/lib/slugs/slug';

/** `reclaim`: the name belonged to a deleted QR code; it can be reused once the person confirms. */
export type SlugStatus = 'idle' | 'checking' | 'ok' | 'reclaim' | 'problem';

interface SlugFieldProps {
  kind: SlugKind;
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The name this item has right now (saved), if any. Keeping it is always fine; changing it keeps the old one working. */
  currentSlug: string | null;
  /** The item being edited, so it may keep or go back to its own names. */
  excludeId?: string;
  /** Everything before the name, e.g. "https://memento-qr.vercel.app/q/". */
  prefix: string;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  /** Shown when the name is being changed, after "The old link (...) will keep working." */
  renameNote?: string;
  onStatusChange?: (status: SlugStatus) => void;
}

interface Result {
  status: SlugStatus;
  message: string | null;
}

const CHECK_DELAY_MS = 400;

const RECLAIM_MESSAGE =
  'This was the link of a QR code that was deleted. You can reuse it, but anyone who scans that old printed code will then reach this one.';

/** A link-name input with live feedback: cleaned-up preview, allowed or not, taken or free. */
export function SlugField({
  kind,
  id,
  label,
  value,
  onChange,
  currentSlug,
  excludeId,
  prefix,
  placeholder,
  hint,
  disabled,
  renameNote = 'Links already shared with it still work.',
  onStatusChange,
}: SlugFieldProps) {
  // The server's answer for one specific name (kept with the name it belongs to).
  const [remote, setRemote] = useState<{ slug: string; result: Result } | null>(null);

  const clean = normalizeSlug(value);
  const nothingToCheck = !clean || clean === currentSlug;
  const shapeProblem = nothingToCheck ? null : slugProblem(clean);

  // Everything that can be decided on the spot is worked out while rendering;
  // only the "is it taken?" answer needs the server.
  let result: Result;
  if (nothingToCheck) result = { status: 'idle', message: null };
  else if (shapeProblem) result = { status: 'problem', message: shapeProblem };
  else if (remote?.slug === clean) result = remote.result;
  else result = { status: 'checking', message: 'Checking…' };

  useEffect(() => {
    if (nothingToCheck || shapeProblem) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams({ kind, slug: clean, ...(excludeId && { excludeId }) });
        const response = await fetch(`/api/slugs/check?${query.toString()}`);
        if (!response.ok) throw new Error(`Check failed (${response.status})`);
        const body = (await response.json()) as { available: boolean; reclaimable?: boolean; error: string | null };
        if (cancelled) return;
        setRemote({
          slug: clean,
          result: body.available
            ? { status: 'ok', message: 'Available' }
            : body.reclaimable
              ? { status: 'reclaim', message: RECLAIM_MESSAGE }
              : { status: 'problem', message: body.error ?? 'That link name is already taken.' },
        });
      } catch (error) {
        console.error('Link name check error:', error);
        // The save itself checks again, so a failed live check must not block the person.
        if (!cancelled) setRemote({ slug: clean, result: { status: 'idle', message: null } });
      }
    }, CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clean, excludeId, kind, nothingToCheck, shapeProblem]);

  useEffect(() => {
    onStatusChange?.(result.status);
  }, [result.status, onStatusChange]);

  const renaming = Boolean(
    currentSlug && clean && clean !== currentSlug && (result.status === 'ok' || result.status === 'reclaim'),
  );
  const messageId = `${id}-message`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0 items-center rounded-lg border border-input focus-within:ring-3 focus-within:ring-ring/50">
        <span className="shrink-0 select-none truncate pl-2.5 text-xs text-muted-foreground" title={prefix}>
          {prefix.replace(/^https?:\/\//, '')}
        </span>
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={SLUG_MAX_LENGTH + 10}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={result.status === 'problem'}
          aria-describedby={messageId}
          className="min-w-0 flex-1 border-0 px-1 font-mono text-sm shadow-none focus-visible:ring-0"
          onChange={(event) => onChange(cleanSlugWhileTyping(event.target.value))}
        />
      </div>
      <p
        id={messageId}
        role="status"
        className={
          result.status === 'problem'
            ? 'text-sm font-medium text-destructive'
            : result.status === 'ok'
              ? 'text-sm font-medium text-emerald-700 dark:text-emerald-400'
              : result.status === 'reclaim'
                ? 'text-sm font-medium text-amber-700 dark:text-amber-400'
                : 'text-xs text-muted-foreground'
        }
      >
        {result.message ?? hint ?? ''}
      </p>
      {renaming && (
        <p className="text-xs text-muted-foreground">
          The old link ({prefix.replace(/^https?:\/\//, '')}
          {currentSlug}) will keep working. {renameNote}
        </p>
      )}
    </div>
  );
}
