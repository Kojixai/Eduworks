import Link from "next/link";
import { currentParent, practiceChild, type Parent, type Student } from "@/lib/auth";
import { accessFor } from "@/lib/practice";
import { accessLength } from "@/practice/config";

export type Gate =
  | { state: "ok"; parent: Parent; child: Student | null; expiresAt: string }
  | { state: "anon" }
  | { state: "locked"; parent: Parent }
  | { state: "expired"; parent: Parent; expiresAt: string };

export async function gateFor(bookId: string): Promise<Gate> {
  const parent = await currentParent();
  if (!parent) return { state: "anon" };
  const a = (await accessFor(parent.id)).find((x) => x.bookId === bookId);
  if (!a) return { state: "locked", parent };
  if (!a.active) return { state: "expired", parent, expiresAt: a.expiresAt };
  return { state: "ok", parent, child: await practiceChild(parent), expiresAt: a.expiresAt };
}

const nice = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Shown instead of the practice when the book is not available to this visitor. */
export function GateNotice({ gate, here }: { gate: Exclude<Gate, { state: "ok" }>; here: string }) {
  if (gate.state === "anon")
    return (
      <div className="notice notice-info">
        <p><strong>This practice comes free with the printed book.</strong> Log in, or enter the code from inside the book to create your account.</p>
        <div className="row">
          <Link className="btn btn-primary btn-small" href={`/login?next=${encodeURIComponent(here)}`}>Log in</Link>
          <Link className="btn btn-secondary btn-small" href="/signup">Enter book code</Link>
        </div>
      </div>
    );
  if (gate.state === "expired")
    return (
      <div className="notice notice-info">
        <p><strong>Access to this book ended on {nice(gate.expiresAt)}.</strong> Enter a code from a new copy of the book to unlock it again.</p>
        <Link className="btn btn-primary btn-small" href="/signup">Enter book code</Link>
      </div>
    );
  return (
    <div className="notice notice-info">
      <p><strong>This book is not unlocked on your account yet.</strong> Enter the code printed inside the book to unlock its practice for {accessLength()}.</p>
      <Link className="btn btn-primary btn-small" href="/signup">Enter book code</Link>
    </div>
  );
}

export function ChooseLearner({ next }: { next: string }) {
  return (
    <div className="notice notice-info">
      <p>Choose who is practising so their progress is saved to the right profile.</p>
      <Link className="btn btn-primary btn-small" href={`/home?next=${encodeURIComponent(next)}`}>Choose a learner</Link>
    </div>
  );
}
