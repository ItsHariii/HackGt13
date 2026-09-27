import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  permissionsPolicy,
  securityHeaders,
} from "./security-headers";

function directive(csp: string, name: string) {
  return csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);
}

describe("security headers (T17.1)", () => {
  it("forbids framing and plugins everywhere", () => {
    const csp = contentSecurityPolicy();
    expect(directive(csp, "frame-ancestors")).toBe("'none'");
    expect(directive(csp, "object-src")).toBe("'none'");
    expect(directive(csp, "frame-src")).toBe("'none'");
    expect(securityHeaders()["X-Frame-Options"]).toBe("DENY");
    expect(securityHeaders()["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("allows Supabase over HTTPS and Realtime, and only Sentry's ingest origin", () => {
    const csp = contentSecurityPolicy({
      supabaseUrl: "https://abc.supabase.co",
      sentryDsn: "https://key@o1.ingest.us.sentry.io/42",
    });
    expect(directive(csp, "connect-src")).toBe(
      "'self' https://abc.supabase.co wss://abc.supabase.co https://o1.ingest.us.sentry.io",
    );
    expect(csp).not.toContain("key@");
  });

  it("keeps card-entry origins off every page but payment settings", () => {
    const plain = contentSecurityPolicy();
    expect(plain).not.toContain("cybersource");
    expect(plain).not.toContain("authorize.net");
    const pay = contentSecurityPolicy({ payments: true });
    expect(directive(pay, "script-src")).toContain(
      "https://testflex.cybersource.com",
    );
    expect(directive(pay, "frame-src")).toContain(
      "https://flex.cybersource.com",
    );
    expect(directive(pay, "frame-ancestors")).toBe("'none'");
  });

  it("adds eval and plain-HTTP Supabase only in development", () => {
    const dev = contentSecurityPolicy({
      dev: true,
      supabaseUrl: "http://127.0.0.1:54321",
    });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws://127.0.0.1:54321");
    expect(dev).not.toContain("upgrade-insecure-requests");
    const prod = contentSecurityPolicy();
    expect(directive(prod, "script-src")).not.toContain("'unsafe-eval'");
    expect(prod).toContain("upgrade-insecure-requests");
    expect(
      contentSecurityPolicy({ supabaseUrl: "http://127.0.0.1:54321" }),
    ).not.toContain("upgrade-insecure-requests");
    expect(securityHeaders()["Strict-Transport-Security"]).toBeDefined();
    expect(securityHeaders({ dev: true })["Strict-Transport-Security"]).toBe(
      undefined,
    );
  });

  it("ignores malformed origins", () => {
    const csp = contentSecurityPolicy({
      supabaseUrl: "javascript:alert(1)",
      sentryDsn: "not a url",
    });
    expect(directive(csp, "connect-src")).toBe("'self'");
  });

  it("opens the camera only where asked", () => {
    expect(permissionsPolicy()).toContain("camera=()");
    expect(permissionsPolicy({ camera: true })).toContain("camera=(self)");
    expect(permissionsPolicy()).toContain("publickey-credentials-get=(self)");
  });
});
