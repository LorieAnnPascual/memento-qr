'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { THEME_OPTIONS } from '@/components/layout/theme-toggle';

const subscribe = (): (() => void) => () => {};

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser; avoid marking one selected during SSR.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose how Memento QR looks. System follows your device.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            role="radio"
            aria-checked={mounted && theme === value}
            variant={mounted && theme === value ? 'default' : 'outline'}
            onClick={() => setTheme(value)}
          >
            <Icon className="size-4" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
