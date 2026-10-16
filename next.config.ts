import type { NextConfig } from "next";

// Security headers on every response. The CSP is deliberately limited to the
// directives that cannot break the app (no script/style allowlist): clickjacking
// (frame-ancestors), <base> injection and plugins. Framing is same-origin, not
// none, because the Pricing tab shows the price-list PDF in an iframe.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
