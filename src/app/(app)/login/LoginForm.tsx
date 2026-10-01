"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <Card>
      <form action={action}>
        {state.errors?.form && <Alert tone="danger">{state.errors.form}</Alert>}
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" full disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
        <p className="mt-3 text-center text-sm">
          New here? <Link href="/signup">Redeem your book code</Link>
        </p>
      </form>
    </Card>
  );
}
