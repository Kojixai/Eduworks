"use client";
import { useActionState } from "react";
import { deleteAccountAction, setPinAction, type FormState } from "../actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [s, action, pending] = useActionState<FormState, FormData>(setPinAction, {});
  return (
    <form action={action}>
      {s.errors?.form && <Alert tone="danger">{s.errors.form}</Alert>}
      {s.values?.saved && <Alert tone="success">PIN saved.</Alert>}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={hasPin ? "New PIN" : "Choose a PIN"} htmlFor="pin"><Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={4} autoComplete="off" required /></Field>
        <Field label="Again" htmlFor="again"><Input id="again" name="again" type="password" inputMode="numeric" maxLength={4} autoComplete="off" required /></Field>
      </div>
      <Button variant="secondary" type="submit" disabled={pending}>{hasPin ? "Change PIN" : "Save PIN"}</Button>
    </form>
  );
}

export function DeleteForm() {
  const [s, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, {});
  return (
    <form action={action}>
      {s.errors?.form && <Alert tone="danger">{s.errors.form}</Alert>}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Your password" htmlFor="del-pw"><Input id="del-pw" name="password" type="password" autoComplete="current-password" required /></Field>
        <Field label="Type DELETE to confirm" htmlFor="del-confirm"><Input id="del-confirm" name="confirm" autoComplete="off" required /></Field>
      </div>
      <Button variant="danger" type="submit" disabled={pending}>Delete my account</Button>
    </form>
  );
}
