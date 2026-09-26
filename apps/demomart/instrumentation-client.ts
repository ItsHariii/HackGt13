import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "./lib/sentry";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { allow: ["x-request-id"] },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
});
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
