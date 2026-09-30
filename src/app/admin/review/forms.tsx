import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { QTYPES } from "@/lib/admin";
import { editQuestionAction, reviewQuestionAction } from "./actions";

export function ReviewButtons({ id, back, status }: { id: string; back: string; status: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "auto_ok" && (
        <form action={reviewQuestionAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit" aria-label="Approve question">Approve</Button>
        </form>
      )}
      {status !== "rejected" && (
        <form action={reviewQuestionAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="decision" value="reject" />
          <Button type="submit" variant="danger" aria-label="Reject question">Reject</Button>
        </form>
      )}
      {status !== "needs_review" && (
        <form action={reviewQuestionAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="decision" value="flag" />
          <Button type="submit" variant="secondary">Send to review queue</Button>
        </form>
      )}
    </div>
  );
}

export interface EditableQuestion {
  id: string;
  prompt_text: string;
  explanation: string | null;
  marks: number;
  qtype: string;
  review_notes: string | null;
}

export function QuestionEditForm({ q, answers, back }: { q: EditableQuestion; answers: string[]; back: string }) {
  const f = (k: string) => `${k}-${q.id}`;
  return (
    <form action={editQuestionAction} className="mt-2">
      <input type="hidden" name="id" value={q.id} />
      <input type="hidden" name="back" value={back} />
      <Field label="Prompt text" htmlFor={f("prompt")}>
        <textarea id={f("prompt")} name="prompt_text" defaultValue={q.prompt_text} required rows={4} className="block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2" />
      </Field>
      <Field label="Explanation" htmlFor={f("expl")}>
        <textarea id={f("expl")} name="explanation" defaultValue={q.explanation ?? ""} rows={3} className="block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Marks" htmlFor={f("marks")}>
          <Input id={f("marks")} name="marks" type="number" min={0} max={100} step={1} defaultValue={q.marks} required />
        </Field>
        <Field label="Type" htmlFor={f("qtype")}>
          <Select id={f("qtype")} name="qtype" defaultValue={q.qtype}>
            {QTYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Accepted answers" htmlFor={f("answers")} hint="One per line (main part). Leave unchanged to keep the existing answers.">
        <textarea id={f("answers")} name="answers" defaultValue={answers.join("\n")} rows={3} className="block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 font-mono text-sm" />
      </Field>
      <Field label="Review notes" htmlFor={f("notes")}>
        <textarea id={f("notes")} name="review_notes" defaultValue={q.review_notes ?? ""} rows={2} className="block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2" />
      </Field>
      <Button type="submit" variant="secondary">Save changes</Button>
    </form>
  );
}

export function Flash({ done }: { done?: string }) {
  if (!done) return null;
  const labels: Record<string, string> = {
    approved: "Question approved.",
    rejected: "Question rejected.",
    flagged: "Question sent to the review queue.",
    saved: "Changes saved.",
    "link-approved": "Statement link approved.",
    "link-rejected": "Statement link rejected.",
    "not-found": "That item no longer exists.",
    error: "Something went wrong.",
  };
  const isErr = done.startsWith("error") || done === "not-found";
  return (
    <div role="status">
      <Alert tone={isErr ? "danger" : "success"}>{labels[done] ?? done.replace(/^error: /, "")}</Alert>
    </div>
  );
}
