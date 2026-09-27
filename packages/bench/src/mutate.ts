import type { Fact, Offer } from "@cartel/contracts";
import { type CheckoutState, money } from "@cartel/proof-engine";
import {
  type CheckoutOptions,
  greathubCheckout,
  type Line,
} from "@cartel/rule-packs/fixtures";
import type { Op } from "./scenario";
import type { World } from "./worlds";

/*
 * Applies a scenario's mutation to a world's signed basket and reads the
 * result back as the live checkout, the way the Chaos Panel edits GreatHub
 * and Cartel then re-reads it. Offer facts and the merchant quote are
 * regenerated from the edited offers, so a price edit moves tax and total.
 */

export class MutationError extends Error {
  override name = "MutationError";
}

export function liveCheckout(
  world: World,
  mutation: readonly Op[],
  now: string,
): CheckoutState {
  let lines: Line[] = world.lines().map((l) => ({ ...l, facts: [...l.facts] }));
  const opts: CheckoutOptions = { ...world.checkout, now };
  const late: Op[] = [];

  const at = (role: string): number => {
    const i = lines.findIndex((l) => l.role === role);
    if (i < 0) throw new MutationError(`no line for role ${role}`);
    return i;
  };
  const alternative = (key: string) => {
    const alt = world.alternatives[key];
    if (!alt) throw new MutationError(`${world.id} has no alternative ${key}`);
    return alt;
  };
  const edit = (role: string, f: (l: Line) => Line) => {
    const i = at(role);
    lines[i] = f(lines[i] as Line);
  };
  const editOffer = (role: string, f: (o: Offer) => Offer) =>
    edit(role, (l) => ({ ...l, offer: f(l.offer) }));

  for (const op of mutation) {
    switch (op.op) {
      case "price":
        editOffer(op.role, (o) => ({
          ...o,
          price: money(op.minor, o.price.currency),
        }));
        break;
      case "offer":
        editOffer(op.role, (o) => ({ ...o, ...defined(op.set) }));
        break;
      case "terms":
        editOffer(op.role, (o) => ({
          ...o,
          terms: { ...o.terms, ...defined(op.set) },
        }));
        break;
      case "qty":
        edit(op.role, (l) => ({ ...l, qty: op.qty }));
        break;
      case "swap": {
        const alt = alternative(op.to);
        edit(op.role, (l) => ({
          ...l,
          offer: alt.offer,
          facts: [...alt.facts],
        }));
        break;
      }
      case "add_line": {
        const alt = alternative(op.from);
        lines.push({ role: op.role, offer: alt.offer, facts: [...alt.facts] });
        break;
      }
      case "remove_line":
        at(op.role);
        lines = lines.filter((l) => l.role !== op.role);
        break;
      case "fact":
        edit(op.role, (l) => {
          if (!l.facts.some((f) => f.field === op.field))
            throw new MutationError(`${op.role} has no ${op.field} fact`);
          return {
            ...l,
            facts: l.facts.map((f) =>
              f.field === op.field ? patch(f, op.set) : f,
            ),
          };
        });
        break;
      case "add_fact":
        edit(op.role, (l) => {
          const template: Fact = l.facts[0] ?? {
            id: op.fact.id,
            subjectKind: "product",
            subjectId: l.offer.productId,
            field: op.field,
            value: null,
            state: "source_stated",
            conflict: false,
            sourceId: `src_${l.offer.productId}_jsonld`,
            extractor: "jsonld",
            retrievedAt: now,
          };
          const {
            raw: _raw,
            reason: _reason,
            freshUntil: _fresh,
            ...rest
          } = template;
          return {
            ...l,
            facts: [...l.facts, patch({ ...rest, field: op.field }, op.fact)],
          };
        });
        break;
      case "remove_fact":
        edit(op.role, (l) => ({
          ...l,
          facts: l.facts.filter((f) => f.field !== op.field),
        }));
        break;
      case "checkout":
        Object.assign(opts, op.set);
        break;
      case "source":
      case "order":
        late.push(op);
        break;
    }
  }

  const state = greathubCheckout(lines, opts);
  for (const op of late) {
    if (op.op === "source") {
      state.sources = {
        ...state.sources,
        [op.sourceId]: { authority: op.authority, name: op.sourceId },
      };
    } else if (op.op === "order") {
      state.order = { ...state.order, [op.field]: op.value };
    }
  }
  return state;
}

/** The keys of `o` that are set, so an absent option never overwrites a field. */
function defined<T extends object>(
  o: T,
): { [K in keyof T]-?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as { [K in keyof T]-?: Exclude<T[K], undefined> };
}

function patch(f: Fact, set: object): Fact {
  return { ...f, ...defined(set) } as Fact;
}
