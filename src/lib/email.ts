// Outbound email via Resend's REST API.
//
// Structured after src/lib/geocode.ts (the only other hand-rolled third-party
// call): explicit timeout, and transient failures separated from permanent ones
// so the caller can retry the first and surface the second — a report that
// silently didn't send is worse than one that visibly failed.
//
// Raw fetch rather than the `resend` SDK: this is one authenticated POST, and
// adding a dependency would mean package.json + lockfile changes in both the
// source tree and the build clone plus an npm install there, for no gain.

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/** Retry-worthy: rate limits, provider 5xx, timeouts, network errors. */
export class TransientEmailError extends Error {}
/** Missing configuration — must never be mistaken for a successful send. */
export class EmailConfigError extends Error {}

export interface SendEmailInput {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult { id: string }

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey) throw new EmailConfigError("RESEND_API_KEY is not set in Vercel — no email was sent.");
  if (!from) throw new EmailConfigError("RESEND_FROM is not set in Vercel — no email was sent.");

  const payload: Record<string, unknown> = {
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  };
  if (input.text) payload.text = input.text;
  if (input.cc) payload.cc = input.cc.split(",").map((s) => s.trim()).filter(Boolean);
  const replyTo = input.replyTo || process.env.RESEND_REPLY_TO;
  if (replyTo) payload.reply_to = replyTo;

  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // AbortError (timeout) and TypeError (network) are both worth another go.
    throw new TransientEmailError(`Could not reach the email provider: ${String(err)}`);
  }

  if (res.status === 429 || res.status >= 500) {
    throw new TransientEmailError(`Email provider returned ${res.status} — worth retrying.`);
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Surface Resend's own message verbatim: the common failures here are
    // actionable ("The innov8workflows.co.uk domain is not verified").
    const message = (body as { message?: string })?.message || `Email provider returned ${res.status}`;
    throw new Error(message);
  }

  return { id: String((body as { id?: string })?.id || "") };
}

/** One retry on transient failures, then give up and let the caller report it. */
export async function sendEmailWithRetry(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    return await sendEmail(input);
  } catch (err) {
    if (!(err instanceof TransientEmailError)) throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return await sendEmail(input);
  }
}
