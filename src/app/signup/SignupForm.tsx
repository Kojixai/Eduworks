"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type FormState } from "../actions";
import { Alert, Button, Card, Checkbox, Field, Input } from "@/components/ui";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, {});
  const e = state.errors ?? {};
  const v = state.values ?? {};
  return (
    <Card>
      <form action={action} noValidate>
        {e.form && <Alert tone="danger">{e.form}</Alert>}
        <Field label="Book code" htmlFor="code" error={e.code} hint="Printed inside the front cover of your book.">
          <Input id="code" name="code" defaultValue={v.code} autoCapitalize="characters" autoComplete="off" required />
        </Field>
        <Field label="Your name" htmlFor="parentName" error={e.parentName}>
          <Input id="parentName" name="parentName" defaultValue={v.parentName} autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="email" error={e.email}>
          <Input id="email" name="email" type="email" defaultValue={v.email} autoComplete="email" inputMode="email" required />
        </Field>
        <Field label="Amazon order number" htmlFor="amazonOrderNumber" error={e.amazonOrderNumber} hint="Format: 123-1234567-1234567. Find it in Your Orders on Amazon.">
          <Input id="amazonOrderNumber" name="amazonOrderNumber" defaultValue={v.amazonOrderNumber} inputMode="numeric" placeholder="123-1234567-1234567" required />
        </Field>
        <Field label="Password" htmlFor="password" error={e.password} hint="At least 8 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>

        <Checkbox
          name="acceptTerms"
          label={
            <>
              I agree to the <Link href="/terms">terms of use</Link> and have read the <Link href="/privacy">privacy notice</Link>.
            </>
          }
        />
        {e.acceptTerms && <p className="mb-2 text-sm text-danger">{e.acceptTerms}</p>}

        <div className="my-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-3">
          <Checkbox name="marketingOptIn" defaultChecked={false} label="Optional: email me about new practice books and free resources. You can unsubscribe at any time." />
        </div>

        <Button type="submit" full disabled={pending}>
          {pending ? "Creating your account…" : "Create account"}
        </Button>
        <p className="mt-3 text-center text-sm">
          Already have an account? <Link href="/login">Log in</Link>. Adding another book? Use the same email and password.
        </p>
      </form>
    </Card>
  );
}
