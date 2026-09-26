import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@proofcart/catalog",
    "@proofcart/acp",
    "@proofcart/contracts",
    "@proofcart/evidence",
    "@proofcart/platform",
    "@proofcart/proof-engine",
    "@proofcart/rule-packs",
    "@proofcart/tap",
  ],
  poweredByHeader: false,
};
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
