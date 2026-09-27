import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@cartel/catalog",
    "@cartel/acp",
    "@cartel/contracts",
    "@cartel/evidence",
    "@cartel/evidence-pack",
    "@cartel/platform",
    "@cartel/proof-engine",
    "@cartel/rule-packs",
    "@cartel/solver",
    "@cartel/tap",
  ],
  // Renders Evidence Pack and dispute PDFs in Node route handlers.
  serverExternalPackages: ["@react-pdf/renderer"],
  poweredByHeader: false,
};
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
