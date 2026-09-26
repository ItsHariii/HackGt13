import * as Sentry from "@sentry/nextjs";
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs")
    await import("./sentry.server.config");
}
export const onRequestError: typeof Sentry.captureRequestError = (
  error,
  request,
  context,
) => {
  Sentry.withScope((scope) => {
    const id = request.headers["x-request-id"];
    if (typeof id === "string") scope.setTag("request_id", id);
    Sentry.captureRequestError(error, request, context);
  });
};
