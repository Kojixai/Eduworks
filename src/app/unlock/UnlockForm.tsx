"use client";
import { useActionState } from "react";
import { unlockAction, type FormState } from "../actions";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function UnlockForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(unlockAction, {});
  return (
    <Card>
      <form action={action}>
        {state.errors?.form && <Alert tone="danger">{state.errors.form}</Alert>}
        <input type="hidden" name="next" value={next} />
        <Field label="Parent PIN" htmlFor="pin" hint="Forgotten it? Log out and back in with your password.">
          <Input id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" autoFocus required className="max-w-[10rem] text-center text-2xl tracking-[0.4em]" />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Open parent area"}</Button>
      </form>
    </Card>
  );
}
