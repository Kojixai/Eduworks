import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { currentParent, activeChild } from "@/lib/auth";
import { avatarFor } from "@/practice/accounts";

export const metadata: Metadata = {
  title: { default: "Inkworks Practice", template: "%s · Inkworks Practice" },
  description: "Free online practice that goes with your curriculum practice book. No ads, no chat, no trackers.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f6f2", colorScheme: "light" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const parent = await currentParent();
  const child = parent ? await activeChild(parent) : null;
  return (
    <html lang="en-GB">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="absolute left-3 top-[-60px] z-50 rounded-lg bg-surface px-4 py-2 focus:top-3">Skip to the main content</a>
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex min-h-[68px] max-w-[1080px] flex-wrap items-center justify-between gap-2 px-5 py-2" aria-label="Main">
            <Link href={parent ? "/home" : "/"} className="inline-flex min-h-[48px] items-center gap-2.5 text-ink no-underline">
              <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-primary font-[family-name:var(--font-head)] text-base font-bold text-on-primary">I</span>
              <span className="font-[family-name:var(--font-head)] text-[1.15rem] font-semibold leading-tight">
                Inkworks Practice
                <small className="block text-xs font-normal text-muted">Free online practice with your book</small>
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-1 font-[family-name:var(--font-head)] text-[0.95rem] font-medium">
              {parent ? (
                <>
                  {child && (
                    <Link href="/home" className="mr-1 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface-muted py-1 pl-1 pr-3 text-ink no-underline">
                      <span className="grid h-7 w-7 place-items-center rounded-full text-sm font-semibold" style={{ background: avatarFor(child.avatar).bg, color: avatarFor(child.avatar).fg }}>{child.first_name[0]}</span>
                      {child.first_name}
                    </Link>
                  )}
                  <Link href="/books" className="min-h-[44px] rounded-[10px] px-3 py-2.5 text-[var(--color-text)] no-underline hover:bg-bg">Books</Link>
                  <Link href="/learn" className="min-h-[44px] rounded-[10px] px-3 py-2.5 text-[var(--color-text)] no-underline hover:bg-bg">Curriculum</Link>
                  <Link href="/dashboard" className="min-h-[44px] rounded-[10px] px-3 py-2.5 text-[var(--color-text)] no-underline hover:bg-bg">Dashboard</Link>
                  <Link href="/account" className="min-h-[44px] rounded-[10px] px-3 py-2.5 text-[var(--color-text)] no-underline hover:bg-bg">Account</Link>
                  {!!parent.is_admin && <Link href="/admin" className="min-h-[44px] rounded-[10px] px-3 py-2.5 text-[var(--color-text)] no-underline hover:bg-bg">Admin</Link>}
                  <form action="/logout" method="post">
                    <button className="min-h-[44px] rounded-[10px] px-3 py-2.5 text-primary hover:bg-bg">Log out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/books" className="min-h-[44px] rounded-[10px] px-3 py-2.5 text-[var(--color-text)] no-underline hover:bg-bg">Books</Link>
                  <Link href="/login" className="min-h-[44px] rounded-[10px] px-3 py-2.5 text-[var(--color-text)] no-underline hover:bg-bg">Log in</Link>
                  <Link href="/signup" className="rounded-[12px] bg-primary px-4 py-2.5 text-on-primary no-underline hover:bg-primary-hover">Enter book code</Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <div id="main" className="flex-1">{children}</div>
        <footer className="mt-8 border-t border-border bg-surface">
          <div className="mx-auto max-w-[1080px] px-5 py-7 text-[0.92rem] text-muted">
            <nav className="mb-2 flex flex-wrap gap-x-5" aria-label="Footer">
              <Link href="/privacy" className="inline-flex min-h-[44px] items-center text-[var(--color-text)]">Privacy notice</Link>
              <Link href="/terms" className="inline-flex min-h-[44px] items-center text-[var(--color-text)]">Terms of use</Link>
              <Link href="/credits" className="inline-flex min-h-[44px] items-center text-[var(--color-text)]">Credits and licences</Link>
              <Link href="/signup" className="inline-flex min-h-[44px] items-center text-[var(--color-text)]">Where is my code?</Link>
            </nav>
            <p className="m-0">Inkworks Press. Practice that matches the printed books. No adverts, and we never email children.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
