"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const LINKS: Array<[string, string]> = [
  ["/admin", "Dashboard"],
  ["/admin/review", "Review"],
  ["/admin/questions", "Questions"],
  ["/admin/lessons", "Lessons"],
  ["/admin/curriculum", "Curriculum"],
  ["/admin/papers", "Papers"],
  ["/admin/coverage", "Coverage"],
  ["/admin/sources", "Sources"],
  ["/admin/ingest", "Ingest"],
  ["/admin/attribution", "Attribution"],
  ["/admin/book-export", "Book export"],
  ["/admin/redemptions", "Redemptions"],
];

export function AdminNav() {
  const path = usePathname();
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    // keep the current section visible in the horizontally scrolling list on small screens
    const ul = list.current;
    const el = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !el) return;
    const a = el.getBoundingClientRect();
    const b = ul.getBoundingClientRect();
    ul.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
  }, [path]);
  return (
    <nav aria-label="Admin" className="admin-nav border-b border-border bg-surface">
      <ul ref={list} className="mx-auto flex max-w-[960px] gap-1 overflow-x-auto px-4 py-1 text-sm whitespace-nowrap">
        {LINKS.map(([href, label]) => {
          const active = href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-3 no-underline ${active ? "bg-primary-soft font-medium text-primary" : "text-ink hover:bg-surface-muted"}`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
