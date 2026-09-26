/** Sources that can be switched off with `SOURCES_ENABLED` (SDD §11.6). */
export const SWITCHABLE_SOURCES = [
  "shopify",
  "icecat",
  "upcitemdb",
  "greathub",
  "cpsc",
  "openfoodfacts",
  "ebay",
] as const;
export type SwitchableSource = (typeof SWITCHABLE_SOURCES)[number];

/**
 * Parses the per-source kill switch. Unset means the defaults; an empty
 * value switches every optional source off. Unknown names are ignored.
 */
export function enabledSources(
  raw: string | undefined,
  defaults: readonly SwitchableSource[] = [
    "shopify",
    "icecat",
    "upcitemdb",
    "greathub",
    "cpsc",
  ],
): Set<SwitchableSource> {
  if (raw === undefined) return new Set(defaults);
  const names = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is SwitchableSource =>
      (SWITCHABLE_SOURCES as readonly string[]).includes(s),
    );
  return new Set(names);
}
