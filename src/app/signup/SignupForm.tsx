"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signupAction, type FormState } from "../actions";
import { Alert, Button, Card, Checkbox, Field, Input } from "@/components/ui";
import { MAILING_WORDING, ORDER_WHY } from "@/practice/config-public";

export function SignupForm({ years, orderMode }: { years: { id: string; name: string }[]; orderMode: "optional" | "required" | "off" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, {});
  const [kind, setKind] = useState<"parent" | "student">("parent");
  const e = state.errors ?? {};
  const v = state.values ?? {};
  const student = kind === "student";
  return (
    <Card>
      <form action={action} noValidate>
        {e.form && <Alert tone="danger">{e.form}</Alert>}
        <fieldset className="mb-4 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">Who is making this account?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["parent", "A parent, guardian or teacher", "Children get their own profile inside your account."], ["student", "A student aged 13 or over", "For KS3 and GCSE books only."]] as const).map(([k, t, d]) => (
              <label key={k} className={`flex min-h-[56px] cursor-pointer gap-3 rounded-[var(--radius-md)] border p-3 text-sm ${kind === k ? "border-primary bg-primary-soft" : "border-border"}`}>
                <input type="radio" name="accountType" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-1 h-5 w-5 accent-[var(--color-primary)]" />
                <span><span className="block font-medium">{t}</span><span className="text-muted">{d}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Book code" htmlFor="code" error={e.code} hint="Printed on the page inside the front cover of your book.">
          <Input id="code" name="code" defaultValue={v.code} autoCapitalize="characters" autoComplete="off" required />
        </Field>
        <Field label={student ? "Your first name" : "Your name"} htmlFor="parentName" error={e.parentName}>
          <Input id="parentName" name="parentName" defaultValue={v.parentName} autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="email" error={e.email}>
          <Input id="email" name="email" type="email" defaultValue={v.email} autoComplete="email" inputMode="email" required />
        </Field>
        {student && (
          <Field label="Your year group" htmlFor="yearGroupId" error={e.yearGroupId}>
            <select id="yearGroupId" name="yearGroupId" defaultValue={v.yearGroupId ?? ""} className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-border bg-surface px-3">
              <option value="">Choose…</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>
        )}
        {orderMode !== "off" && (
          <Field label={orderMode === "required" ? "Amazon order number" : "Amazon order number (optional)"} htmlFor="orderNumber" error={e.orderNumber} hint="Looks like 203-1234567-1234567. Find it in Your Orders on Amazon.">
            <Input id="orderNumber" name="orderNumber" defaultValue={v.orderNumber} inputMode="numeric" placeholder="203-1234567-1234567" />
            <details className="mt-1 text-sm"><summary className="flex min-h-[44px] cursor-pointer items-center text-primary">Why do we ask for this?</summary><p className="mt-1 text-muted">{ORDER_WHY}</p></details>
          </Field>
        )}
        <Field label="Password" htmlFor="password" error={e.password} hint="At least 8 characters. Already have an account? Use its password to add this book.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>

        <Checkbox name="ageConfirmed" label={student ? "I am 13 or over." : "I am 18 or over and I am the parent, guardian or teacher."} />
        {e.ageConfirmed && <p className="mb-2 text-sm text-danger">{e.ageConfirmed}</p>}
        <Checkbox
          name="acceptTerms"
          label={<>I agree to the <Link href="/terms">terms of use</Link> and have read the <Link href="/privacy">privacy notice</Link>.</>}
        />
        {e.acceptTerms && <p className="mb-2 text-sm text-danger">{e.acceptTerms}</p>}

        {!student && (
          <div className="my-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-3">
            <Checkbox name="marketingOptIn" defaultChecked={false} label={`Optional: ${MAILING_WORDING}`} />
          </div>
        )}

        <Button type="submit" full disabled={pending}>{pending ? "Unlocking your book…" : "Unlock my book"}</Button>
        <p className="mt-3 text-center text-sm">Already have an account? <Link href="/login">Log in</Link>.</p>
      </form>
    </Card>
  );
}
