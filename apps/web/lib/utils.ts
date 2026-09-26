import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge that knows the Cartel type scale (cartel-tokens.css), so
 * `text-meta` is a font size, not a color that a later `text-ink` replaces. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "meta",
            "small",
            "ui",
            "body",
            "h4",
            "h3",
            "h2",
            "h1",
            "display",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
