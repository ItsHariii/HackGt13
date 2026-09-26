import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATUS } from "./status";

const css = readFileSync(
  new URL("../app/cartel-tokens.css", import.meta.url),
  "utf8",
);

function colors(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );
}

const paper = colors(css.slice(css.indexOf("@theme {"), css.indexOf("}")));
const blueprintStart = css.indexOf("/* Blueprint (dark) */");
const blueprint = {
  ...paper,
  ...colors(css.slice(blueprintStart, css.indexOf("}", blueprintStart))),
};

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

const surfaces = ["paper", "paper-raised", "paper-sheet", "paper-shade"];
const bodyText = ["graphite", "graphite-2", "muted", "ink", "red-pen"];
const statusText = ["green-check", "red-pen", "ink", "graphite"];

/** [foreground, background, minimum ratio] actually used by the screens. */
const pairings: [string, string, number][] = [
  ...surfaces.flatMap((bg) =>
    [...new Set([...bodyText, ...statusText])].map(
      (fg) => [fg, bg, 4.5] as [string, string, number],
    ),
  ),
  // `pencil` is large text, dashed outlines and icons next to a label only.
  ...surfaces.map((bg) => ["pencil", bg, 3] as [string, string, number]),
  ["red-pen", "red-pen-wash", 4.5], // failing proof row
  ["graphite", "red-pen-wash", 4.5],
  ["graphite", "tag", 4.5], // Default chip
  ["muted", "rule-soft", 4.5], // disabled button
  ["graphite", "desk", 4.5],
];

describe.each([
  ["paper", paper],
  ["blueprint", blueprint],
] as const)("%s theme contrast", (_, theme) => {
  it.each(pairings)("%s on %s ≥ %s:1", (fg, bg, min) => {
    const [a, b] = [theme[fg], theme[bg]];
    expect(a, `--color-${fg}`).toMatch(/^#/);
    expect(b, `--color-${bg}`).toMatch(/^#/);
    expect(contrast(a as string, b as string)).toBeGreaterThanOrEqual(min);
  });
});

/** `bg` at `alpha` over `base`, as the .mark-highlight tint draws it. */
function tint(bg: string, alpha: number, base: string): string {
  const ch = (h: string, i: number) => Number.parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(ch(bg, i) * alpha + ch(base, i) * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

describe("highlighter behind quoted evidence", () => {
  it.each([
    ["paper", paper, 0.6],
    ["blueprint", blueprint, 0.24],
  ] as const)("%s: graphite on the tint ≥ 4.5:1", (_, theme, alpha) => {
    for (const base of surfaces) {
      const bg = tint(
        theme.highlighter as string,
        alpha,
        theme[base] as string,
      );
      expect(contrast(theme.graphite as string, bg)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});

describe("tokens", () => {
  it("Blueprint overrides the palette", () => {
    expect(blueprint.paper).not.toBe(paper.paper);
    expect(blueprint.ink).not.toBe(paper.ink);
  });

  it("keeps the Style Tile v2 values", () => {
    expect(paper).toMatchObject({
      paper: "#fbf7ee",
      "paper-sheet": "#ffffff",
      rule: "#ddd5c4",
      "rule-soft": "#eee9df",
      "graphite-2": "#3a3935",
      muted: "#5e5b56",
      "red-pen-wash": "#fbedeb",
      tape: "#e8ddb5",
      desk: "#e9e3d6",
    });
  });

  it("defines a token for every status", () => {
    for (const status of Object.keys(STATUS)) {
      expect(css).toContain(`--color-${status}:`);
    }
  });
});

describe("status vocabulary", () => {
  it("gives every status its own icon and label", () => {
    const all = Object.values(STATUS);
    expect(new Set(all.map((s) => s.icon)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.label)).size).toBe(all.length);
  });
});
