import type { Metadata } from "next";
import OnboardingStart from "@/components/OnboardingStart";

// The shared "anyone" link: onboarding.innov8workflows.co.uk/onboarding/start
//
// A static segment, so Next resolves it ahead of the [token] route alongside it.
// Tokens are always ob_<hex>, so there is no collision to worry about either way.

export const metadata: Metadata = {
  title: "Website onboarding · innov8 Workflows",
  description: "Tell us about your business so we can build your website.",
  openGraph: {
    title: "Website onboarding · Innov8 Workflows",
    description: "Tell us about your business and send us your photos — that's everything we need to build your website.",
    siteName: "Innov8 Workflows",
    type: "website",
    // Distinct filename: WhatsApp and Facebook cache the preview per URL, so a
    // replacement card MUST get a new name or the old thumbnail keeps serving
    // for weeks. Resolved to an absolute URL by metadataBase in the root layout
    // — scrapers do not follow relative paths.
    images: [{ url: "/og-onboarding.jpg", width: 1200, height: 630,
               alt: "Innov8 Workflows — Let's get your website started." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Website onboarding · Innov8 Workflows",
    description: "Tell us about your business and send us your photos.",
    images: ["/og-onboarding.jpg"],
  },
  robots: { index: false, follow: false },
};

export default function StartPage() {
  return <OnboardingStart />;
}
