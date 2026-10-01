import { Page, PageHeader } from "@/components/ui";
import { SignupForm } from "./SignupForm";
import { yearGroups } from "@/lib/repo";
import { accessLength, ORDER_MODE } from "@/practice/config";

export const metadata = { title: "Enter your book code" };

export default async function SignupPage() {
  const years = (await yearGroups()).filter((y) => ["ks3", "ks4", "ks5"].includes(y.key_stage_id ?? ""));
  return (
    <Page narrow>
      <PageHeader title="Enter your book code" subtitle={`Free with your book. Your code unlocks it for ${accessLength()}.`} />
      <SignupForm years={years.map((y) => ({ id: y.id, name: y.name }))} orderMode={ORDER_MODE} />
    </Page>
  );
}
