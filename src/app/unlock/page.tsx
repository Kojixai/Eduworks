import { redirect } from "next/navigation";
import { isParentLocked, requireParent } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { UnlockForm } from "./UnlockForm";

export const metadata = { title: "Parent area" };

export default async function Unlock({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const p = await requireParent();
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (!(await isParentLocked(p))) redirect(safe);
  return (
    <Page narrow>
      <PageHeader title="Parent area" subtitle="This part is for grown-ups. Enter your 4-digit PIN to continue." />
      <UnlockForm next={safe} />
    </Page>
  );
}
