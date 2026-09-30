/**
 * gov.uk Content API client (https://content-api.publishing.service.gov.uk/).
 * Every gov.uk page has a JSON twin at https://www.gov.uk/api/content/<path>.
 * Collections list their documents in links.documents; publications list files in details.attachments.
 */
import { httpJson } from "./http";

export const GOVUK = "https://www.gov.uk";

export interface GovukLink {
  base_path: string;
  title: string;
  document_type?: string;
  public_updated_at?: string;
  api_path?: string;
}

export interface GovukAttachment {
  id?: string;
  title: string;
  url: string; // usually https://assets.publishing.service.gov.uk/media/<id>/<file>.pdf
  content_type?: string;
  filename?: string;
  file_size?: number;
  number_of_pages?: number;
  attachment_type?: string;
}

export interface GovukContent {
  base_path: string;
  title: string;
  description?: string;
  document_type: string;
  public_updated_at?: string;
  first_published_at?: string;
  details: {
    body?: string; // HTML
    attachments?: GovukAttachment[];
    collection_groups?: Array<{ title: string; body?: string; documents: string[] }>;
    documents?: string[];
    [k: string]: unknown;
  };
  links: {
    documents?: GovukLink[];
    children?: GovukLink[];
    [k: string]: GovukLink[] | undefined;
  };
}

export async function getContent(basePath: string): Promise<GovukContent> {
  const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const r = await httpJson<GovukContent>(`${GOVUK}/api/content${path}`);
  if (r.status >= 400) throw new Error(`gov.uk content API ${r.status} for ${path}`);
  return r.data;
}

export const pageUrl = (basePath: string) => `${GOVUK}${basePath.startsWith("/") ? basePath : "/" + basePath}`;

/** Attachments of a publication, with absolute URLs. */
export function attachments(c: GovukContent): GovukAttachment[] {
  return (c.details.attachments ?? []).map((a) => ({
    ...a,
    url: a.url.startsWith("http") ? a.url : `${GOVUK}${a.url}`,
  }));
}

/** Documents of a collection, in the order gov.uk groups them. */
export function collectionDocuments(c: GovukContent): GovukLink[] {
  return c.links.documents ?? [];
}

/** Strip HTML to text while keeping list items and headings on their own lines. */
export function htmlToLines(html: string): string[] {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|li|h[1-6]|tr|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<h([1-6])[^>]*>/gi, (_m, n) => `\n${"#".repeat(Number(n))} `)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
