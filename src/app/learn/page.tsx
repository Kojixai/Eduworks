import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { keyStages, subjectsFor, yearGroups } from "@/lib/repo";
import { Alert, ButtonLink, Card, Grid, ListLink, Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Learn" };

const chip = (active: boolean) =>
  `inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm no-underline ${active ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-ink"}`;

export default async function Learn({ searchParams }: { searchParams: Promise<{ ks?: string; year?: string }> }) {
  const { child } = await requireChild();
  const sp = await searchParams;
  const years = await yearGroups();
  const kss = await keyStages();
  const childYear = years.find((y) => y.id === child.year_group_id);
  const ks = sp.ks ?? childYear?.key_stage_id ?? "ks2";
  const year = sp.year === "all" ? null : (sp.year ?? (childYear?.key_stage_id === ks ? childYear.id : null));
  const subs = await subjectsFor(ks, year);
  const ksInfo = kss.find((k) => k.id === ks);

  return (
    <Page>
      <PageHeader title={`What will ${child.first_name} practise?`} subtitle="Choose a key stage, year and subject." />
      <div className="mb-3 flex flex-wrap gap-2" role="navigation" aria-label="Key stage">
        {kss.map((k) => (
          <Link key={k.id} href={`/learn?ks=${k.id}`} className={chip(k.id === ks)}>
            {k.name.replace("Key Stage", "KS")}
          </Link>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="navigation" aria-label="Year">
        <Link href={`/learn?ks=${ks}&year=all`} className={chip(!year)}>
          All years
        </Link>
        {years
          .filter((y) => y.key_stage_id === ks)
          .map((y) => (
            <Link key={y.id} href={`/learn?ks=${ks}&year=${y.id}`} className={chip(y.id === year)}>
              {y.name}
            </Link>
          ))}
      </div>

      {ksInfo?.content_policy && <Alert tone="warning">{ksInfo.content_policy}</Alert>}

      <Grid>
        <Card title="Subjects">
          {subs.length ? (
            subs.map((s) => (
              <ListLink key={s.id} href={`/learn/${ks}/${s.id}${year ? `?year=${year}` : ""}`} title={s.name} meta={`${s.units} units · ${s.statements} curriculum statements`} />
            ))
          ) : (
            <p className="text-sm text-muted">No subjects yet for this selection.</p>
          )}
        </Card>
        <div className="grid content-start gap-3">
          <Card title="Practice modes">
            <div className="grid gap-2">
              {(ks === "ks2" || ks === "ks1") && <ButtonLink href={`/papers?ks=${ks}`} variant="secondary">Timed practice papers</ButtonLink>}
              {ks === "ks1" && <ButtonLink href="/phonics" variant="secondary">Phonics check practice</ButtonLink>}
              {ks === "ks2" && <ButtonLink href="/times-tables" variant="secondary">Times tables check</ButtonLink>}
              <ButtonLink href="/progress" variant="ghost">See progress</ButtonLink>
            </div>
          </Card>
        </div>
      </Grid>
    </Page>
  );
}
