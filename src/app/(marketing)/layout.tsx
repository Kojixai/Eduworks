import type { Metadata, Viewport } from "next";
import { assetStamp } from "@/marketing/books";
import { BRAND, DESCRIPTION, FONT_KIT, PUBLISHER, SITE_URL, SOCIAL_IMAGE, TAGLINE } from "@/marketing/brand";

const TITLE = `${BRAND}: ${TAGLINE.charAt(0).toLowerCase()}${TAGLINE.slice(1)}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: BRAND,
  authors: [{ name: PUBLISHER }],
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/site/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/site/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/site/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fee4d2", colorScheme: "light" };

// The marketing site has its own root layout so its stylesheet never touches the app pages.
// The styles, fonts and script are plain files in public/site (see src/marketing/tools for the generated artwork).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const css = `/site/css/site.css?v=${assetStamp("css/site.css")}`;
  const js = `/site/js/site.js?v=${assetStamp("js/site.js")}`;
  return (
    <html lang="en-GB">
      <head>
        <link rel="stylesheet" href={FONT_KIT} />
        <link rel="preload" href="/site/fonts/inter-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href={css} />
        {/* Open Graph written by hand: Next would otherwise copy it into a second set of tags for another network */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={BRAND} />
        <meta property="og:locale" content="en_GB" />
        <meta property="og:url" content={`${SITE_URL}/`} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={`${SITE_URL}${SOCIAL_IMAGE.src}`} />
        <meta property="og:image:width" content={String(SOCIAL_IMAGE.width)} />
        <meta property="og:image:height" content={String(SOCIAL_IMAGE.height)} />
        <meta property="og:image:alt" content={`${BRAND}: ${TAGLINE}`} />
      </head>
      <body className="ip-body" id="top">
        {children}
        <script src={js} defer />
      </body>
    </html>
  );
}
