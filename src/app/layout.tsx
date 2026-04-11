import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('crm_theme');if(t&&t!=='dark')document.documentElement.classList.add('theme-'+t);}catch(e){}` }} />
      </head>
      <body className="h-full font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
