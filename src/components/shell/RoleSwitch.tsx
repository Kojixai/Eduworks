import { setViewAction } from "@/app/(app)/actions";
import type { View } from "@/lib/auth";

const LABEL: Record<View, string> = { admin: "Admin", parent: "Parent", child: "Child" };

/** Admin-only: preview the site as an admin, a parent or a child. Everyone else never sees this. */
export function RoleSwitch({ current }: { current: View }) {
  return (
    <form action={setViewAction} className="inline-flex rounded-full border-[1.5px] border-[var(--ink)] bg-surface p-[3px]" role="group" aria-label="View the site as">
      {(["admin", "parent", "child"] as View[]).map((v) => (
        <button
          key={v}
          name="view"
          value={v}
          aria-pressed={v === current}
          className={`min-h-[40px] rounded-full px-4 text-sm font-semibold ${v === current ? "bg-[var(--violet)] text-[var(--ink)]" : "text-[var(--ink)] hover:bg-[var(--peach)]"}`}
        >
          {LABEL[v]}
        </button>
      ))}
    </form>
  );
}
