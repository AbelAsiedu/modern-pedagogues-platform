"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/server/action-result";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "tel" | "number" | "select" | "textarea" | "checkbox" | "checkboxes";
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  options?: readonly { value: string; label: string }[];
  /** For "checkboxes", a comma-separated list of the option values that start ticked. */
  defaultValue?: string | number | boolean;
  rows?: number;
  list?: readonly string[];
};

function Submit({ label, tone = "primary" }: { label: string; tone?: "primary" | "danger" | "quiet" }) {
  const { pending } = useFormStatus();
  const cls =
    tone === "danger"
      ? "bg-red-700 text-white hover:bg-red-800"
      : tone === "quiet"
        ? "border border-navy/30 hover:border-navy"
        : "bg-navy text-cream hover:bg-navy/90";
  return (
    <button type="submit" disabled={pending} className={`rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 ${cls}`}>
      {pending ? "Working…" : label}
    </button>
  );
}

const inputCls = "mt-1 w-full rounded-lg border border-navy/25 bg-white px-3 py-2 text-base focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40";

/** Generic form bound to a server action. Shows field errors, a general error, and a success message. */
export function ActionForm({
  action,
  fields,
  submitLabel,
  hidden,
  tone,
  className,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  fields: readonly FieldSpec[];
  submitLabel: string;
  hidden?: Record<string, string>;
  tone?: "primary" | "danger" | "quiet";
  className?: string;
}) {
  // React clears uncontrolled inputs after every server action. Remember what was typed (never passwords)
  // so a failed attempt does not wipe the form, and clear it again after a success.
  const uid = useId();
  // Selects are remounted (key) when the remembered value changes: React ignores a changed defaultValue on a mounted <select>,
  // and its post-submit form reset would otherwise put the first choice back.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [state, formAction] = useActionState(async (prev: ActionState, form: FormData): Promise<ActionState> => {
    const snapshot: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "password") continue;
      if (f.type === "checkbox") {
        snapshot[f.name] = form.get(f.name) === "on" ? "on" : ""; // unchecked boxes are absent from FormData
        continue;
      }
      if (f.type === "checkboxes") {
        snapshot[f.name] = form.getAll(f.name).filter((x) => typeof x === "string").join(",");
        continue;
      }
      const v = form.get(f.name);
      if (typeof v === "string") snapshot[f.name] = v;
    }
    setTyped(snapshot);
    const result = await action(prev, form);
    if (result.ok) setTyped({});
    return result;
  }, {} as ActionState);
  return (
    <form action={formAction} className={className ?? "space-y-4"} noValidate={false}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => {
        const errs = state.fieldErrors?.[f.name];
        const id = `f${uid}-${f.name}`.replace(/:/g, "");
        return (
          <div key={f.name}>
            {f.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name={f.name} defaultChecked={f.name in typed ? typed[f.name] === "on" : Boolean(f.defaultValue)} /> {f.label}
              </label>
            ) : f.type === "checkboxes" ? (
              <fieldset>
                <legend className="text-sm font-medium">
                  {f.label}
                  {f.required ? <span aria-hidden> *</span> : null}
                </legend>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                  {(() => {
                    const ticked = new Set((f.name in typed ? typed[f.name]! : String(f.defaultValue ?? "")).split(",").filter(Boolean));
                    return f.options?.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name={f.name} value={o.value} defaultChecked={ticked.has(o.value)} /> {o.label}
                      </label>
                    ));
                  })()}
                </div>
              </fieldset>
            ) : (
              <>
                <label htmlFor={id} className="text-sm font-medium">
                  {f.label}
                  {f.required ? <span aria-hidden> *</span> : null}
                </label>
                {f.type === "select" ? (
                  <select key={typed[f.name] ?? ""} id={id} name={f.name} required={f.required} defaultValue={typed[f.name] ?? String(f.defaultValue ?? "")} className={inputCls}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea id={id} name={f.name} required={f.required} defaultValue={typed[f.name] ?? String(f.defaultValue ?? "")} rows={f.rows ?? 4} className={inputCls} />
                ) : (
                  <>
                    <input
                      id={id}
                      name={f.name}
                      type={f.type ?? "text"}
                      required={f.required}
                      autoComplete={f.autoComplete}
                      defaultValue={f.type === "password" ? undefined : (typed[f.name] ?? (f.defaultValue as string | number | undefined))}
                      list={f.list ? `${id}-list` : undefined}
                      aria-invalid={errs ? true : undefined}
                      aria-describedby={errs ? `${id}-err` : undefined}
                      className={inputCls}
                    />
                    {f.list ? (
                      <datalist id={`${id}-list`}>
                        {f.list.map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>
                    ) : null}
                  </>
                )}
              </>
            )}
            {f.hint ? <p className="mt-1 text-xs text-navy/70">{f.hint}</p> : null}
            {errs ? (
              <p id={`${id}-err`} className="mt-1 text-sm text-red-700" role="alert">
                {errs.join(" ")}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={submitLabel} tone={tone} />
        {state.error ? (
          <p role="alert" className="text-sm text-red-700">{state.error}</p>
        ) : null}
        {state.ok && state.message ? (
          <p role="status" className="text-sm text-green-800">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
