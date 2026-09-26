/** Shape check for a `PublicKeyCredential` JSON body before it reaches SimpleWebAuthn. */
// biome-ignore lint/suspicious/noExplicitAny: narrowed by the checks below
export function isCredential(value: any): boolean {
  const b64 = (v: unknown) =>
    typeof v === "string" && v.length <= 16384 && /^[A-Za-z0-9_-]+$/.test(v);
  return (
    !!value &&
    typeof value === "object" &&
    value.type === "public-key" &&
    b64(value.id) &&
    value.rawId === value.id &&
    !!value.response &&
    typeof value.response === "object" &&
    b64(value.response.clientDataJSON)
  );
}
