import { EnvHttpProxyAgent, fetch } from "undici";

const dispatcher = new EnvHttpProxyAgent();

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
      const res = await fetch(url, {
        dispatcher,
        headers: { "user-agent": "eduworks-ingest/1.0 (+curriculum companion; contact via repo)", ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      const body = Buffer.from(await res.arrayBuffer());
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
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
