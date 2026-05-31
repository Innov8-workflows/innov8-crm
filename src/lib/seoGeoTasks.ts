// SEO / GEO maintenance checklist — what Jay can do on each client site to
// keep their rankings fresh and their Google presence dominant. Hardcoded
// here so it's easy to tweak; completion logs live in seo_geo_logs table.

export interface SeoGeoTask {
  id: string;
  label: string;
  description: string;
  category: "seo" | "geo";
}

export const SEO_GEO_TASKS: SeoGeoTask[] = [
  // ── SEO (on-page / technical) ──
  { id: "meta_refresh",      label: "Meta tags refresh",            category: "seo", description: "Update page titles, descriptions, OG tags. Target current high-volume keywords." },
  { id: "schema_markup",     label: "Schema markup update",         category: "seo", description: "LocalBusiness / Service / Review schema. Test via Google Rich Results tool." },
  { id: "sitemap_resubmit",  label: "Sitemap re-submit",            category: "seo", description: "Push fresh sitemap.xml to Google Search Console." },
  { id: "page_speed",        label: "Page speed audit",             category: "seo", description: "Run PageSpeed Insights. Action anything Core Web Vitals flags red." },
  { id: "mobile_check",      label: "Mobile usability check",       category: "seo", description: "Lighthouse mobile audit. Check tap targets, font sizes, viewport." },
  { id: "broken_links",      label: "Broken link sweep",            category: "seo", description: "Crawl the site for 404s. Fix or 301 anything broken." },
  { id: "keyword_refresh",   label: "Keyword targeting refresh",    category: "seo", description: "Review which keywords actually drive traffic vs target list. Adjust H1s / copy where it pays off." },
  { id: "backlink_check",    label: "Backlink check",               category: "seo", description: "Run Ahrefs/Ubersuggest. Disavow spam, follow up on opportunities." },
  { id: "content_refresh",   label: "Content refresh / new blog",   category: "seo", description: "Update old service pages OR publish a new article targeting a fresh local query." },

  // ── GEO (local presence / Google Business Profile) ──
  { id: "gbp_post",          label: "Google Business Profile post", category: "geo", description: "Fresh post on GBP (offer / update / event). Keeps the listing 'live'." },
  { id: "gbp_photos",        label: "GBP photos update",            category: "geo", description: "Upload 3-5 new job photos to the Business Profile gallery." },
  { id: "gbp_qa",            label: "GBP Q&A review",               category: "geo", description: "Answer any unanswered Q&As. Seed common ones if list is bare." },
  { id: "reviews_check",     label: "Reviews check + response",     category: "geo", description: "Respond to any new reviews (5★ thanks, ≤3★ professional reply). Note volume trend." },
  { id: "nap_citations",     label: "NAP citation check",           category: "geo", description: "Name / Address / Phone consistent across Yell, Yelp, Bing, Apple Maps, FB, IG." },
  { id: "local_directories", label: "Local directory submissions",  category: "geo", description: "Add or refresh listings on local Chamber, BNI, Checkatrade, MyBuilder, etc." },
  { id: "competitor_scan",   label: "Competitor scan",              category: "geo", description: "Top 3 local competitors — what are they ranking for that we're not? Action gaps." },
];
