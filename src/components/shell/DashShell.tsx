import Link from "next/link";
import type { ReactNode } from "react";
import type { View } from "@/lib/auth";
import { IconAdmin, IconBooks, IconChart, IconCurriculum, IconHome, IconUser } from "./icons";

type Item = { href: string; label: string; icon: () => ReactNode; key: string };

/** Layout for the logged-in home screens: a slim icon rail, the main column and an optional right-hand panel. */
export function DashShell({ view, active, isAdmin, adminHref = "/admin", aside, children }: { view: View; active: string; isAdmin?: boolean; adminHref?: string; aside?: ReactNode; children: ReactNode }) {
  const home = view === "child" ? "/me" : "/dashboard";
  const items: Item[] = [
    { key: "home", href: home, label: view === "child" ? "Home" : "Dashboard", icon: view === "child" ? IconHome : IconChart },
    { key: "books", href: "/books", label: "Books", icon: IconBooks },
    { key: "learn", href: "/learn", label: "Curriculum", icon: IconCurriculum },
    ...(view !== "child" ? [{ key: "account", href: "/account", label: "Account", icon: IconUser }] : []),
    ...(isAdmin ? [{ key: "admin", href: adminHref, label: "Back office", icon: IconAdmin }] : []),
  ];
  return (
    <div className={`mx-auto grid max-w-[1320px] gap-5 px-4 pb-24 pt-5 lg:pb-10 ${aside ? "lg:grid-cols-[84px_minmax(0,1fr)_340px]" : "lg:grid-cols-[84px_minmax(0,1fr)]"}`}>
      <nav aria-label="Sections" className="fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-full border-[1.5px] border-[var(--ink)] bg-surface px-2 py-1 shadow-[3px_3px_0_var(--ink)] lg:static lg:inset-auto lg:flex-col lg:items-center lg:justify-start lg:gap-2 lg:self-start lg:rounded-[var(--radius-lg)] lg:px-0 lg:py-3 lg:shadow-none">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            aria-current={it.key === active ? "page" : undefined}
            className={`group relative grid h-12 w-12 place-items-center rounded-2xl text-[var(--ink)] no-underline ${it.key === active ? "bg-[var(--c-pink)]" : "hover:bg-[var(--c-cream)]"}`}
          >
            <it.icon />
            <span className="sr-only">{it.label}</span>
            <span aria-hidden className="pointer-events-none absolute left-14 hidden whitespace-nowrap rounded-lg bg-[var(--ink)] px-2.5 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 lg:block">{it.label}</span>
          </Link>
        ))}
      </nav>
      <main id="dash-main" className="min-w-0">{children}</main>
      {aside && <div className="min-w-0 lg:sticky lg:top-5 lg:self-start">{aside}</div>}
    </div>
  );
}
