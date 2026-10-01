import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { papers } from "@/lib/repo";
import { Alert, Badge, Card, EmptyState, ListLink, Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Practice papers" };

export default async function Papers({ searchParams }: { searchParams: Promise<{ ks?: string }> }) {
  await requireChild();
  const ks = (await searchParams).ks ?? "ks2";
  const all = (await papers(ks)).filter((p) => p.review_status === "auto_ok");
  const official = all.filter((p) => p.kind === "official");
  const original = all.filter((p) => p.kind !== "official");
  return (
    <Page>
      <PageHeader title="Timed practice papers" subtitle="Real paper structure, a countdown timer and a score breakdown by curriculum area." back={{ href: `/learn?ks=${ks}`, label: "Learn" }} />
      <div className="mb-3 flex gap-2">
        {["ks1", "ks2"].map((k) => (
          <Link key={k} href={`/papers?ks=${k}`} className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm no-underline ${k === ks ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-ink"}`}>
            {k.toUpperCase()}
          </Link>
        ))}
      </div>
      <Card title="Past SATs papers" className="mb-3">
        {official.length ? (
          official.map((p) => <ListLink key={p.id} href={`/papers/${encodeURIComponent(p.id)}`} title={p.name} meta={`${p.year} · ${p.total_marks} marks · ${p.time_allowed_minutes} minutes`} />)
        ) : (
          <EmptyState title="Past papers are not available yet.">They appear once the official Standards and Testing Agency papers have been harvested and checked.</EmptyState>
        )}
      </Card>
      <Card title="Arithmetic practice papers">
        <Alert tone="neutral">
          These papers follow the published arithmetic test structure. The questions are original and the answers are calculated, not copied from a test.
        </Alert>
        {original.map((p) => (
          <ListLink key={p.id} href={`/papers/${encodeURIComponent(p.id)}`} title={p.name} meta={<>{p.question_count} questions · {p.total_marks} marks · {p.time_allowed_minutes} minutes <Badge>original</Badge></>} />
        ))}
      </Card>
    </Page>
  );
}
