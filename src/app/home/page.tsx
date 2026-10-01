import { requireParent, childrenOf, activeChild } from "@/lib/auth";
import { chooseChildAction, removeChildAction } from "../actions";
import { Alert, Badge, Button, Card, Page, PageHeader } from "@/components/ui";
import { AddChildForm } from "./AddChildForm";
import { yearGroups } from "@/lib/repo";
import { getStore } from "@/lib/db";

export const metadata = { title: "Choose a child" };

export default async function Home({ searchParams }: { searchParams: Promise<{ welcome?: string; added?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/learn";
  const parent = await requireParent();
  const kids = await childrenOf(parent.id);
  const active = await activeChild(parent);
  const years = await yearGroups();
  const yname = (id: string | null) => years.find((y) => y.id === id)?.name ?? "Year not set";
  const store = await getStore();
  const books = await store.select<{ book_id: string }>("redemptions", { where: { parent_id: parent.id }, columns: ["book_id"] });
  const bookRows = books.length ? await store.select<{ id: string; title: string }>("books", { where: { id: books.map((b) => b.book_id) } }) : [];

  return (
    <Page narrow>
      <PageHeader title={`Hello, ${parent.name.split(" ")[0]}`} subtitle="Who is practising today?" />
      {sp.welcome && <Alert tone="success">Your account is ready. Add your child below to start.</Alert>}
      {sp.added && <Alert tone="success">The book has been added to your account.</Alert>}

      {kids.length > 0 && (
        <Card className="mb-4">
          <ul className="divide-y divide-border">
            {kids.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 py-2">
                <form action={chooseChildAction} className="flex-1">
                  <input type="hidden" name="childId" value={k.id} />
                  <input type="hidden" name="next" value={next} />
                  <button className="flex min-h-[48px] w-full items-center gap-3 text-left">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">{k.first_name[0]}</span>
                    <span>
                      <span className="block font-medium">{k.first_name}</span>
                      <span className="block text-xs text-muted">{yname(k.year_group_id)}</span>
                    </span>
                    {active?.id === k.id && <Badge tone="primary">Practising</Badge>}
                  </button>
                </form>
                <details className="relative">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center px-2 text-xs text-muted" aria-label={`Options for ${k.first_name}`}>
                    •••
                  </summary>
                  <form action={removeChildAction} className="absolute right-0 z-10 mt-1 w-56 rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
                    <input type="hidden" name="childId" value={k.id} />
                    <p className="mb-2 text-xs text-muted">This deletes {k.first_name}&apos;s profile and all their results.</p>
                    <Button variant="danger" full className="text-sm">
                      Delete {k.first_name}
                    </Button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={kids.length ? "Add another child" : "Add your child"} className="mb-4">
        <p className="mb-3 text-sm text-muted">First name only. We never ask for a child's email or surname.</p>
        <AddChildForm years={years.filter((y) => y.key_stage_id !== "ks5")} />
      </Card>

      {bookRows.length > 0 && (
        <Card title="Your books">
          <ul className="list-disc pl-5 text-sm">
            {bookRows.map((b) => (
              <li key={b.id}>{b.title}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Bought another book? Redeem its code with the same email and password.</p>
        </Card>
      )}
    </Page>
  );
}
