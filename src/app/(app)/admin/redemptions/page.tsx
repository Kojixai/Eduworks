import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { PAGE_SIZE, fmtDate, pageOf, redemptionsWithBooks } from "@/lib/admin";
import { Badge, Card, EmptyState, Grid, Page, PageHeader, Stat } from "@/components/ui";
import { Pager, TableWrap, n, td, th, type SP, ExportButton } from "../_ui";

export const metadata = { title: "Redemptions" };

export default async function RedemptionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const store = await getStore();
  const [total, optIn, rows] = await Promise.all([
    store.count("redemptions"),
    store.count("redemptions", { marketing_opt_in: 1 }),
    redemptionsWithBooks(store, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);

  return (
    <Page>
      <PageHeader title="Redemptions" subtitle="Book code redemptions. Personal data: handle exports with care." />
      <Grid cols={2}>
        <Stat label="Redemptions" value={n(total)} />
        <Stat label="Marketing opt-in" value={n(optIn)} hint="rows with consent" />
      </Grid>
      <div className="my-4 flex flex-wrap gap-2">
        <ExportButton table="redemptions" format="csv">
          All redemptions (CSV)
        </ExportButton>
        <ExportButton table="mailing_list" format="csv">
          Mailing list (CSV, opted-in only)
        </ExportButton>
      </div>
      {!rows.length ? (
        <EmptyState title="No redemptions yet." />
      ) : (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Parent</th>
                <th className={th}>Email</th>
                <th className={th}>Order number</th>
                <th className={th}>Book</th>
                <th className={th}>Opt-in</th>
                <th className={th}>Consent</th>
                <th className={th}>Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{r.parent_name}</td>
                  <td className={td}>{r.email}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.amazon_order_number}</td>
                  <td className={td}>{r.book_title}</td>
                  <td className={td}>{r.marketing_opt_in ? <Badge tone="success">yes</Badge> : <Badge>no</Badge>}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.consent_timestamp)}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
      <Pager path="/admin/redemptions" sp={sp} page={page} total={total} size={PAGE_SIZE} />
    </Page>
  );
}
