import { requireChild } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { MTC_DEFAULT_RULES, type MtcRules } from "@/lib/mtc";
import { Page, PageHeader } from "@/components/ui";
import { MtcPlayer } from "./MtcPlayer";

export const metadata = { title: "Times tables check" };

/** Loads MTC rules from assessment_rules (verified values win over the defaults). */
async function loadRules(): Promise<{ rules: MtcRules; verified: boolean }> {
  const rows = await (await getStore()).select<{ rule_key: string; value: string; verification_status: string }>("assessment_rules", { where: { assessment: "mtc" } });
  const rules = { ...MTC_DEFAULT_RULES } as Record<string, unknown>;
  for (const r of rows) {
    if (!(r.rule_key in rules)) continue;
    try {
      rules[r.rule_key] = JSON.parse(r.value);
    } catch {
      /* keep default */
    }
  }
  return { rules: rules as unknown as MtcRules, verified: rows.length > 0 && rows.every((r) => r.verification_status === "verified") };
}

export default async function TimesTables() {
  const { child } = await requireChild();
  const { rules, verified } = await loadRules();
  return (
    <Page narrow>
      <PageHeader title="Multiplication tables check" subtitle={`Practice for the Year 4 check: ${rules.questionCount} questions, ${rules.secondsPerQuestion} seconds each.`} back={{ href: "/learn?ks=ks2", label: "Learn" }} />
      <MtcPlayer rules={rules} rulesVerified={verified} childName={child.first_name} />
    </Page>
  );
}
