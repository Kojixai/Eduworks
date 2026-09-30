import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { currentParent, activeChild } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "Eduworks – practice companion", template: "%s · Eduworks" },
  description: "Free online practice that goes with your curriculum practice book. No ads, no chat, no trackers.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f5f7", colorScheme: "light" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const parent = await currentParent();
  const child = parent ? await activeChild(parent) : null;
  return (
    <html lang="en-GB">
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex min-h-[56px] max-w-[960px] flex-wrap items-center justify-between gap-2 px-4" aria-label="Main">
            <Link href={parent ? "/home" : "/"} className="text-lg font-semibold text-ink no-underline">
              Eduworks
            </Link>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {parent ? (
                <>
                  {child && (
                    <Link href="/home" className="rounded-full bg-primary-soft px-3 py-1.5 text-primary no-underline">
                      {child.first_name}
                    </Link>
                  )}
                  <Link href="/learn" className="px-2 py-2 no-underline">Learn</Link>
                  <Link href="/progress" className="px-2 py-2 no-underline">Progress</Link>
                  {!!parent.is_admin && <Link href="/admin" className="px-2 py-2 no-underline">Admin</Link>}
                  <form action="/logout" method="post">
                    <button className="px-2 py-2 text-primary">Log out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="px-2 py-2 no-underline">Log in</Link>
                  <Link href="/signup" className="rounded-[var(--radius-md)] bg-primary px-3 py-2 text-on-primary no-underline">Redeem book code</Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="mt-8 border-t border-border bg-surface">
          <div className="mx-auto flex max-w-[960px] flex-wrap gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted">
            <span>No ads. No chat. No trackers.</span>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/credits">Credits and licences</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
