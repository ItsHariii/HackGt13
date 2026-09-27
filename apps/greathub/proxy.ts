import { requestId } from "@cartel/platform/request-id";
import { securityHeaders } from "@cartel/platform/security-headers";
import { type NextRequest, NextResponse } from "next/server";
import { parseView, VIEW_COOKIE } from "./lib/shelf";
export function proxy(request: NextRequest) {
  const id = requestId(request.headers.get("x-request-id"));
  const headers = new Headers(request.headers);
  headers.set("x-request-id", id);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", id);
  // GreatHub loads nothing third-party in the browser; only Sentry may be reached.
  const secure = securityHeaders({
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    dev: process.env.NODE_ENV === "development",
  });
  for (const [name, value] of Object.entries(secure))
    response.headers.set(name, value);
  // Remember the catalog view (list or full) chosen on the home page.
  const view = parseView(request.nextUrl.searchParams.get("view"));
  if (view && request.nextUrl.pathname === "/")
    response.cookies.set(VIEW_COOKIE, view, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
