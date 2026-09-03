import type { Metadata } from "next";
import OnboardingStart from "@/components/OnboardingStart";
import { FORMS } from "@/lib/onboardingSchema";

// The shared "anyone" link for Meta ad creatives:
// crm.innov8workflows.co.uk/onboarding/ads
//
// A static segment, so Next resolves it ahead of the [token] route alongside it
// — exactly as /onboarding/start already does. Tokens are always ob_<hex>, so
// there is no collision either way.
//
// It sits UNDER /onboarding/ deliberately: PUBLIC_PATHS carries "/onboarding/"
// with a trailing slash and is matched with startsWith, so this page is public
// for free. A sibling named /onboarding-ads would NOT match and would bounce
// every client to the login screen.
//
// /onboarding/start keeps its name. That URL is already out with clients and
// has a link card built for it.

const copy = FORMS.meta_ads.copy;

export const metadata: Metadata = {
  title: copy.title,
  description: copy.description,
  openGraph: {
    title: copy.ogTitle,
    description: copy.ogDescription,
    siteName: "Innov8 Workflows",
    type: "website",
    images: [{ url: copy.ogImage, width: 1200, height: 630, alt: copy.ogAlt }],
  },
  twitter: {
    card: "summary_large_image",
    title: copy.ogTitle,
    description: copy.ogDescription,
    images: [copy.ogImage],
  },
  robots: { index: false, follow: false },
};

export default function AdsStartPage() {
  return <OnboardingStart kind="meta_ads" />;
}
