/** Small "v1.0.0" tag shown beside the app name; the value comes from package.json (see next.config.ts). */
export function AppVersion() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  if (!version) return null;

  return (
    <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
      v{version}
    </span>
  );
}
