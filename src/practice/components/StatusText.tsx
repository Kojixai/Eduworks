import type { UnitStatus } from "@/practice/mastery";

export function StatusText({ st }: { st: UnitStatus }) {
  if (st.state === "secure") return <span className="pill pill-ok">Secure</span>;
  if (st.state === "not-started") return <span className="muted small">Not started</span>;
  if (st.due) return <span className="pill">Ready for another go</span>;
  return <span className="small">Practising, try again from {st.nextDueDay ? new Date(st.nextDueDay + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}</span>;
}
