// The registry of onboarding questionnaires.
//
// This file used to BE the questionnaire — one `SECTIONS` array with `FIELDS`,
// `REQUIRED` and `CLAIM_GATED` derived from it as flat module constants. That
// worked while there was exactly one form. It stops working the moment there is
// a second, because a flat `REQUIRED` means a Meta Ad Creatives submission gets
// its "what's still missing" list computed from the WEBSITE form's required
// fields — wrong, and silently so.
//
// So the questions moved into ./forms/, and this file resolves which set to use.
//
// THE FLAT EXPORTS WERE DELETED RATHER THAN KEPT AS ALIASES. That is the whole
// point: a call site still reaching for a global `REQUIRED` would compile, run,
// and quietly produce nonsense for one of the two forms. Removing them made the
// compiler name every place that had to be revisited.
//
// Everything a form needs to describe itself lives in ./forms/types.ts, which is
// re-exported here so `@/lib/onboardingSchema` stays the one import path.

import type { FormSchema } from "./forms/types";
import { websiteForm } from "./forms/website";
import { metaAdsForm } from "./forms/metaAds";

export * from "./forms/types";

/**
 * Every questionnaire, keyed by the value stored in
 * `onboarding_submissions.kind`.
 *
 * Deliberately typed as a plain lookup rather than `Record<FormKind, ...>`: the
 * key arriving from the database or a query string is an arbitrary string, and
 * pretending otherwise just moves the cast somewhere less honest.
 */
export const FORMS: Record<string, FormSchema> = {
  [websiteForm.kind]: websiteForm,
  [metaAdsForm.kind]: metaAdsForm,
};

/**
 * The questionnaire a submission was answered against.
 *
 * Falls back to the website form for an unknown kind. That is the safe
 * direction: every submission that existed before the `kind` column did is a
 * website one, and a row whose kind somehow got mangled should render the form
 * it almost certainly is rather than crash the CRM.
 */
export function formFor(kind: string | null | undefined): FormSchema {
  return FORMS[String(kind || "")] || websiteForm;
}

export interface MissingItem {
  id: string;
  label: string;
  /** Files present for an upload field. 0 for a text answer. */
  have: number;
  /** The minimum this field asks for. 1 for a text answer. */
  need: number;
}

/**
 * What a submission still owes, judged against its own form.
 *
 * COUNTS uploads rather than merely detecting one. The old check was
 * `assets.some(a => a.role === role)`, so a field asking for a minimum of 20
 * photos reported "nothing missing" the moment a single file landed. That is
 * precisely the failure this whole system was built to end: S. Sparham's build
 * needed 27 gallery photos and the old form delivered one, and a "nothing
 * missing" verdict on one photo would have hidden it all over again.
 *
 * Because the minimum lives in the schema, honouring it here means a second
 * form's thresholds — how many pieces of Grade A video, how many Grade B
 * photos — need no separate machinery. They are just `min` on an upload field.
 *
 * `storedRoles` is every stored asset's role, WITH repeats: it is the repeats
 * that carry the count.
 */
export function missingFor(
  form: FormSchema,
  answers: Record<string, unknown>,
  storedRoles: string[],
): MissingItem[] {
  const counts: Record<string, number> = {};
  for (const r of storedRoles) counts[r] = (counts[r] || 0) + 1;

  const out: MissingItem[] = [];
  for (const fid of form.required) {
    const f = form.fields[fid];
    if (!f) continue;
    if (f.type === "upload") {
      const have = counts[f.upload!.role] || 0;
      const need = Math.max(1, f.upload!.min || 1);
      if (have < need) out.push({ id: fid, label: f.label, have, need });
    } else if (String(answers[fid] ?? "").trim() === "") {
      out.push({ id: fid, label: f.label, have: 0, need: 1 });
    }
  }
  return out;
}

/** "Photos of your best work" or "Photos of your best work (3 of 20)". */
export function missingLabel(m: MissingItem): string {
  return m.need > 1 ? `${m.label} (${m.have} of ${m.need})` : m.label;
}
