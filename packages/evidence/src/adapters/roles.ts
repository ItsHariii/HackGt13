/*
 * Role hints from a source's category and title, for catalog sources that
 * don't use Cartel's roles. A hint only decides which pack fields are read
 * for a product; the user still chooses what fills a role in a plan.
 * Order matters: "monitor arm" is not a monitor, "USB-C cable" is not a dock.
 */
const RULES: [RegExp, string][] = [
  [/\bmonitor (?:arm|mount|stand)s?\b/i, "monitor_arm"],
  [/\bweb ?cam(?:era)?s?\b/i, "webcam"],
  [/\b(?:docking station|dock|usb-?c hub)s?\b/i, "dock"],
  [/\bcables?\b/i, "cable"],
  [/\b(?:computer )?monitors?\b|\bdisplays?\b/i, "monitor"],
  [/\b(?:standing |office |computer |writing )?desks?\b/i, "desk"],
  [/\b(?:office |task |desk |ergonomic )?chairs?\b/i, "chair"],
  [/\bpower ?banks?\b|\bportable chargers?\b/i, "power_bank"],
  [/\b(?:travel |plug |power )adapters?\b/i, "adapter"],
  [/\b(?:carry-?on|luggage|suitcases?|backpacks?|duffel)\b/i, "bag"],
  [/\bdress(?:es)?\b/i, "dress"],
  // Apparel pack roles: a shirt fills `top`, trousers `bottom`, a jacket `outerwear`.
  [/\bshirts?\b|\bblouses?\b|\bt-?shirts?\b|\bsweaters?\b/i, "top"],
  [/\b(?:trousers|pants|chinos|jeans|skirts?|shorts)\b/i, "bottom"],
  [/\bjackets?\b|\bblazers?\b|\bcoats?\b|\bcardigans?\b/i, "outerwear"],
  [/\bshoes?\b|\bsneakers?\b|\bheels?\b|\bboots?\b/i, "shoes"],
];

/**
 * Tries each text in turn (category before title: "Computer Monitors" is a
 * better signal than "USB-C Hub Monitor") and returns the first role found.
 */
export function inferRoles(...texts: (string | undefined)[]): string[] {
  for (const text of texts) {
    if (!text) continue;
    for (const [re, role] of RULES) if (re.test(text)) return [role];
  }
  return [];
}
