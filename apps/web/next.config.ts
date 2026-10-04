import type { NextConfig } from "next";

// Baseline security headers. CSP is limited to frame-ancestors for now; a full
// nonce-based CSP needs a report-only rollout first.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
  async rewrites() {
    return [
      { source: "/dashboard", destination: "/protected/dashboard" },
      { source: "/customers/:path*", destination: "/protected/customers/:path*" },
      { source: "/technicians/:path*", destination: "/protected/technicians/:path*" },
      { source: "/service-types/:path*", destination: "/protected/service-types/:path*" },
      { source: "/service-requests/:path*", destination: "/protected/service-requests/:path*" },
      { source: "/jobs/:path*", destination: "/protected/jobs/:path*" },
      { source: "/schedule", destination: "/protected/schedule" },
      { source: "/quotations/:path*", destination: "/protected/quotations/:path*" },
      { source: "/invoices/:path*", destination: "/protected/invoices/:path*" },
      { source: "/payments/:path*", destination: "/protected/payments/:path*" },
      { source: "/inventory/:path*", destination: "/protected/inventory/:path*" },
      { source: "/settings", destination: "/protected/settings" },
      { source: "/settings/:path*", destination: "/protected/settings/:path*" },
    ];
  },
};

export default nextConfig;
