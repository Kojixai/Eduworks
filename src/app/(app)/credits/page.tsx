import { getStore } from "@/lib/db";
import { Badge, Card, Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Credits and licences" };

export default async function Credits() {
  const store = await getStore();
  const sources = await store.select<{ id: string; name: string; publisher: string; home_url: string; licence_id: string; attribution_text: string; licence_evidence_url: string | null }>("sources", { orderBy: [["name", "asc"]] });
  const licences = await store.select<{ id: string; name: string; url: string | null }>("licences");
  const lic = new Map(licences.map((l) => [l.id, l]));
  return (
    <Page narrow>
      <PageHeader title="Credits and licences" subtitle="Where the content on this site comes from." />
      <Card className="mb-3">
        <p className="text-sm">
          Contains public sector information licensed under the{" "}
          <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" rel="noopener noreferrer">
            Open Government Licence v3.0
          </a>
          . Oak National Academy lesson content is used under the OGL; each page that shows it carries the line &ldquo;A [subject] lesson by Oak National Academy licensed under Open Government Licence (OGL)&rdquo;. Material listed as third-party in the Standards and Testing Agency copyright reports is never shown. Logos are not reproduced.
        </p>
      </Card>
      <div className="grid gap-3">
        {sources.map((s) => (
          <Card key={s.id}>
            <p className="font-medium">{s.name}</p>
            <p className="text-xs text-muted">{s.publisher}</p>
            <p className="mt-1 text-sm">{s.attribution_text}</p>
            <p className="mt-1 text-xs">
              <Badge tone={s.licence_id === "OGL-3.0" ? "primary" : "neutral"}>{lic.get(s.licence_id)?.name ?? s.licence_id}</Badge>{" "}
              {s.home_url && (
                <a href={s.home_url} rel="noopener noreferrer">
                  Source
                </a>
              )}
            </p>
          </Card>
        ))}
      </div>
    </Page>
  );
}
