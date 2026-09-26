import { requestId } from "@proofcart/platform/request-id";
import { type NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const id = requestId(request.headers.get("x-request-id"));
  const headers = new Headers(request.headers);
  headers.set("x-request-id", id);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", id);
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
