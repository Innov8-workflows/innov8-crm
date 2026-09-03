// Turns a submission into the shape the build pipeline already understands.
//
// The output is deliberately the SAME contract that
// site-kit/engine/parse-onboarding.js emits with --json, extended with assets
// and a site.config.js draft. That parser has been feeding real builds, so
// matching it means nothing downstream has to change: this becomes the good
// path and the PDF parser becomes the fallback for the two legacy submissions.
//
// It keeps that parser's most important refusal too. `claims` is ALWAYS empty
// and insurance / accreditations / scheme / guarantee / years-trading go into
// `confirm[]` instead. A claim means Jay saw the certificate — site-kit's
// check.js blocks the words "insured", "NICEIC", "NAPIT", "Gas Safe" unless
// declared, and two live clients are on record as NOT insured. A client typing
// "yes" into a form is not evidence.
import { formFor, missingFor, missingLabel } from "@/lib/onboardingSchema";

export interface Phone { display: string; tel: string; wa: string }

/**
 * UK numbers, the three forms a site needs: what's printed, what tel: dials,
 * and what wa.me wants. Anything unrecognisable is passed through as display
 * only rather than guessed at — a wrong click-to-call number is worse than none.
 */
export function parsePhone(raw: string): Phone | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const digits = s.replace(/[^\d+]/g, "");
  let national = "";
  if (/^0\d{10}$/.test(digits)) national = digits.slice(1);            // 07944635771
  else if (/^\+44\d{10}$/.test(digits)) national = digits.slice(3);    // +447944635771
  else if (/^44\d{10}$/.test(digits)) national = digits.slice(2);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);        // 0800 numbers etc
  if (!national) return { display: s, tel: "", wa: "" };
  const display = national.startsWith("7")
    ? `0${national.slice(0, 4)} ${national.slice(4)}`
    : `0${national}`;
  return { display, tel: `+44${national}`, wa: `44${national}` };
}

const str = (a: Record<string, unknown>, k: string) => String(a[k] ?? "").trim();
/**
 * Split a "one per line" answer.
 *
 * Also splits on COMMAS, because people ignore the instruction and type
 * "Belper, Alfreton, Ripley, Kilburn" on one line — measured on the first real
 * submission through this form. Taken literally that becomes a single service
 * area named all four towns, and the build then generates one page titled that,
 * which is the exact "one long blob" failure the old Jotform had.
 *
 * Bullets and stray numbering go too, for the same reason: this is typed on a
 * phone by someone who is not thinking about how it will be parsed.
 */
const lines = (a: Record<string, unknown>, k: string) =>
  str(a, k)
    .split(/[\n,]/)
    .map((l) => l.trim().replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);

export interface ExportAsset {
  role: string; pair_id: string; path: string; filename: string;
  caption: string; bytes: number; content_type: string; url: string | null;
}

export function buildExport(
  submission: Record<string, unknown>,
  answers: Record<string, unknown>,
  assets: ExportAsset[],
) {
  // This builder is WEBSITE-shaped throughout — every field id below belongs to
  // the website questionnaire, and site_config_draft feeds the site-buildout
  // skill. A second form gets its own builder rather than a flag in here.
  const form = formFor("website");
  const biz = str(answers, "business_name");
  const phone = parsePhone(str(answers, "phone_mobile"));
  const shortName = biz.replace(/\b(Ltd|Limited|LTD|Ltd\.)\b/g, "").trim();

  const primaryAreas = lines(answers, "primary_areas");
  const primaryServices = lines(answers, "primary_services");

  // Nearby villages, asked once per primary area. Hand-researched for every
  // build before this existed — it's what makes an area page read as local.
  const nearby: Record<string, string[]> = {};
  primaryAreas.forEach((area, i) => {
    const v = lines(answers, `area_nearby__${i}`);
    if (v.length) nearby[area] = v;
  });
  const serviceDetail: Record<string, string> = {};
  primaryServices.forEach((svc, i) => {
    const v = str(answers, `service_detail__${i}`);
    if (v) serviceDetail[svc] = v;
  });

  const reviews: Record<string, string> = {};
  for (const [key, field] of [
    ["google", "google_review_url"], ["facebook", "facebook_review_url"],
    ["checkatrade", "checkatrade"], ["trustatrader", "trustatrader"],
    ["trustedtrader", "trustedtrader"], ["yell", "yell"],
    ["myjobquotes", "myjobquotes"], ["instagram", "instagram"],
  ] as const) {
    const v = str(answers, field);
    if (v) reviews[key] = v;
  }

  // Evidence, never a claim. Each one names whether a certificate came with it,
  // because that is the only thing that turns it into something publishable.
  const hasCert = assets.some((a) => a.role === "certificate");
  const confirm = Object.keys(answers)
    .filter((k) => form.fields[k]?.claimGated && str(answers, k))
    .map((k) => ({
      field: k,
      label: form.fields[k].label,
      value: str(answers, k),
      certificate_attached: hasCert,
      note: "Client's own words. Do not publish until the certificate has been seen.",
    }));

  const missing = missingFor(form, answers, assets.map((a) => a.role)).map(missingLabel);

  const counts = assets.reduce((acc, a) => { acc[a.role] = (acc[a.role] || 0) + 1; return acc; }, {} as Record<string, number>);

  return {
    id: Number(submission.id),
    business_name: biz || String(submission.business_name ?? ""),
    status: String(submission.status ?? ""),
    submitted_at: String(submission.submitted_at ?? ""),
    schema_version: String(submission.schema_version ?? ""),

    // --- the parse-onboarding.js --json contract -------------------------
    biz,
    owner: str(answers, "owner_name"),
    ownerShort: str(answers, "owner_short"),
    domain: str(answers, "preferred_domain"),
    addr: str(answers, "office_address"),
    email: str(answers, "email"),
    phone,
    landline: parsePhone(str(answers, "phone_landline")),
    whatsapp: parsePhone(str(answers, "whatsapp_number")) || phone,
    years: str(answers, "years_trading"),
    team: str(answers, "team_size"),
    story: str(answers, "owner_story"),
    tagline: str(answers, "tagline"),
    primaryServices,
    primaryAreas,
    secondaryServices: lines(answers, "secondary_services"),
    secondaryAreas: lines(answers, "secondary_areas"),
    reviews,
    gbp: str(answers, "google_business_profile"),
    confirm,
    missing,

    // --- what the old form never captured --------------------------------
    town: str(answers, "home_town"),
    county: str(answers, "county"),
    postcodeArea: str(answers, "postcode_area"),
    openingHours: str(answers, "opening_hours"),
    scheme: str(answers, "scheme_name"),
    schemeNumber: str(answers, "scheme_number"),
    nearby,
    serviceDetail,
    topServices: str(answers, "top_services"),
    customerQuestions: str(answers, "customer_questions"),
    usp: str(answers, "usp"),
    aboutTeam: str(answers, "about_team"),
    targetAudience: str(answers, "target_audience"),
    ratings: {
      google: { score: str(answers, "google_rating"), count: str(answers, "google_review_count") },
      facebook: { score: str(answers, "facebook_rating"), count: str(answers, "facebook_review_count") },
    },
    brand: {
      colours: str(answers, "brand_colours"),
      font: str(answers, "brand_font"),
      style: str(answers, "style_preference"),
      reference: str(answers, "style_reference"),
    },
    contactWidgets: Array.isArray(answers.contact_widgets) ? answers.contact_widgets : [],
    notes: str(answers, "additional_notes"),

    assets,
    asset_counts: counts,

    // --- a site.config.js draft the kit can take straight -----------------
    site_config_draft: {
      name: biz || "[PLACEHOLDER]",
      trade: "[SET THIS]",
      mode: "client",
      direction: null,
      origin: str(answers, "preferred_domain"),
      owner: str(answers, "owner_name"),
      email: str(answers, "email"),
      address: str(answers, "office_address"),
      services: primaryServices,
      servicesSecondary: lines(answers, "secondary_services"),
      areas: primaryAreas,
      areasSecondary: lines(answers, "secondary_areas"),
      reviews,
      // Never populated from a form. See the header of this file.
      claims: {},
      tokens: {
        BUSINESS: biz || "[PLACEHOLDER]",
        BUSINESS_SHORT: shortName || "[PLACEHOLDER]",
        // No looksLikeTown() guess any more: the form asks for the town outright.
        TOWN: str(answers, "home_town") || "[PLACEHOLDER]",
        PHONE: phone?.display || "[PLACEHOLDER]",
        PHONE_TEL: phone?.tel || "[PLACEHOLDER]",
        PHONE_WA: phone?.wa || "[PLACEHOLDER]",
      },
    },

    // For an agent deciding what still needs a human.
    sections: form.sections.map((s) => ({
      id: s.id,
      title: s.title,
      answered: s.fields.filter((f) => f.type !== "upload" && str(answers, f.id)).length,
      total: s.fields.filter((f) => f.type !== "upload").length,
    })),
  };
}

/**
 * The ad-creatives export. A sibling of buildExport, not a mode of it.
 *
 * buildExport emits the parse-onboarding.js contract — biz, primaryServices,
 * primaryAreas, site_config_draft — which exists to feed a website build. None
 * of that means anything for a set of ad creatives, and a flag inside one
 * function would have meant half the keys were dead on any given call.
 *
 * The keys that ARE shared are shared deliberately: fetch-onboarding.mjs reads
 * business_name, assets[], asset_counts, missing[] and confirm[] on every
 * submission it downloads, so both builders must emit all five.
 *
 * The grades are graded by ROLE PREFIX rather than a hard-coded list, so adding
 * another Grade B slot to the questionnaire needs no change here.
 */
export function buildMetaExport(
  submission: Record<string, unknown>,
  answers: Record<string, unknown>,
  assets: ExportAsset[],
) {
  const form = formFor("meta_ads");
  const phone = parsePhone(str(answers, "phone_mobile"));
  const whatsapp = parsePhone(str(answers, "whatsapp")) || phone;

  const counts = assets.reduce((acc, a) => {
    acc[a.role] = (acc[a.role] || 0) + 1; return acc;
  }, {} as Record<string, number>);
  const byGrade = (prefix: string) => assets.filter((a) => a.role.startsWith(prefix));

  return {
    id: Number(submission.id),
    kind: "meta_ads",
    business_name: str(answers, "business_name") || String(submission.business_name ?? ""),
    status: String(submission.status ?? ""),
    submitted_at: String(submission.submitted_at ?? ""),
    schema_version: String(submission.schema_version ?? ""),

    owner: str(answers, "owner_name"),
    email: str(answers, "email"),
    phone,
    whatsapp,
    website: str(answers, "website"),

    facebook: {
      has_page: str(answers, "fb_page_exists"),
      page: str(answers, "facebook_page"),
      instagram: str(answers, "instagram"),
      managed_by: str(answers, "page_manager"),
      ads_before: str(answers, "ads_before"),
      ads_experience: str(answers, "ads_experience"),
      ad_account: str(answers, "ad_account"),
    },

    offer: {
      hook: str(answers, "offer_hook"),
      wants: str(answers, "want_work"),
      avoids: str(answers, "avoid_work"),
      job_value: str(answers, "job_value"),
      busy_season: str(answers, "busy_season"),
      // Unverified by construction. Same rule as the website export: the client
      // saying it does not make it publishable, so it travels in confirm[] as
      // well and nothing downstream may promote it on its own.
      guarantee_unverified: str(answers, "guarantee"),
      must_not_claim: str(answers, "must_not_say"),
    },

    targeting: {
      towns: lines(answers, "target_towns"),
      radius: str(answers, "radius"),
      audience: lines(answers, "audience"),
      property_type: str(answers, "property_type"),
      exclude: lines(answers, "exclude_areas"),
    },

    leads: {
      destinations: lines(answers, "lead_destination"),
      mobile: str(answers, "lead_mobile") || str(answers, "phone_mobile"),
      email: str(answers, "lead_email") || str(answers, "email"),
      answered_by: str(answers, "who_answers"),
      response_time: str(answers, "response_time"),
      qualifying_questions: lines(answers, "qualifying_questions"),
      calendar: str(answers, "calendar_link"),
    },

    // Permission is its own top-level key, not buried in notes. It decides
    // whether a customer's face may appear in a paid advert at all.
    permission: {
      answer: str(answers, "permission"),
      notes: str(answers, "permission_notes"),
    },

    competitors: str(answers, "competitors"),
    notes: str(answers, "additional_notes"),

    grades: {
      a: byGrade("a_"),
      b: byGrade("b_"),
      c: byGrade("c_"),
    },

    confirm: form.claimGated
      .filter((k) => str(answers, k))
      .map((k) => ({
        field: k,
        label: form.fields[k].label,
        value: str(answers, k),
        certificate_attached: false,
        note: "Client's own words. Do not put it in an advert until it has been checked.",
      })),

    missing: missingFor(form, answers, assets.map((a) => a.role)).map(missingLabel),

    assets,
    asset_counts: counts,

    sections: form.sections.map((s) => ({
      id: s.id,
      title: s.title,
      answered: s.fields.filter((f) => f.type !== "upload" && str(answers, f.id)).length,
      total: s.fields.filter((f) => f.type !== "upload").length,
    })),
  };
}
