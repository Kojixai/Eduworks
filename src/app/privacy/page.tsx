import { Card, Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Privacy notice" };

export default function Privacy() {
  return (
    <Page narrow>
      <PageHeader title="Privacy notice" subtitle="Plain English. Last updated when this site was published." />
      <div className="grid gap-3 text-sm">
        <Card title="What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>From the parent: name, email address, a password (stored only as a secure hash), the book code you redeemed and your Amazon order number (to confirm the purchase).</li>
            <li>For each child: first name and, if you choose, school year. We never ask for a child&apos;s surname, email, photo, date of birth or school.</li>
            <li>Practice results: which activities were done, answers given, marks and dates, so we can show progress.</li>
            <li>A login cookie that keeps you signed in. It is essential and is not used for tracking.</li>
          </ul>
        </Card>
        <Card title="What we don't do">
          <ul className="list-disc space-y-1 pl-5">
            <li>No adverts, no chat, no messaging between users.</li>
            <li>No third-party trackers, analytics scripts or social media pixels.</li>
            <li>We never sell or share personal data.</li>
          </ul>
        </Card>
        <Card title="Marketing emails">
          <p>We only email you about new books and resources if you ticked the separate, optional box when signing up. The box is never ticked for you. We record when you gave consent. You can withdraw it at any time by replying to any email or contacting us.</p>
        </Card>
        <Card title="Why we use your data (lawful basis)">
          <ul className="list-disc space-y-1 pl-5">
            <li>To provide the service you asked for (your account and your children&apos;s practice): contract.</li>
            <li>To check the book was bought: legitimate interests.</li>
            <li>Marketing emails: your consent, only if you opted in.</li>
          </ul>
        </Card>
        <Card title="How long we keep it and your rights">
          <p>We keep your account while it is in use. You can remove a child&apos;s profile and their results at any time from the home page, and you can ask us to delete your whole account. You have the right to see, correct, delete or export your data and to complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>
        </Card>
      </div>
    </Page>
  );
}
