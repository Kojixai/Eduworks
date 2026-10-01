import { EnvHttpProxyAgent, fetch } from "undici";

const dispatcher = new EnvHttpProxyAgent();

/**
 * Honest, descriptive client identity (no browser impersonation). Override with EDU_USER_AGENT, e.g. to add a
 * contact address: EDU_USER_AGENT="eduworks-ingest/1.0 (+mailto:you@example.org)".
 */
export const USER_AGENT =
  process.env.EDU_USER_AGENT ?? "eduworks-ingest/1.0 (LearnWorks; non-commercial education project; fetches OGL v3.0 GOV.UK/STA publications; polite rate limits)";

/** Minimum gap between requests to the same host (gov.uk robots.txt sets no crawl-delay for generic agents). */
const MIN_GAP_MS = Number(process.env.EDU_HTTP_MIN_GAP_MS ?? 250);
const lastHit = new Map<string, number>();
async function politeWait(host: string) {
  const wait = (lastHit.get(host) ?? 0) + MIN_GAP_MS - Date.now();
  lastHit.set(host, Math.max(Date.now(), (lastHit.get(host) ?? 0) + MIN_GAP_MS));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export class BlockedHostError extends Error {
  constructor(public host: string, cause?: unknown) {
    super(`Host ${host} is not reachable from this environment (network policy or DNS).`);
    this.name = "BlockedHostError";
    this.cause = cause;
  }
}

export interface FetchResult {
  status: number;
  contentType: string;
  body: Buffer;
  url: string;
}

export async function httpGet(
  url: string,
  opts: { headers?: Record<string, string>; retries?: number; timeoutMs?: number } = {},
): Promise<FetchResult> {
  const retries = opts.retries ?? 3;
  const host = new URL(url).host;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await politeWait(host);
      const res = await fetch(url, {
        dispatcher,
        headers: { "user-agent": USER_AGENT, ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      const body = Buffer.from(await res.arrayBuffer());
      // 429/5xx are retried with backoff (honouring Retry-After); a 403 is retried too in case it is rate limiting,
      // but is then returned to the caller as a plain 403 (never bypassed, never disguised as another client)
      if (res.status === 429 || res.status >= 500 || (res.status === 403 && attempt < Math.min(retries, 2))) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        const ra = Number(res.headers.get("retry-after"));
        await new Promise((r) => setTimeout(r, Math.min(60_000, ra > 0 ? ra * 1000 : 2000 * 2 ** attempt)));
        continue;
      }
      return { status: res.status, contentType: res.headers.get("content-type") ?? "", body, url: res.url || url };
    } catch (e) {
      lastErr = e;
      const msg = String((e as { cause?: unknown }).cause ?? e);
      // The sandbox egress proxy rejects CONNECT for disallowed hosts; undici surfaces it as a cancelled request.
      if (/cancelled|ECONNREFUSED|ENOTFOUND|403|407|EAI_AGAIN/i.test(msg)) throw new BlockedHostError(host, e);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export async function httpJson<T>(url: string, headers?: Record<string, string>): Promise<{ status: number; data: T }> {
  const r = await httpGet(url, { headers: { accept: "application/json", ...headers } });
  const text = r.body.toString("utf8");
  return { status: r.status, data: (text ? JSON.parse(text) : null) as T };
}

/** Probe a list of hosts; used by the network check step and the report. */
export async function probeHosts(urls: string[]): Promise<Array<{ url: string; ok: boolean; status?: number; error?: string }>> {
  const out = [];
  for (const url of urls) {
    try {
      const r = await httpGet(url, { retries: 0, timeoutMs: 20_000 });
      out.push({ url, ok: r.status < 400, status: r.status });
    } catch (e) {
      out.push({ url, ok: false, error: e instanceof BlockedHostError ? "blocked by network policy" : String(e) });
    }
  }
  return out;
}
