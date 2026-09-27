import { requestId } from "@cartel/platform/request-id";
import { securityHeaders } from "@cartel/platform/security-headers";
import { type NextRequest, NextResponse } from "next/server";
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
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
