import { requestId } from "@proofcart/platform/request-id";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
export async function proxy(request: NextRequest) {
  const id = requestId(request.headers.get("x-request-id"));
  const headers = new Headers(request.headers);
  headers.set("x-request-id", id);
  let response = NextResponse.next({ request: { headers } });
  const config = getSupabaseConfig();
  if (
    config &&
    !request.nextUrl.pathname.startsWith("/api/health") &&
    !request.nextUrl.pathname.startsWith("/.well-known/")
  ) {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          headers.set("cookie", request.cookies.toString());
          const previous = response.cookies.getAll();
          response = NextResponse.next({ request: { headers } });
          for (const cookie of previous) response.cookies.set(cookie);
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options);
        },
      },
    });
    // Verifies identity and refreshes expired cookies. Route handlers still authorize their own data.
    await supabase.auth.getClaims();
    response.headers.set("Cache-Control", "private, no-store");
  }
  response.headers.set("x-request-id", id);
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
