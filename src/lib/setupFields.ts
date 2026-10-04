// The nine setup milestones tracked per client — the green pills on the Projects
// and Live Clients cards. Shared by the pills themselves, the Outstanding view
// (which lists every unticked one) and the Claude task route (which can tick
// them), so the three can never disagree about what the milestones are.
//
// Deliberately free of server imports: SetupPills is a client component and
// imports this directly.
//
// "Business Profile" rather than "GBP" so the label doesn't clash with the £
// figures on the cards.

export const SETUP_ITEMS = [
  { field: "ga4_embedded", label: "GA4", title: "Google Analytics 4 embedded" },
  { field: "ga4_conversions", label: "GA4 Conversions", title: "GA4 conversion events / key events configured" },
  { field: "search_console_verified", label: "Search Console", title: "Google Search Console verified" },
  { field: "bing_console", label: "Bing Console", title: "Bing Webmaster Tools verified" },
  { field: "gbp_setup", label: "Business Profile", title: "Google Business Profile set up" },
  { field: "mobile_optimised", label: "Mobile", title: "Site is mobile-optimised" },
  { field: "link_card", label: "Link card", title: "Social link-preview (Open Graph) card set up" },
  { field: "secure_file", label: "Secure File", title: "Secure file / login details stored" },
  { field: "google_sheet", label: "Google Sheet", title: "Lead-logging Google Sheet connected (form/call leads land in the sheet)" },
  { field: "ghl_setup", label: "GHL", title: "Set up on GoHighLevel (the Business Growth Package CRM, automations and app)" },
] as const;

export type SetupField = (typeof SETUP_ITEMS)[number]["field"];
export const SETUP_FIELDS: readonly string[] = SETUP_ITEMS.map((i) => i.field);
export const isSetupField = (f: string): f is SetupField => SETUP_FIELDS.includes(f);

/**
 * Pills that only apply to SOME clients, so an unticked one is not "outstanding".
 * GHL is for Business Growth Package clients only; counting it as a gap would put
 * a "GHL not done" line on every website-only client.
 */
export const NOT_A_GAP: ReadonlySet<string> = new Set(["ghl_setup"]);
