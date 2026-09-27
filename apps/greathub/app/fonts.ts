import { Hubot_Sans, Mona_Sans } from "next/font/google";
import localFont from "next/font/local";

/* GreatHub type (Style Tile): Hubot Sans for display and the wordmark,
   Mona Sans for UI and body, Monaspace Neon for prices, SKUs, hashes and
   logs. All three are OFL; Monaspace is bundled from app/fonts. */

export const display = Hubot_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

export const ui = Mona_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-ui",
  display: "swap",
});

export const code = localFont({
  src: [
    { path: "./fonts/MonaspaceNeon-Regular.woff", weight: "400" },
    { path: "./fonts/MonaspaceNeon-SemiBold.woff", weight: "600" },
  ],
  variable: "--font-code",
  display: "swap",
});
