import { requireChild } from "@/lib/auth";
import { phonicsSets, phonicsThreshold, phonicsWords } from "@/lib/repo";
import { AttributionFooter, Badge, Card, ListLink, Page, PageHeader } from "@/components/ui";
import { PhonicsPlayer } from "./PhonicsPlayer";

export const metadata = { title: "Phonics check practice" };

export default async function Phonics({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  await requireChild();
  const setName = (await searchParams).set;
  const sets = await phonicsSets();
  if (!setName)
    return (
      <Page narrow>
        <PageHeader title="Phonics screening check practice" subtitle="Year 1 · 40 words · your child reads each word aloud and you mark it." back={{ href: "/learn?ks=ks1", label: "Learn" }} />
        <Card className="mb-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Sit together. Show one word at a time and let your child read it aloud.</li>
            <li>Words with an alien 👾 are made-up words (pseudo-words). They should be read using phonics, not guessed.</li>
            <li>Tap Right or Wrong for each word. There are 40 words in two sections.</li>
          </ul>
        </Card>
        <Card title="Choose a word set">
          {sets.map((s) => (
            <ListLink key={s.name} href={`/phonics?set=${encodeURIComponent(s.name)}`} title={s.name} meta={<>{s.count} words {s.kind === "original_practice" ? <Badge>original</Badge> : <Badge tone="primary">official</Badge>}</>} />
          ))}
        </Card>
      </Page>
    );
  const words = await phonicsWords(setName);
  const year = words.length ? Number(setName.match(/^(\d{4})/)?.[1]) || null : null;
  const t = await phonicsThreshold(year);
  return (
    <>
      <Page narrow>
        <PageHeader title={setName} back={{ href: "/phonics", label: "Word sets" }} />
        <PhonicsPlayer setName={setName} words={words.map((w) => ({ id: w.id, word: w.word, pseudo: !!w.is_pseudo, section: w.section }))} threshold={t.threshold} thresholdVerified={t.verified} />
      </Page>
      <AttributionFooter lines={[words[0]?.attribution_text]} />
    </>
  );
}
