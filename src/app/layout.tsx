import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font — fonts are downloaded at build time and served
// from /_next/static with automatic preload. Replaces the render-blocking
// Google Fonts stylesheet (an external CSS request that gated first paint).
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dmmono",
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase makes the relative og:image resolve to an ABSOLUTE URL in the
  // emitted tags — scrapers (WhatsApp/Facebook/LinkedIn) don't resolve relative
  // paths, so this is what makes the share preview appear at all.
  metadataBase: new URL("https://crm.innov8workflows.co.uk"),
  title: "innov8 CRM",
  description: "Smarter Workflows. Built for Growth.",
  openGraph: {
    title: "innov8 CRM",
    description: "Smarter Workflows. Built for Growth.",
    url: "https://crm.innov8workflows.co.uk/",
    siteName: "innov8 CRM",
    type: "website",
    // Distinct filename (og-crm.jpg): if this card is ever replaced, the new
    // one MUST use a new name or WhatsApp/Facebook keep serving the cached old
    // thumbnail for weeks.
    images: [{ url: "/og-crm.jpg", width: 1200, height: 630, alt: "innov8 CRM — Smarter Workflows. Built for Growth." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "innov8 CRM",
    description: "Smarter Workflows. Built for Growth.",
    images: ["/og-crm.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${bricolage.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('crm_theme');if(t&&t!=='dark')document.documentElement.classList.add('theme-'+t);}catch(e){}` }} />
      </head>
      <body className="h-full font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
