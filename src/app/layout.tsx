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
    <html lang="en" className="h-full dark">
      <body className="h-full font-sans antialiased">{children}</body>
    </html>
  );
}
