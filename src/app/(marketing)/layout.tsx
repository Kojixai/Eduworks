import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Inkworks Practice",
  description: "Free online practice that goes with Inkworks Press study books.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// The marketing site has its own root layout so its stylesheet never touches the app pages.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
