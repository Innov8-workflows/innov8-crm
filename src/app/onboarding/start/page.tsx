import type { Metadata } from "next";
import OnboardingStart from "@/components/OnboardingStart";

// The shared "anyone" link: onboarding.innov8workflows.co.uk/onboarding/start
//
// A static segment, so Next resolves it ahead of the [token] route alongside it.
// Tokens are always ob_<hex>, so there is no collision to worry about either way.

export const metadata: Metadata = {
  title: "Website onboarding · innov8 Workflows",
  description: "Tell us about your business so we can build your website.",
  robots: { index: false, follow: false },
};

export default function StartPage() {
  return <OnboardingStart />;
}
