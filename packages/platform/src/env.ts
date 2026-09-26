/** Reject template values without printing credentials in errors or logs. */
export function isConfigured(value: string | undefined): value is string {
  return Boolean(
    value?.trim() &&
      !/xxx|change-me|your[_-]|placeholder|example\.com/i.test(value),
  );
}

export function isHttpUrl(value: string | undefined): value is string {
  if (!isConfigured(value)) return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function supabaseConfigured(
  url: string | undefined,
  key: string | undefined,
) {
  return isHttpUrl(url) && isConfigured(key);
}

export function requireEnv(name: string, value: string | undefined): string {
  if (!isConfigured(value)) throw new Error(`${name} is not configured`);
  return value;
}
