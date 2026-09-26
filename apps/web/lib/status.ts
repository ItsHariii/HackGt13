import {
  Check,
  CircleHelp,
  createLucideIcon,
  Info,
  type LucideIcon,
  X,
} from "lucide-react";

/** lucide has no tilde in this version; drawn on its 24 px grid. */
const Tilde = createLucideIcon("tilde", [
  ["path", { d: "M4 14c2.7-4 5.3-4 8 0s5.3 4 8 0", key: "tilde" }],
]);

/** The status vocabulary of Style Tile v2. Color never carries a status on
 * its own (SDD §17.7): every status has its own icon shape and text label,
 * and `text-*` / `border-*` utilities from the `--color-{status}` tokens. */
export type Status = "pass" | "fail" | "unknown" | "estimate" | "info";

export const STATUS: Record<
  Status,
  { label: string; icon: LucideIcon; text: string; border: string }
> = {
  pass: {
    label: "Pass",
    icon: Check,
    text: "text-pass",
    border: "border-pass",
  },
  fail: { label: "Fail", icon: X, text: "text-fail", border: "border-fail" },
  unknown: {
    label: "Can't check",
    icon: CircleHelp,
    text: "text-unknown",
    border: "border-unknown",
  },
  estimate: {
    label: "Estimate",
    icon: Tilde,
    text: "text-estimate",
    border: "border-estimate border-dashed",
  },
  info: { label: "Info", icon: Info, text: "text-info", border: "border-info" },
};
