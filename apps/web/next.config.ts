import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
  async rewrites() {
    return [
      { source: "/login", destination: "/auth/login" },
      { source: "/dashboard", destination: "/protected/dashboard" },
      { source: "/customers/:path*", destination: "/protected/customers/:path*" },
      { source: "/technicians/:path*", destination: "/protected/technicians/:path*" },
      { source: "/service-types/:path*", destination: "/protected/service-types/:path*" },
      { source: "/service-requests/:path*", destination: "/protected/service-requests/:path*" },
      {
        source: "/settings/organization",
        destination: "/protected/settings/organization",
      },
    ];
  },
};

export default nextConfig;
