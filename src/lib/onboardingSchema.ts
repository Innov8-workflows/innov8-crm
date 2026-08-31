// The client onboarding questionnaire, as data.
//
// Replaces two forms Jay was running in parallel — a Tally
// (tally.so/r/PdypWe) and a Jotform (jotform.com/form/260881765182061). This is
// the union of both plus the fields that kept getting chased by hand afterwards.
//
// WHY IT MOVED IN-HOUSE. Three defects were structural, not settings:
//   1. Uploads were effectively single-file and capped at 10MB. S. Sparham's own
//      closing note reads "I have loads of pictures but could only seem to upload
//      one on here" — that build needed 27 gallery photos and the form delivered
//      one. Everything else arrived out-of-band.
//   2. The PDF export clipped long answers to the visible box width, so review
//      URLs came back truncated ("...facebook.com/redlineroofin") and unusable.
//   3. A tick box extracted as BOTH "A Yes" and "B No", making the insurance
//      answer genuinely unknowable.
// Structured answers plus direct-to-R2 uploads remove all three by construction.
//
// NEITHER OLD FORM ASKED FOR VIDEO, yet every build uses a hero loop, a
// transformation clip and a CTA clip. That is why they were always chased later.
//
// CLAIMS SAFETY. `claimGated: true` marks an answer that must NEVER become a
// site claim on the client's say-so. site-kit's check.js blocks the words
// "insured", "NICEIC", "NAPIT", "Gas Safe" etc. unless declared, and
// parse-onboarding.js refuses to write `claims` at all. A claim means Jay saw
// the certificate. These fields route to a `confirm[]` list, never to claims{}.
//
// Bump SCHEMA_ID when questions change. Every submission records the version it
// was answered against, so old submissions keep rendering.

export const SCHEMA_ID = "2026-08-31";

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

export const SECTIONS: Section[] = [
  {
    id: "business",
    title: "Your business",
    intro: "The basics. Two minutes.",
    fields: [
      { id: "business_name", label: "Business name", type: "text", required: true, maxLength: 120 },
      { id: "legal_name", label: "Registered company name, if different",
        help: "Only if it differs from your trading name — it goes in the footer.", type: "text" },
      { id: "owner_name", label: "Owner's full name", type: "text", required: true },
      { id: "owner_short", label: "What should we call you on the site?",
        // Examples on a client-facing page must never be a real client. Both of
        // these named one, which is a data-protection problem as much as a
        // tasteless one.
        help: "First name is usually best — it reads better in a sentence than your full name.",
        placeholder: "e.g. Dave", type: "text" },
      { id: "years_trading", label: "Years in business", type: "number", claimGated: true,
        help: "We only put this on the site once it's confirmed." },
      { id: "team_size", label: "Number of employees / team size", type: "text" },
      { id: "tagline", label: "Any tagline or slogan you use", type: "text", maxLength: 120 },
      { id: "current_website", label: "Current website", help: "Leave blank if you haven't got one.", type: "url" },
      { id: "preferred_domain", label: "Preferred website address", type: "text", required: true,
        placeholder: "yourbusiness.co.uk" },
    ],
  },
  {
    id: "contact",
    title: "How customers reach you",
    fields: [
      { id: "phone_mobile", label: "Main phone number", type: "tel", required: true,
        help: "This becomes the click-to-call button on every page.", placeholder: "07700 900000" },
      { id: "phone_landline", label: "Landline / office number", type: "tel" },
      { id: "whatsapp_number", label: "WhatsApp number, if different from above", type: "tel" },
      { id: "email", label: "Business email address", type: "email", required: true },
      { id: "office_address", label: "Business address", type: "textarea",
        help: "Used for your Google listing and the footer. Say if you'd rather it wasn't shown publicly." },
      { id: "opening_hours", label: "Opening hours", type: "hours",
        help: "Customers ask, and Google uses it. \"24 hours\" and \"emergency call-out\" are fine answers." },
      { id: "contact_widgets", label: "How would you like enquiries to come in?", type: "checkboxes",
        options: [
          "Click-to-call button",
          "WhatsApp button",
          "Contact form that emails me",
          "Contact form that opens WhatsApp (better if you don't check email often)",
        ] },
    ],
  },
  {
    id: "areas",
    title: "Where you work",
    intro: "This drives a page per area, so it's worth being specific.",
    fields: [
      { id: "home_town", label: "Which town are you based in?", type: "text", required: true,
        help: "Your main town — it appears in headings across the site." },
      { id: "county", label: "County", type: "text" },
      { id: "postcode_area", label: "Postcode area", placeholder: "DE5", type: "text" },
      { id: "primary_areas", label: "Main areas you cover", type: "lines", required: true,
        help: "One town or city per line. These are the ones we'll target hardest." },
      { id: "area_nearby", label: "Villages and suburbs near {{line}}", type: "lines", repeatOf: "primary_areas",
        help: "Five or six nearby places. This is the single most useful thing you can give us — it's what makes an area page read as genuinely local rather than generic." },
      { id: "secondary_areas", label: "Other areas you'll travel to", type: "lines",
        help: "One per line. Broader coverage, lighter targeting." },
    ],
  },
  {
    id: "services",
    title: "What you do",
    fields: [
      { id: "primary_services", label: "Your main services", type: "lines", required: true,
        help: "One per line. Each one gets its own page." },
      { id: "top_services", label: "Which three make you the most money?", type: "text",
        help: "We'll put these front and centre rather than burying them in a list." },
      { id: "secondary_services", label: "Other things you do", type: "lines" },
      { id: "service_detail", label: "About \"{{line}}\"", type: "textarea", repeatOf: "primary_services",
        help: "Roughly how long a typical job takes, what tells a customer they need it, and a rough price range if you're happy to publish one. A sentence or two each is plenty." },
      { id: "customer_questions", label: "What do customers ask you most?", type: "textarea",
        help: "Ten or fifteen real questions, however roughly written. These become the FAQ section, which is a large part of how you get found — and it's much better in your words than ours." },
    ],
  },
  {
    id: "proof",
    title: "Credentials and reviews",
    intro: "We only publish what can be evidenced. Anything without proof stays off the site — a claim you can't back up is worse than no claim.",
    fields: [
      { id: "insured", label: "Do you hold public liability insurance?", type: "radio",
        options: ["Yes", "No"], claimGated: true },
      { id: "public_liability_amount", label: "Cover amount", placeholder: "£1,000,000",
        type: "text", showIf: { field: "insured", equals: "Yes" }, claimGated: true },
      { id: "insurance_certificate", label: "Insurance certificate", type: "upload",
        showIf: { field: "insured", equals: "Yes" }, claimGated: true,
        help: "A photo or PDF is fine. Without this we can't say you're insured anywhere on the site.",
        upload: { role: "certificate", max: 5, accept: "document" } },
      { id: "accreditations", label: "Accreditations and qualifications", type: "lines", claimGated: true,
        help: "One per line." },
      { id: "scheme_name", label: "Competent person scheme", type: "text", claimGated: true,
        help: "NICEIC, NAPIT, Gas Safe, TrustMark and so on — whichever applies." },
      { id: "scheme_number", label: "Your registration number", type: "text", claimGated: true },
      { id: "accreditation_certificates", label: "Certificates for the above", type: "upload", claimGated: true,
        upload: { role: "certificate", max: 10, accept: "document" } },
      { id: "guarantee", label: "Any guarantee you offer", placeholder: "12 months on all workmanship",
        type: "text", claimGated: true, help: "Only put down something you'd genuinely honour." },
      { id: "google_rating", label: "Google star rating", type: "text", placeholder: "4.9" },
      { id: "google_review_count", label: "How many Google reviews", type: "number" },
      { id: "facebook_rating", label: "Facebook rating", type: "text" },
      { id: "facebook_review_count", label: "How many Facebook reviews", type: "number" },
      { id: "google_business_profile", label: "Google Business Profile link", type: "url" },
      { id: "google_review_url", label: "Google reviews link", type: "url" },
      { id: "facebook_page", label: "Facebook page", type: "url" },
      { id: "facebook_review_url", label: "Facebook reviews link", type: "url" },
      { id: "instagram", label: "Instagram", type: "url" },
      { id: "checkatrade", label: "Checkatrade", type: "url" },
      { id: "trustatrader", label: "TrustATrader", type: "url" },
      { id: "trustedtrader", label: "TrustedTrader", type: "url" },
      { id: "yell", label: "Yell", type: "url" },
      { id: "myjobquotes", label: "MyJobQuotes", type: "url" },
      { id: "other_social", label: "Anything else", type: "textarea",
        help: "Other profiles, memberships, Trading Standards, Which? and so on." },
    ],
  },
  {
    id: "story",
    title: "Your story",
    intro: "Written in your own words, however rough. We'll tidy it — we won't invent it.",
    fields: [
      { id: "owner_story", label: "How the business started", type: "textarea",
        help: "How you got into the trade, why you set up on your own. A paragraph is plenty." },
      { id: "about_team", label: "About you and the team", type: "textarea" },
      { id: "usp", label: "What makes you different from the others?", type: "textarea", required: true,
        help: "The honest answer, not the polished one. What do customers say when they're pleased?" },
      { id: "target_audience", label: "Who are your best customers?", type: "textarea",
        help: "Homeowners, landlords, builders, commercial? The work you'd like more of." },
    ],
  },
  {
    id: "media",
    title: "Photos and video",
    intro:
      "This is the part that matters most — good photos are the difference between a site that looks like your work " +
      "and one that looks like stock imagery. " +
      "Send as many as you like, straight off your phone, and please don't compress or resize them first. " +
      "Big videos are fine too. If your signal drops, come back to this page and carry on where you left off.",
    fields: [
      { id: "logo", label: "Your logo", type: "upload", required: true,
        help: "The best quality version you have. If you've got the original design file, that's ideal.",
        upload: { role: "logo", max: 5, accept: "image" } },
      { id: "gallery", label: "Photos of your best work", type: "upload", required: true,
        help: "Twenty to thirty is the sweet spot. Finished jobs, wide shots and close-ups, the ones you're proud of.",
        upload: { role: "gallery", min: 20, max: 60, captions: true, accept: "image" } },
      { id: "hero", label: "Three standout shots", type: "upload",
        help: "Your three best finished jobs — these go across the top of the site, so pick the ones that stop someone scrolling.",
        upload: { role: "hero", min: 3, max: 6, captions: true, accept: "image" } },
      { id: "areas_shot", label: "One wide shot of a finished job", type: "upload",
        help: "Different from the three above. It sits behind the areas-covered section, and reusing one of the others in the same scroll makes it look like you only had a handful of photos.",
        upload: { role: "areas", max: 3, captions: true, accept: "image" } },
      { id: "before_after", label: "Before-and-after pairs", type: "upload",
        help: "Two or more pairs. Take the 'after' from the SAME SPOT you took the 'before' — matching angles is what makes the slider effect work, and it's the single most persuasive thing on a trade website.",
        upload: { role: "before_after", min: 4, max: 20, paired: true, captions: true, accept: "image" } },
      { id: "about_photos", label: "Photos of you or the team", type: "upload",
        help: "Two is plenty. On site and working beats posed.",
        upload: { role: "about", max: 6, captions: true, accept: "image" } },
      { id: "team_van", label: "Vans, signage or branded kit", type: "upload",
        upload: { role: "about", max: 6, captions: true, accept: "image" } },
      { id: "video_hero", label: "A short clip of a finished job", type: "upload",
        help: "Ten to twenty seconds, filmed slowly. A walk-around, or a pan across a finished roof or driveway. Send the original — don't send it through WhatsApp first, it wrecks the quality.",
        upload: { role: "video", max: 2, accept: "video" } },
      { id: "video_transformation", label: "A before-and-after clip", type: "upload",
        help: "Filmed the same way, before and after. Optional, but it's usually the best thing on the whole site.",
        upload: { role: "video", max: 2, accept: "video" } },
      { id: "video_extra", label: "Anything else worth filming", type: "upload",
        upload: { role: "video", max: 3, accept: "video" } },
    ],
  },
  {
    id: "look",
    title: "Look and feel",
    intro: "All optional — we can take this from your logo.",
    fields: [
      { id: "brand_colours", label: "Brand colours", type: "text",
        help: "If you know them. Otherwise we'll pull them out of your logo." },
      { id: "brand_font", label: "Brand font", type: "text" },
      { id: "style_preference", label: "Which sounds most like you?", type: "radio",
        options: ["Match my logo", "Clean and professional", "Bold and dark", "Bright and modern", "Not fussed"] },
      { id: "style_reference", label: "A site you like the look of", type: "url",
        help: "Doesn't have to be in your trade — just something that feels right." },
    ],
  },
  {
    id: "extra",
    title: "Anything else",
    fields: [
      { id: "additional_notes", label: "Anything we haven't asked about", type: "textarea",
        help: "Things you want on the site, things you'd rather we left off, jobs coming up worth photographing." },
    ],
  },
];

/** Flat lookup, for validation and for the API's field mapping. */
export const FIELDS: Record<string, Field> = Object.fromEntries(
  SECTIONS.flatMap((s) => s.fields.map((f) => [f.id, f])),
);

/** Every field whose answer is evidence for a claim, never a claim itself. */
export const CLAIM_GATED: string[] = SECTIONS
  .flatMap((s) => s.fields)
  .filter((f) => f.claimGated)
  .map((f) => f.id);

export const REQUIRED: string[] = SECTIONS
  .flatMap((s) => s.fields)
  .filter((f) => f.required)
  .map((f) => f.id);

/** Per-submission ceilings, enforced server-side before a byte moves. */
export const QUOTA = {
  maxObjects: 120,
  maxVideos: 6,
  maxBytesPerObject: 2 * 1024 * 1024 * 1024,
  maxBytesPerSubmission: 6 * 1024 * 1024 * 1024,
};
