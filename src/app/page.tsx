import { redirect } from "next/navigation";
import { currentParent } from "@/lib/auth";
import { ButtonLink, Card, Grid, Page } from "@/components/ui";

export default async function Landing() {
  if (await currentParent()) redirect("/home");
  return (
    <Page narrow>
      <div className="py-6">
        <h1 className="text-[length:var(--font-size-2xl)] font-semibold leading-tight">The free online companion to your practice book</h1>
        <p className="mt-3 text-muted">
          Lessons, quizzes, timed practice papers, a phonics check practice and a times tables check, all matched to the National Curriculum for Key Stages 1 to 4.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/signup">Redeem your book code</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Log in
          </ButtonLink>
        </div>
      </div>
      <Grid>
        <Card title="For parents">
          <p className="text-sm text-muted">One account for the family. Add each child by first name only, and see their scores by topic, weak areas and history.</p>
        </Card>
        <Card title="Built on open curriculum data">
          <p className="text-sm text-muted">Lesson content from Oak National Academy and assessment formats from the Standards and Testing Agency, used under the Open Government Licence.</p>
        </Card>
        <Card title="Safe by design">
          <p className="text-sm text-muted">No adverts, no chat, no third-party trackers. Children never need an email address.</p>
        </Card>
        <Card title="Where is my code?">
          <p className="text-sm text-muted">Your code is printed inside the front cover of your book. You will also need your Amazon order number.</p>
        </Card>
      </Grid>
    </Page>
  );
}
