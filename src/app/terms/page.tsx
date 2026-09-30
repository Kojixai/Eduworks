import { Card, Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <Page narrow>
      <PageHeader title="Terms of use" />
      <div className="grid gap-3 text-sm">
        <Card title="The service">
          <p>This free website accompanies our printed practice books. A parent or carer creates the account with the code in their book and manages access for their children. Children should use the site with a grown-up&apos;s permission.</p>
        </Card>
        <Card title="Your account">
          <p>Keep your password private. One account can hold several books and several children. Please don&apos;t share book codes publicly.</p>
        </Card>
        <Card title="Content and licences">
          <p>
            Some content comes from Oak National Academy and the Standards and Testing Agency and is used under the Open Government Licence v3.0. See the Credits and licences page for attribution. Practice questions marked &ldquo;original&rdquo; were written for this site. Past-paper scores are for practice only and are not official results.
          </p>
        </Card>
        <Card title="Changes and availability">
          <p>We may update the site and these terms. We aim to keep the service available but can&apos;t guarantee it will always be uninterrupted.</p>
        </Card>
      </div>
    </Page>
  );
}
