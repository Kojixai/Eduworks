// The 4-digit PIN between the child view and the parent area.
// It is a convenience lock for a shared family device, not a security control: 4 digits can always be guessed
// with enough time. The account password protects the account; the PIN only stops a child wandering into the
// parent area by accident.

export const PIN_RE = /^\d{4}$/;

export async function hashPin(adultId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`inkworks-pin:${adultId}:${pin}`);
  try {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Plain-http LAN addresses have no crypto.subtle. Good enough for a convenience lock.
    let h = 2166136261;
    for (const b of data) h = Math.imul(h ^ b, 16777619) >>> 0;
    return "fnv:" + h.toString(16);
  }
}
