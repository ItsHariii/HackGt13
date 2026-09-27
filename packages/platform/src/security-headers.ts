/**
 * Response security headers (SDD §20.1, TASKS T17.1). Each third-party origin
 * is allowed only on the routes that need it: card entry on the payment
 * settings page, the camera on orders. AI calls run on the server and need no
 * CSP entry. Scripts keep 'unsafe-inline' because App Router's hydration
 * scripts are inline and a nonce would force every page to render dynamically.
 */

/** Visa Acceptance Microform: script, hosted-field iframes and their calls. */
const MICROFORM = [
  "https://flex.cybersource.com",
  "https://testflex.cybersource.com",
];
/** Authorize.net Accept Hosted (the fallback rail). */
const ACCEPT_UI = ["https://js.authorize.net", "https://jstest.authorize.net"];
const ACCEPT_API = [
  "https://api2.authorize.net",
  "https://apitest.authorize.net",
];

export type SecurityHeaderOptions = {
  /** `NEXT_PUBLIC_SUPABASE_URL`; the browser talks to it over HTTPS and WebSocket (Realtime). */
  supabaseUrl?: string | undefined;
  /** The browser Sentry DSN; only its ingest origin is allowed. */
  sentryDsn?: string | undefined;
  /** Dev servers need `eval` for React's call stacks and must not upgrade local HTTP. */
  dev?: boolean;
  /** Card-entry pages that load Microform or Accept UI. */
  payments?: boolean;
  /** Pages that may open the camera (delivery-match scanning). */
  camera?: boolean;
};

function origin(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(o: SecurityHeaderOptions = {}): string {
  const supabase = origin(o.supabaseUrl);
  const sentry = origin(o.sentryDsn);
  const connect = ["'self'"];
  if (supabase) {
    connect.push(
      supabase.origin,
      `${supabase.protocol === "https:" ? "wss" : "ws"}://${supabase.host}`,
    );
  }
  if (sentry) connect.push(sentry.origin);
  const script = ["'self'", "'unsafe-inline'"];
  if (o.dev) script.push("'unsafe-eval'");
  const frame: string[] = [];
  if (o.payments) {
    script.push(...MICROFORM, ...ACCEPT_UI);
    connect.push(...MICROFORM, ...ACCEPT_API);
    frame.push(...MICROFORM, ...ACCEPT_UI);
  }
  const directives = [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    `frame-src ${frame.length ? frame.join(" ") : "'none'"}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // A production build run against local HTTP Supabase (`next start`, a11y runs) must not upgrade it.
  if (!o.dev && supabase?.protocol !== "http:")
    directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function permissionsPolicy(o: SecurityHeaderOptions = {}): string {
  return [
    `camera=${o.camera ? "(self)" : "()"}`,
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
    "publickey-credentials-get=(self)",
    "publickey-credentials-create=(self)",
  ].join(", ");
}

/** Headers that are the same on every route, including static files. */
export function baselineSecurityHeaders(
  o: Pick<SecurityHeaderOptions, "dev"> = {},
): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    ...(o.dev
      ? {}
      : { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }),
  };
}

export function securityHeaders(
  o: SecurityHeaderOptions = {},
): Record<string, string> {
  return {
    ...baselineSecurityHeaders(o),
    "Content-Security-Policy": contentSecurityPolicy(o),
    "Permissions-Policy": permissionsPolicy(o),
  };
}
