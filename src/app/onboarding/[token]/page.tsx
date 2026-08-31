import type { Metadata } from "next";
import OnboardingForm from "@/components/OnboardingForm";

// The public onboarding page. Reached only by a link Jay sends a signed client.
//
// The token is validated server-side inside /api/onboarding-public/state, not
// here: unknown, expired and revoked all have to produce ONE identical message,
// and doing that in a single place is how it stays that way. Confirming that a
// token merely expired would tell someone the token was real.

export const metadata: Metadata = {
  title: "Website onboarding · innov8 Workflows",
  description: "Tell us about your business so we can build your website.",
  // A client's half-filled form must never turn up in a search result.
  robots: { index: false, follow: false },
};

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OnboardingForm token={token} />;
}
