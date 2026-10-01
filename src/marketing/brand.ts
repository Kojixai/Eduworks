/**
 * The one place the brand lives. Change the name here and every word on the home page follows.
 * The header and footer wordmark is live text (see Logo.tsx); the social card and icons are rendered by tools/build_assets.py + render-art.mjs.
 */
export const BRAND = "Learn Works";
export const PUBLISHER = "Learn Works";
/** Shown in the copyright line (the registered name at Companies House is "Blandfords International Ltd", see src/lib/company.ts). */
export const COPYRIGHT_HOLDER = "Blandfords International Limited";
export const TAGLINE = `Free online practice with your ${PUBLISHER} book`;
export const DESCRIPTION = `Free online practice that comes with ${PUBLISHER} study books. Type the code from inside your book to unlock 10 new questions for every page, marked instantly.`;

/** Used for the canonical link and the social-card URL. */
export const SITE_URL = "https://www.mylearn.works";

export const BRAND_WORD = "Learn";
export const BRAND_SUB = "Works";
/** Adobe Fonts kit (display face: Gloock). Domains allowed on the kit: mylearn.works, www.mylearn.works, localhost. */
export const FONT_KIT = "https://use.typekit.net/axz4iqd.css";
export const SOCIAL_IMAGE = { src: "/site/og.png", width: 1200, height: 630 };

/** Where the main calls to action go. */
export const PATHS = { enterCode: "/signup", login: "/login", dashboard: "/dashboard", books: "/books", learn: "/learn", privacy: "/privacy", terms: "/terms", credits: "/credits" } as const;
