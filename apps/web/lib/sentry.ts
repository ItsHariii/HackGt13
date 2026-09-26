import type { ErrorEvent } from "@sentry/nextjs";
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    // Keep request IDs, not session or authorization headers.
    const id = event.request.headers?.["x-request-id"];
    event.request.headers = id ? { "x-request-id": id } : {};
    if (event.request.url)
      event.request.url = event.request.url.split("?")[0] ?? "";
    delete event.request.query_string;
  }
  return event;
}
