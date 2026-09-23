export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/40 px-4">
      {children}
    </div>
  );
}
