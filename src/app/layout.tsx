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
  title: "innov8 CRM",
  description: "Cold outbound CRM — innov8 Workflows",
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
