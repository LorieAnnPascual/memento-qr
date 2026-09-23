'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { GitCompareArrows } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ComparePickerProps {
  options: { id: string; name: string }[];
  initialA?: string;
  initialB?: string;
}

export function ComparePicker({ options, initialA, initialB }: ComparePickerProps) {
  const router = useRouter();
  const [a, setA] = useState(initialA ?? '');
  const [b, setB] = useState(initialB ?? '');

  const sameChoice = a !== '' && a === b;
  const ready = a !== '' && b !== '' && !sameChoice;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="compare-a">QR code A</Label>
          <Select value={a} onValueChange={setA}>
            <SelectTrigger id="compare-a">
              <SelectValue placeholder="Choose a QR code" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="compare-b">QR code B</Label>
          <Select value={b} onValueChange={setB}>
            <SelectTrigger id="compare-b">
              <SelectValue placeholder="Choose a QR code" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {sameChoice && (
        <p role="alert" className="text-sm text-destructive">
          Pick two different QR codes.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Tip: use Duplicate on the QR list to make a second version with a different style, then compare how each one is scanned.
        </p>
        <Button type="button" disabled={!ready} onClick={() => router.push(`/qr/compare?a=${a}&b=${b}`)}>
          <GitCompareArrows className="size-4" />
          Compare
        </Button>
      </div>
    </div>
  );
}
