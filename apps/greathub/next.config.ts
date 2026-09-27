import { baselineSecurityHeaders } from "@cartel/platform/security-headers";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@cartel/platform",
    "@cartel/tap",
    "@cartel/acp",
    "@cartel/payments",
    "@cartel/contracts",
  ],
  poweredByHeader: false,
  // Lets a second server (the ACP contract harness) run beside `next dev` without sharing `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // CSP and Permissions-Policy come from proxy.ts; these cover static files too.
  async headers() {
    const baseline = baselineSecurityHeaders({
      dev: process.env.NODE_ENV === "development",
    });
    return [
      {
        source: "/:path*",
        headers: Object.entries(baseline).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ];
  },
};
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
