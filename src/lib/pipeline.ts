import type { Client } from "@libsql/client";
import { all } from "@/lib/db";
import { listAdClients } from "@/lib/adCoverage";

// The full-website pipeline: the steps every website client goes through, in
// the order they are run, and how far each client has got. Shown in the Info
// view's "Website pipeline" tab and as the "Next:" line on client cards.
//
// A step counts as done when Jay or Claude marked it (pipeline_marks), or when
// the CRM already holds evidence for it (a ticked pill, a built onboarding
// submission, a live domain). A mark always wins, including "todo", which
// overrides evidence that is wrong for this client. "na" = not applicable.

export interface PipelineStep {
  id: string;
  label: string;
  /** The skill to run, e.g. "/site-demo"; "" for a manual step with no skill. */
  command: string;
  /** Who/what does a manual step. */
  manualBy?: string;
  /** Only for clients with an ads product: "any" or just Google. */
  ads?: "any" | "google";
  does: string;
  needs: string;
  produces: string;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "site-demo", label: "Demo site", command: "/site-demo",
    does: "Builds the near-final demo homepage from the brief and their photos and videos, on the site-kit.",
    needs: "A business brief, their photos/videos (or Facebook page).",
    produces: "A live demo on GitHub Pages to send them.",
  },
  {
    id: "site-buildout", label: "Full site build-out", command: "/site-buildout",
    does: "Expands the signed client's demo into the full multi-page SEO site: services, area pages, FAQs, about, reviews, legal.",
    needs: "Their onboarding form submitted in the CRM; the demo folder.",
    produces: "The full site on a GitHub Pages preview for you to review.",
  },
  {
    id: "link-card", label: "Link card", command: "/link-card",
    does: "The image that shows when the site link is shared on WhatsApp, Facebook or iMessage.",
    needs: "The built site.",
    produces: "og:image wired into every page.",
  },
  {
    id: "site-golive", label: "Go live on their domain", command: "/site-golive",
    does: "Moves the site onto their domain on Cloudflare Workers: SSL, security headers, www redirect, HTTPS.",
    needs: "The finished site, their domain, and you switching the nameservers.",
    produces: "The site live on their own domain.",
  },
  {
    id: "appscript", label: "Lead log (Sheet, email, CRM)", command: "/appscript",
    does: "Every form, call and WhatsApp tap logs to their Google Sheet, emails you and lands in the CRM.",
    needs: "The live site and a Google Sheet.",
    produces: "The Google Sheet pill ticked; leads in Client Dash.",
  },
  {
    id: "ga4", label: "GA4", command: "", manualBy: "You (no skill yet)",
    does: "Create the GA4 property, put the G- ID in the site config, mark the key events.",
    needs: "The live site.", produces: "The GA4 and GA4 Conversions pills ticked.",
  },
  {
    id: "search-console", label: "Search Console", command: "", manualBy: "You (no skill yet)",
    does: "Verify the domain in Google Search Console and submit the sitemap.",
    needs: "The live site.", produces: "The Search Console pill ticked.",
  },
  {
    id: "bing", label: "Bing", command: "", manualBy: "You (no skill yet)",
    does: "Import the site from Search Console into Bing Webmaster Tools.",
    needs: "Search Console done.", produces: "The Bing Console pill ticked.",
  },
  {
    id: "gbp", label: "Business Profile", command: "", manualBy: "You or Suryakanta",
    does: "Set up, verify or reinstate their Google Business Profile.",
    needs: "The client's Google login or manager access.", produces: "The Business Profile pill ticked; a Google review link.",
  },
  {
    id: "review-landing-page", label: "Review page", command: "/review-landing-page",
    does: "The /review/ page the client texts customers to ask for a Google review.",
    needs: "Their Google review link (so the Business Profile first).",
    produces: "/review/ live, noindex, with its own link card.",
  },
  {
    id: "ad-landing-page-build-out", label: "Ad landing page", command: "/ad-landing-page-build-out", ads: "any",
    does: "The /lp/ quiz-funnel page the Meta or Google ads point at, with GA4, pixel and lead logging.",
    needs: "The live site; their ad assets.",
    produces: "/lp/ pages live, noindex.",
  },
  {
    id: "google-ads-roofing-campaign", label: "Google Ads campaign", command: "/google-ads-roofing-campaign", ads: "google",
    does: "Builds the Google Ads search campaign from one config and walks the account setup.",
    needs: "The ad landing pages live.",
    produces: "The campaign uploaded (paused) with conversions set.",
  },
];

export const STEP_IDS = new Set(PIPELINE_STEPS.map((s) => s.id));
export const MARK_STATUSES = ["done", "na", "todo"] as const;

export type StepState = "done" | "na" | "todo" | "hidden";
export interface StepResult { state: StepState; by: "evidence" | "jay" | "claude" | ""; note: string }
export interface ClientPipeline {
  project_id: number; business_name: string; stage: string; ads: string[];
  steps: Record<string, StepResult>; next: string | null; done: number; total: number;
}

const PILL: Record<string, string> = {
  "link-card": "link_card", appscript: "google_sheet", ga4: "ga4_embedded",
  "search-console": "search_console_verified", bing: "bing_console", gbp: "gbp_setup",
};

/** Every non-lost client's progress through the pipeline. */
export async function clientPipelines(db: Client, projectId?: number): Promise<ClientPipeline[]> {
  const [projects, built, tasks, marks, adClients] = await Promise.all([
    db.execute({
      sql: `SELECT p.id, p.stage, p.domain, p.health_status, p.link_card, p.google_sheet, p.ga4_embedded,
                   p.search_console_verified, p.bing_console, p.gbp_setup,
                   COALESCE(l.business_name, '') AS business_name, COALESCE(l.demo_site_url, '') AS demo_site_url
              FROM projects p LEFT JOIN leads l ON l.id = p.lead_id
             WHERE COALESCE(p.client_status, '') != 'lost' AND (? = 0 OR p.id = ?)
             ORDER BY l.business_name`,
      args: [projectId || 0, projectId || 0],
    }).then(all),
    db.execute(`SELECT DISTINCT project_id FROM onboarding_submissions
                 WHERE kind = 'website' AND status = 'built' AND project_id IS NOT NULL`).then(all),
    db.execute(`SELECT project_id, lower(title) AS title FROM project_tasks
                 WHERE completed = 1 AND lower(title) IN ('build website', 'go live / dns switch')`).then(all),
    db.execute("SELECT project_id, step, status, marked_by, note FROM pipeline_marks").then(all),
    listAdClients(db),
  ]);

  const builtSet = new Set(built.map((r) => Number(r.project_id)));
  const doneTask = new Set(tasks.map((r) => `${r.project_id}|${r.title}`));
  const markMap = new Map(marks.map((m) => [`${m.project_id}|${m.step}`, m]));
  const adsOf = new Map(adClients.map((c) => [c.project_id, c.platforms as string[]]));

  return projects.map((p) => {
    const pid = Number(p.id);
    const stage = String(p.stage || "");
    const ads = adsOf.get(pid) || [];
    const domain = String(p.domain || "");
    const evidence = (id: string): boolean => {
      if (PILL[id]) return Number(p[PILL[id]]) === 1;
      switch (id) {
        case "site-demo": return String(p.demo_site_url) !== "" || stage !== "onboarding";
        case "site-buildout": return builtSet.has(pid) || doneTask.has(`${pid}|build website`);
        case "site-golive":
          return doneTask.has(`${pid}|go live / dns switch`)
            || (domain !== "" && !/github\.io/i.test(domain) && ["up", "slow"].includes(String(p.health_status || "")));
        default: return false;   // review page and ads steps: marked only
      }
    };

    const steps: Record<string, StepResult> = {};
    let next: string | null = null, done = 0, total = 0;
    for (const s of PIPELINE_STEPS) {
      const applies = !s.ads || (s.ads === "any" ? ads.length > 0 : ads.includes("google"));
      if (!applies) { steps[s.id] = { state: "hidden", by: "", note: "" }; continue; }
      const m = markMap.get(`${pid}|${s.id}`);
      let r: StepResult;
      if (m) r = { state: String(m.status) as StepState, by: (String(m.marked_by) === "claude" ? "claude" : "jay"), note: String(m.note || "") };
      else r = evidence(s.id) ? { state: "done", by: "evidence", note: "" } : { state: "todo", by: "", note: "" };
      steps[s.id] = r;
      if (r.state === "na") continue;
      total++;
      if (r.state === "done") done++;
      else if (!next) next = s.id;
    }
    return { project_id: pid, business_name: String(p.business_name), stage, ads, steps, next, done, total };
  });
}
