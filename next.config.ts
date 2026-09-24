import { readFileSync } from "node:fs";

import type { NextConfig } from "next";

import { PUBLIC_PAGE_CSP } from "./src/lib/pages/csp";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  // Shown next to the app name in the sidebar and under Settings.
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // No need to tell every visitor which framework this is.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // The dashboard and its API: not embeddable by other sites (clickjacking),
        // no content-type sniffing, and no full URLs leaked to other sites.
        // Published pages (/p/) have their own stricter set below.
        source: "/((?!p/|_next/static|_next/image).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // Published landing pages are public and render team-entered content.
        source: "/p/:shortCode*",
        headers: [
          { key: "Content-Security-Policy", value: PUBLIC_PAGE_CSP },
          // Publish, unpublish and expiry changes must take effect immediately.
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // YouTube refuses to play (error 153, "video player configuration") when
          // the embedding page sends no referrer at all; origin only is enough.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
