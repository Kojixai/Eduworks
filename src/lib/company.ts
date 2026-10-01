/**
 * Who runs the site. One place for the legal entity, used by the legal pages and the footer.
 * Registered details are as shown at Companies House.
 */
export const COMPANY = {
  name: "Blandfords International Ltd",
  number: "12256702",
  jurisdiction: "England",
  addressLines: ["SSI House", "Fordbrook Business Centre", "Marlborough Road", "Pewsey", "England", "SN9 5NU"],
  email: "support@mylearn.works",
  siteName: "Learn Works",
  siteUrl: "https://www.mylearn.works",
  siteHost: "mylearn.works",
  imprint: "Learn Works",
} as const;

/** The registered office on one line. */
export const COMPANY_ADDRESS = COMPANY.addressLines.join(", ");

/** Shown on the three legal pages. Change it whenever any of them changes in a way that matters. */
export const LEGAL_UPDATED = "1 October 2026";
