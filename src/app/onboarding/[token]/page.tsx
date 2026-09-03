import type { Metadata } from "next";
import OnboardingForm from "@/components/OnboardingForm";
import { getClient, initDb, first } from "@/lib/db";
import { formFor } from "@/lib/onboardingSchema";

// The public onboarding page. Reached only by a link Jay sends a client.
//
// The token is validated server-side inside /api/onboarding-public/state, not
// here: unknown, expired and revoked all have to produce ONE identical message,
// and doing that in a single place is how it stays that way. Confirming that a
// token merely expired would tell someone the token was real.

/**
 * The share card has to match the form behind the token.
 *
 * This route serves both questionnaires, so a static export said "Website
 * onboarding" on every link — including an ad-creatives link WhatsApped to a
 * client, which is a poor first impression of a paid service.
 *
 * Looking the kind up costs one indexed read. It is wrapped because a page that
 * can still render "this link has expired" is far more use than one that 500s
 * when the database is briefly unreachable, and the website copy is the right
 * thing to fall back to: every token minted before the kind column existed is a
 * website one.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;
  let kind = "website";
  try {
    if (/^ob_[0-9a-f]{32}$/.test(token)) {
      await initDb();
      const row = first(await getClient().execute({
        sql: "SELECT kind FROM onboarding_submissions WHERE token = ? LIMIT 1",
        args: [token],
      }));
      if (row?.kind) kind = String(row.kind);
    }
  } catch { /* fall through to the website card */ }

  const copy = formFor(kind).copy;
  return {
    title: copy.title,
    description: copy.description,
    openGraph: {
      title: copy.ogTitle,
      description: copy.ogDescription,
      siteName: "Innov8 Workflows",
      type: "website",
      // Distinct filename: WhatsApp and Facebook cache the preview per URL, so a
      // replacement card MUST get a new name or the old thumbnail keeps serving
      // for weeks. Resolved to an absolute URL by metadataBase in the root layout
      // — scrapers do not follow relative paths.
      images: [{ url: copy.ogImage, width: 1200, height: 630, alt: copy.ogAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.ogTitle,
      description: copy.ogDescription,
      images: [copy.ogImage],
    },
    // A client's half-filled form must never turn up in a search result.
    robots: { index: false, follow: false },
  };
}

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OnboardingForm token={token} />;
}
