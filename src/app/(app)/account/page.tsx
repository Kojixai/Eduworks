import { requireParentArea } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { accessFor, allBooks } from "@/lib/practice";
import { Badge, Card, Page, PageHeader, Checkbox, Button } from "@/components/ui";
import { setMailingAction } from "../actions";
import { MAILING_WORDING } from "@/practice/config-public";
import { PinForm, DeleteForm } from "./Forms";

export const metadata = { title: "Account" };
const nice = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function AccountPage() {
  const parent = await requireParentArea("/account");
  const store = await getStore();
  const student = parent.account_type === "student";
  const [access, books, consent] = await Promise.all([
    accessFor(parent.id), allBooks(),
    store.first<{ consented: number; created_at: string }>("mailing_consent", { where: { parent_id: parent.id }, orderBy: [["created_at", "desc"]] }),
  ]);
  const title = new Map(books.map((b) => [b.meta.id, b.meta.title]));
  return (
    <Page narrow>
      <PageHeader title="Your account" subtitle={`${parent.name} · ${parent.email}${student ? " · student account" : ""}`} />
      <div className="grid gap-4">
        <Card title="Your books">
          {access.length === 0 ? <p className="m-0 text-sm text-muted">No books yet. <a href="/signup">Enter a code</a>.</p> : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {access.map((a) => (
                <li key={a.bookId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{title.get(a.bookId) ?? a.bookId}</span>
                  {a.active ? <Badge tone="success">Until {nice(a.expiresAt)}</Badge> : <Badge tone="warning">Ended {nice(a.expiresAt)}</Badge>}
                </li>
              ))}
            </ul>
          )}
          <p className="mb-0 mt-3 text-xs text-muted">Add another book by entering its code with the same email and password.</p>
        </Card>

        {!student && (
          <Card title="Parent PIN">
            <p className="mt-0 text-sm text-muted">{parent.pin_hash ? "A PIN is set. It locks this area while a child is practising." : "Set a 4-digit PIN. When you hand the device to a child, this area asks for it."}</p>
            <PinForm hasPin={!!parent.pin_hash} />
          </Card>
        )}

        {!student && (
          <Card title="Mailing list">
            <form action={setMailingAction}>
              <Checkbox name="mailing" defaultChecked={!!consent?.consented} label={MAILING_WORDING} />
              <p className="my-2 text-xs text-muted">Optional. Your access never depends on this.{consent ? ` Last changed ${nice(consent.created_at)}.` : ""}</p>
              <Button variant="secondary" type="submit">Save</Button>
            </form>
          </Card>
        )}

        <Card title="Your data">
          <p className="mt-0 text-sm text-muted">Download everything we hold about this account and its learners.</p>
          <a href="/account/export" className="inline-flex min-h-[48px] items-center rounded-[var(--radius-md)] border border-border bg-surface px-4 text-[var(--color-text)] no-underline hover:bg-surface-muted">Download my data (JSON)</a>
        </Card>

        <Card title="Delete account">
          <p className="mt-0 text-sm text-muted">This removes the account, every learner profile and all their results. It cannot be undone.</p>
          <DeleteForm />
        </Card>
      </div>
    </Page>
  );
}
