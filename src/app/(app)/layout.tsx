import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { currentParent, activeChild, currentView } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { RoleSwitch } from "@/components/shell/RoleSwitch";
import { avatarFor } from "@/practice/accounts";

export const metadata: Metadata = {
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: "Free online practice that goes with your curriculum practice book. No ads, no chat, no trackers.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fee4d2", colorScheme: "light" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const parent = await currentParent();
  const child = parent ? await activeChild(parent) : null;
  const view = parent ? await currentView(parent) : "parent";
  return (
    <html lang="en-GB">
      <head><link rel="stylesheet" href="https://use.typekit.net/axz4iqd.css" /></head>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="absolute left-3 top-[-60px] z-50 rounded-lg bg-surface px-4 py-2 focus:top-3">Skip to the main content</a>
        <header className="border-b-[1.5px] border-[var(--ink)] bg-[var(--peach)]">
          <nav className="mx-auto flex min-h-[72px] max-w-[1320px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2" aria-label="Main">
            <Link href={parent ? (view === "child" ? "/me" : view === "admin" ? "/admin" : "/dashboard") : "/"} className="inline-flex min-h-[48px] items-center gap-2 text-[var(--ink)] no-underline">
              <span className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-[var(--ink)] bg-[var(--coral)] font-[family-name:var(--font-head)] text-lg font-bold">i</span>
              <span className="font-[family-name:var(--font-head)] text-[1.35rem] font-semibold leading-none">{BRAND}</span>
            </Link>
            <div className="flex flex-wrap items-center gap-1.5 text-[0.95rem] font-medium">
              {parent ? (
                <>
                  {!!parent.is_admin && <RoleSwitch current={view} />}
                  {child && view !== "admin" && (
                    <Link href="/home" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] border-[var(--ink)] bg-surface py-1 pl-1 pr-3 text-[var(--ink)] no-underline">
                      <span className="grid h-8 w-8 place-items-center rounded-full text-sm font-semibold" style={{ background: avatarFor(child.avatar).bg, color: avatarFor(child.avatar).fg }}>{child.first_name[0]}</span>
                      {child.first_name}
                    </Link>
                  )}
                  <Link href="/home" className="min-h-[44px] rounded-full px-3.5 py-2.5 text-[var(--ink)] no-underline hover:bg-surface">Who&apos;s practising</Link>
                  <form action="/logout" method="post"><button className="min-h-[44px] rounded-full px-3.5 py-2.5 text-[var(--ink)] underline hover:bg-surface">Log out</button></form>
                </>
              ) : (
                <>
                  <Link href="/books" className="min-h-[44px] rounded-full px-3.5 py-2.5 text-[var(--ink)] no-underline hover:bg-surface">Books</Link>
                  <Link href="/login" className="min-h-[44px] rounded-full px-3.5 py-2.5 text-[var(--ink)] no-underline hover:bg-surface">Log in</Link>
                  <Link href="/signup" className="rounded-full border-[1.5px] border-[var(--ink)] bg-[var(--violet)] px-5 py-2.5 text-[var(--ink)] no-underline hover:brightness-95">Enter book code</Link>
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
