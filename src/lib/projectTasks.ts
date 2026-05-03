// Default project task checklist — shared by /api/projects (POST creates these)
// and /api/projects/[id]/sync-tasks (adds any missing ones to an existing project).
//
// Grouped by stage to match the kanban columns. Covers everything a typical
// website project needs — Jay can delete tasks that don't apply per project.

export interface DefaultTask {
  title: string;
  stage: "onboarding" | "design_content" | "build" | "review" | "launch";
}

export const DEFAULT_PROJECT_TASKS: DefaultTask[] = [
  // ── Onboarding ──
  { title: "Initial client meeting", stage: "onboarding" },
  { title: "Confirm tier & monthly fee", stage: "onboarding" },
  { title: "Collect brand assets (logo, colours, fonts)", stage: "onboarding" },
  { title: "Identify required functionality", stage: "onboarding" },
  { title: "Domain registration / transfer", stage: "onboarding" },

  // ── Design & Content ──
  { title: "Design mockup / wireframe", stage: "design_content" },
  { title: "Client design approval", stage: "design_content" },
  { title: "Collect page content / copy", stage: "design_content" },
  { title: "Collect product/service photos", stage: "design_content" },
  { title: "Collect before & after photos", stage: "design_content" },
  { title: "Collect Google reviews / testimonials", stage: "design_content" },

  // ── Build ──
  { title: "Build website", stage: "build" },
  { title: "Mobile responsive check", stage: "build" },
  { title: "Click-to-call button", stage: "build" },
  { title: "Contact form + spam protection", stage: "build" },
  { title: "Before & afters slider", stage: "build" },
  { title: "Google Reviews integration", stage: "build" },
  { title: "WhatsApp / Messenger widget", stage: "build" },
  { title: "Socials linked (FB / IG / TikTok)", stage: "build" },
  { title: "SSL / HTTPS active", stage: "build" },
  { title: "SEO setup (meta, sitemap, schema)", stage: "build" },
  { title: "Page speed optimisation", stage: "build" },
  { title: "Backup & uptime monitoring", stage: "build" },

  // ── Review ──
  { title: "Client review & feedback", stage: "review" },
  { title: "Final revisions", stage: "review" },
  { title: "Cross-browser testing", stage: "review" },
  { title: "Security check (forms, SSL, no exposed admin)", stage: "review" },

  // ── Launch ──
  { title: "Go live / DNS switch", stage: "launch" },
  { title: "Login credentials handed over", stage: "launch" },
  { title: "Client handover & training", stage: "launch" },
  { title: "Post-launch monitoring (first 7 days)", stage: "launch" },
];
