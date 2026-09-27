import { readFileSync } from "node:fs";
import { Requirement } from "@cartel/contracts";
import { fieldDef } from "@cartel/proof-engine";
import { describe, expect, it } from "vitest";
import { PACKS } from "./index";

/*
 * supabase/seed.sql against the packs. The solver finds GreatHub candidates
 * by role and the proof engine reads their spec by field name, so a seed role
 * or kit field the packs don't know silently leaves a plan with no product
 * (a carry-on kit with "no toiletry bottle"). Keep them in step here.
 */

const seed = readFileSync(
  new URL("../../../supabase/seed.sql", import.meta.url),
  "utf8",
);
const packRoles = (id: string) =>
  new Set(PACKS[id]?.roles.map((r) => r.role) ?? []);
const allRoles = new Set(
  Object.values(PACKS).flatMap((p) => p.roles.map((r) => r.role)),
);
const DEPARTMENT_PACK: Record<string, string> = {
  home_office: "home-office",
  apparel: "apparel",
  travel: "travel",
  grocery: "grocery",
  party: "party",
};
/** Catalog extras no pack plans for yet; they stay findable by search only. */
const EXTRA_ROLES = new Set([
  "monitor_arm",
  "microphone",
  "light",
  "converter",
  "desk_accessory",
  "travel_accessory",
]);

const products = [
  ...seed.matchAll(
    /^\((\d+), '([a-z0-9-]+)', '[^']+', '(?:[^']|'')+', '([a-z_]+)', '[a-z_]+', '\{([a-z_,]+)\}',$/gm,
  ),
].map((m) => ({
  slug: m[2] as string,
  department: m[3] as string,
  roles: (m[4] as string).split(","),
}));
const kitPacks = new Map(
  [...seed.matchAll(/\('([a-z-]+)', '[^']+', '([a-z-]+)',\n/g)].map((m) => [
    m[1] as string,
    m[2] as string,
  ]),
);
const kitRequirements = [
  ...seed.matchAll(/\('([a-z-]+)', \d+, '(\{"id".*?\})'(?:::jsonb)?\)/g),
].map((m) => ({ kit: m[1] as string, spec: JSON.parse(m[2] as string) }));
const kitItems = [
  ...seed.matchAll(/\('([a-z-]+)', '([a-z_]+)', '[A-Z0-9-]+', \d+\)/g),
].map((m) => ({ kit: m[1] as string, role: m[2] as string }));

describe("seed.sql matches the rule packs", () => {
  it("reads the seed", () => {
    expect(products.length).toBeGreaterThan(140);
    expect(kitPacks.size).toBe(3);
    expect(kitRequirements.length).toBeGreaterThan(15);
    expect(kitItems.length).toBeGreaterThan(8);
  });

  it("every product carries a role its department's pack plans for", () => {
    const orphans = products.filter((p) => {
      const pack = packRoles(DEPARTMENT_PACK[p.department] ?? "");
      return !p.roles.some((r) => pack.has(r) || EXTRA_ROLES.has(r));
    });
    expect(orphans.map((p) => `${p.slug} {${p.roles}}`)).toEqual([]);
  });

  it("no product borrows another department's role", () => {
    const borrowed = products.filter((p) => {
      const own = packRoles(DEPARTMENT_PACK[p.department] ?? "");
      // Party snacks are groceries too (`food`); that's the one shared shelf.
      return p.roles.some(
        (r) => allRoles.has(r) && !own.has(r) && r !== "food",
      );
    });
    expect(borrowed.map((p) => `${p.slug} {${p.roles}}`)).toEqual([]);
  });

  it("kit rules are valid requirements on fields and roles their pack knows", () => {
    for (const { kit, spec } of kitRequirements) {
      const pack = PACKS[kitPacks.get(kit) ?? ""];
      if (!pack) throw new Error(`kit ${kit} has no pack`);
      expect(Requirement.safeParse(spec).success, `${kit} ${spec.id}`).toBe(
        true,
      );
      expect(fieldDef(spec.field, [pack]), `${kit} ${spec.field}`).toBeTruthy();
      if (spec.role)
        expect(packRoles(pack.id).has(spec.role), `${kit} ${spec.role}`).toBe(
          true,
        );
    }
  });

  it("kit items fill roles their pack plans for", () => {
    for (const { kit, role } of kitItems)
      expect(
        packRoles(kitPacks.get(kit) ?? "").has(role),
        `${kit} ${role}`,
      ).toBe(true);
  });
});
