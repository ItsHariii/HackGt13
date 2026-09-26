/*
 * Fixed-point decimal arithmetic on bigint (SDD §8.2). Values are scaled by
 * 10^18, which holds every unit conversion factor the engine uses exactly
 * (the longest is 29.5735295625 ml per US fluid ounce), so conversions and
 * comparisons never pick up binary floating-point error.
 */

const SCALE = 18;
const ONE = 10n ** BigInt(SCALE);

declare const brand: unique symbol;
/** A decimal scaled by 10^18. Only build one with `dec()`. */
export type Decimal = bigint & { readonly [brand]: true };

const DECIMAL_TEXT = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;

/**
 * Parses a finite decimal from a string (`"20000"`, `"-1.5"`, `"2.5e-3"`) or
 * a number (read through its shortest round-trip string, so `0.1` is exactly
 * one tenth). Returns null for anything else, including NaN and Infinity.
 * Digits beyond 18 decimal places are truncated.
 */
export function dec(input: string | number | bigint): Decimal | null {
  if (typeof input === "bigint") return (input * ONE) as Decimal;
  if (typeof input === "number" && !Number.isFinite(input)) return null;
  const text = String(input).trim();
  const m = DECIMAL_TEXT.exec(text);
  if (!m) return null;
  const [, sign = "", int = "", frac = "", exp = "0"] = m;
  if (int === "" && frac === "") return null;
  const shift = Number(exp);
  if (!Number.isSafeInteger(shift) || Math.abs(shift) > 400) return null;
  let digits = BigInt(`${int || "0"}${frac}`);
  let power = SCALE - frac.length + shift;
  if (power >= 0) digits *= 10n ** BigInt(power);
  else {
    power = -power;
    digits /= 10n ** BigInt(power);
  }
  return (sign === "-" ? -digits : digits) as Decimal;
}

/** `dec()` for inputs that are known to be valid literals. */
export function decOf(input: string | number | bigint): Decimal {
  const d = dec(input);
  if (d === null) throw new RangeError(`not a finite decimal: ${input}`);
  return d;
}

export const ZERO = 0n as Decimal;

export function add(a: Decimal, b: Decimal): Decimal {
  return (a + b) as Decimal;
}

export function sub(a: Decimal, b: Decimal): Decimal {
  return (a - b) as Decimal;
}

export function neg(a: Decimal): Decimal {
  return -a as Decimal;
}

export function abs(a: Decimal): Decimal {
  return (a < 0n ? -a : a) as Decimal;
}

export function mul(a: Decimal, b: Decimal): Decimal {
  return divRound(a * b, ONE);
}

export function div(a: Decimal, b: Decimal): Decimal {
  if (b === 0n) throw new RangeError("division by zero");
  return divRound(a * ONE, b);
}

/** -1, 0 or 1. */
export function cmp(a: Decimal, b: Decimal): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function min(a: Decimal, b: Decimal): Decimal {
  return a <= b ? a : b;
}

export function max(a: Decimal, b: Decimal): Decimal {
  return a >= b ? a : b;
}

/** Nearest double. Only for display and for values leaving the engine. */
export function toNumber(a: Decimal): number {
  return Number(toText(a));
}

/** Plain decimal text without trailing zeros: `74`, `-0.5`, `29.5735295625`. */
export function toText(a: Decimal): string {
  const negative = a < 0n;
  const digits = (negative ? -a : a).toString().padStart(SCALE + 1, "0");
  const int = digits.slice(0, -SCALE);
  const frac = digits.slice(-SCALE).replace(/0+$/, "");
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/**
 * Rounds to an integer with round-half-to-even (banker's rounding): ties go
 * to the even neighbour, so 0.5 → 0, 1.5 → 2, 2.5 → 2. Used for money, where
 * half-up would bias a long series of roundings upward.
 */
export function roundHalfEven(a: Decimal): bigint {
  return divRoundInteger(a, ONE, "half_even");
}

/** Rounds to an integer, halves away from zero. */
export function roundHalfUp(a: Decimal): bigint {
  return divRoundInteger(a, ONE, "half_up");
}

function divRound(n: bigint, d: bigint): Decimal {
  return divRoundInteger(n, d, "half_even") as Decimal;
}

function divRoundInteger(
  n: bigint,
  d: bigint,
  mode: "half_even" | "half_up",
): bigint {
  const negative = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  const twice = (an % ad) * 2n;
  if (twice > ad || (twice === ad && (mode === "half_up" || q % 2n === 1n))) {
    q += 1n;
  }
  return negative ? -q : q;
}
