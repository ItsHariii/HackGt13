import type { Pack } from "@cartel/proof-engine";
import { apparel } from "./apparel";
import { grocery } from "./grocery";
import { homeOffice } from "./home-office";
import { travel } from "./travel";

export {
  apparel,
  CHEST_EASE_IN,
  RESHIP_DAYS,
  RETURN_TRANSIT_DAYS,
} from "./apparel";
export { grocery, PHYSICAL_LABEL_CAVEAT } from "./grocery";
export { homeOffice, requiredLaptopWatts } from "./home-office";
export { NOMINAL_CELL_VOLTAGE, travel } from "./travel";

/** Every pack Cartel ships, by ID. */
export const PACKS: Readonly<Record<string, Pack>> = Object.freeze({
  [homeOffice.id]: homeOffice,
  [apparel.id]: apparel,
  [travel.id]: travel,
  [grocery.id]: grocery,
});

/** The packs a contract or report names, in a stable order. Throws on an unknown ID or version. */
export function packsFor(versions: Readonly<Record<string, string>>): Pack[] {
  return Object.keys(versions)
    .sort()
    .map((id) => {
      const pack = PACKS[id];
      if (!pack) throw new Error(`unknown rule pack: ${id}`);
      if (pack.version !== versions[id]) {
        throw new Error(
          `rule pack ${id} is ${pack.version}, but ${versions[id]} was requested`,
        );
      }
      return pack;
    });
}
