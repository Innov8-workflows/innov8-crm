// The shape of an onboarding questionnaire, and the helper that builds one.
//
// Split out from onboardingSchema.ts so that a form module can import these
// types without importing the registry that imports the form module back.
//
// A form is DATA. Everything downstream — the public form renderer, the CRM
// detail pane, the print view, the upload control plane — reads a FormSchema
// and never hard-codes a question. That is what makes a second questionnaire
// cheap: it is one more file in this folder, not a second pipeline.
//
// CLAIMS SAFETY, and why `claimGated` lives on the field rather than in a list
// somewhere: an answer marked claimGated must NEVER become a published claim on
// the client's say-so. site-kit's check.js blocks "insured", "NICEIC", "NAPIT",
// "Gas Safe" and the rest unless declared, and parse-onboarding.js refuses to
// write `claims` at all. A claim means Jay has seen the certificate. These
// fields route to a `confirm[]` list for him to tick off, never to claims{}.
// Two live clients are on record as NOT insured; nothing here may make it
// easier to say otherwise by accident.

export type FieldType =
  | "text" | "textarea" | "tel" | "email" | "url" | "number"
  | "radio" | "checkboxes" | "lines" | "hours" | "upload";

export interface UploadSpec {
  /** Where this lands in onboarding_assets.role. */
  role: string;
  min?: number;
  max: number;
  /** Ask the client for a one-line description of each file. */
  captions?: boolean;
  /** Before/after pairs are uploaded two at a time and stay linked. */
  paired?: boolean;
  accept: "image" | "video" | "document";
}

export interface Field {
  id: string;
  label: string;
  help?: string;
  placeholder?: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  upload?: UploadSpec;
  /** Only show when another field has this value. */
  showIf?: { field: string; equals: string };
  /** Answer is evidence for a claim, never a claim itself. */
  claimGated?: boolean;
  /** Repeat this question once per line the named field contains. */
  repeatOf?: string;
  maxLength?: number;
}

export interface Section {
  id: string;
  title: string;
  intro?: string;
  fields: Field[];
}

/** Per-submission ceilings, enforced server-side before a byte moves. */
export interface Quota {
  maxObjects: number;
  maxVideos: number;
  maxBytesPerObject: number;
  maxBytesPerSubmission: number;
}

/**
 * The handful of strings that differ between one questionnaire and the next.
 *
 * These were hard-coded in OnboardingForm/OnboardingStart while there was only
 * one form. Moving them here rather than branching on `kind` in the components
 * keeps the renderer genuinely form-agnostic — adding a third form should never
 * mean touching a component again.
 */
export interface FormCopy {
  /** Browser tab title, and the base for the share card. */
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  /**
   * Share-card image. WhatsApp and Facebook cache the preview per URL, so a
   * replacement card MUST get a new filename or the old thumbnail keeps
   * serving for weeks.
   */
  ogImage: string;
  ogAlt: string;
  /** Small-caps line above the card, shown until the business name is known. */
  eyebrow: string;
  /** The start page, where someone who isn't in the CRM yet begins. */
  startTitle: string;
  startIntro: string;
  /** The three reassurance points, as [heading, detail] pairs. */
  startPoints: [string, string][];
  /** Submit button: first time, and on every edit after that. */
  submit: string;
  submitAgain: string;
  /** The screen after they send it. */
  doneTitle: string;
  doneBody: string;
}

export type FormKind = "website" | "meta_ads";

export interface FormSchema {
  kind: FormKind;
  /**
   * Stamped onto every submission as `schema_version`, so an old submission
   * keeps rendering against the questions it was actually answered against.
   * Bump it when the questions change. It is a VERSION, never a discriminator —
   * `kind` is the discriminator, and it lives in its own column for exactly
   * that reason.
   */
  schemaId: string;
  /** Human name: the CRM tab, the notification email, the PDF header. */
  label: string;
  sections: Section[];
  /** Flat lookup, for validation and the API's field mapping. */
  fields: Record<string, Field>;
  required: string[];
  claimGated: string[];
  /**
   * Every onboarding_assets.role this form is allowed to write.
   *
   * Derived, not hand-listed, so it cannot drift from the upload fields. The
   * upload route checks against it: `role` arrives from the browser as a free
   * string, and without this a token for one form could write files under the
   * other form's roles, which the export would then quietly mis-read.
   */
  roles: string[];
  /**
   * The field ids worth putting in the alert email, in order.
   *
   * Per-form because the useful summary differs: for a website build it is the
   * town and the services; for ad creatives it is the offer and the towns being
   * targeted. Hard-coding one form's fields meant the other's email read
   * "Town: —, Services: —, Areas: —".
   */
  summaryFields: string[];
  quota: Quota;
  copy: FormCopy;
}

/**
 * Build a FormSchema from its sections, deriving everything that can be
 * derived. Nothing below is hand-maintained, so none of it can fall out of step
 * with the questions.
 */
export function defineForm(spec: {
  kind: FormKind;
  schemaId: string;
  label: string;
  sections: Section[];
  summaryFields: string[];
  quota: Quota;
  copy: FormCopy;
}): FormSchema {
  const all = spec.sections.flatMap((s) => s.fields);
  return {
    ...spec,
    fields: Object.fromEntries(all.map((f) => [f.id, f])),
    required: all.filter((f) => f.required).map((f) => f.id),
    claimGated: all.filter((f) => f.claimGated).map((f) => f.id),
    roles: [...new Set(all.filter((f) => f.upload).map((f) => f.upload!.role))],
  };
}
