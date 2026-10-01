"use client";
import { useActionState } from "react";
import { addChildAction, type FormState } from "../actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

export function AddChildForm({ years }: { years: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addChildAction, {});
  return (
    <form action={action}>
      {state.errors?.form && <Alert tone="danger">{state.errors.form}</Alert>}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="First name" htmlFor="firstName">
          <Input id="firstName" name="firstName" autoComplete="off" maxLength={30} required defaultValue={state.values?.firstName} />
        </Field>
        <Field label="School year" htmlFor="year">
          <Select id="year" name="year" defaultValue="">
            <option value="">Choose…</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mb-3">
          <Button type="submit" disabled={pending} full>
            Add child
          </Button>
        </div>
      </div>
    </form>
  );
}
