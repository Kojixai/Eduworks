import { Page, PageHeader } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <Page narrow>
      <PageHeader title="Log in" subtitle="Parents log in here. Children practise from your account." />
      <LoginForm next={next ?? ""} />
    </Page>
  );
}
