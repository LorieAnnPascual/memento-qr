import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';

interface SearchFormProps {
  defaultValue?: string;
  autoFocus?: boolean;
}

/** A plain GET form: works without JavaScript and keeps the query in the URL. */
export function SearchForm({ defaultValue = '', autoFocus = false }: SearchFormProps) {
  return (
    <form action="/search" method="get" role="search" className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        maxLength={100}
        placeholder="Search QR codes, pages, folders…"
        aria-label="Search everything"
        className="pl-8"
      />
    </form>
  );
}
