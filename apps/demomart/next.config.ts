import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@proofcart/platform"],
  poweredByHeader: false,
};
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
