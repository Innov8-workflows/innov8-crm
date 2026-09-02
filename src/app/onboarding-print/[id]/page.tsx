import OnboardingPrint from "@/components/OnboardingPrint";

// Print view for one submission, opened from the CRM's Onboarding section.
//
// The path is a SIBLING of the public /onboarding/ route, not a child.
// PUBLIC_PATHS is matched with startsWith, so anything under /onboarding/ is
// served to the world — a client's answers and photos must not be. As
// /onboarding-print/... it falls through to the session check like the rest of
// the CRM. ("/onboarding-print/5".startsWith("/onboarding/") is false.)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OnboardingPrint id={id} />;
}
