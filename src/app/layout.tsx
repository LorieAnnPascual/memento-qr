import type { Metadata } from "next";
import { EB_Garamond, Inter, Lora, Montserrat, Oswald, Playfair_Display } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  // Loaded as real static weights (not synthetic/faux-bold) so headings stay
  // crisp at the semibold/bold weights readability needs for a display serif.
  weight: ["500", "600", "700"],
});

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  // 500 is used for labels/emphasis — EB Garamond regular (400) alone reads
  // too light for UI text at small sizes.
  weight: ["400", "500", "600"],
});

// These four are only used as optional title/caption fonts for QR cards
// (src/lib/qr/card-fonts.ts) — loaded globally so both the live preview and
// the canvas/SVG export (which needs document.fonts to already have them)
// can render with them.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "700"] });
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "700"],
});
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], weight: ["400", "600"] });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "Memento QR",
  description: "Internal QR code generator and landing page builder",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${playfairDisplay.variable} ${ebGaramond.variable} ${inter.variable} ${montserrat.variable} ${lora.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
