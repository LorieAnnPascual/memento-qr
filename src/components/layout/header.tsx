import { MobileNav } from './mobile-nav';
import { SearchForm } from './search-form';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

interface HeaderProps {
  email: string;
  fullName: string | null;
}

export function Header({ email, fullName }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
      <MobileNav />
      <div className="mx-3 flex min-w-0 flex-1 justify-center">
        <SearchForm />
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu email={email} fullName={fullName} />
      </div>
    </header>
  );
}
