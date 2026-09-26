export function requestId(value?: string | null): string {
  return value && /^[a-zA-Z0-9_-]{8,64}$/.test(value)
    ? value
    : crypto.randomUUID();
}
