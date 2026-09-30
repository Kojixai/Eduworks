import { Page, PageHeader } from "@/components/ui";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Redeem your book code" };

export default function SignupPage() {
  return (
    <Page narrow>
      <PageHeader title="Redeem your book code" subtitle="Create your free parent account. It takes about a minute." />
      <SignupForm />
    </Page>
  );
}
