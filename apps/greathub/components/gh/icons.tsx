import type { SVGProps } from "react";

/*
 * GreatHub's icon set (Style Tile): drawn on a 24-unit grid, 1.8 px
 * strokes, `currentColor` so each icon takes its surrounding text color.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The porthole with Captain Inkwell peeking through: the wordmark's badge. */
export function PortholeLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#B8893A" />
      <circle
        cx="20"
        cy="20"
        r="13"
        fill="#15314A"
        stroke="#0B1B2B"
        strokeWidth="1.5"
      />
      <circle cx="20" cy="4.6" r="1.2" fill="#0B1B2B" />
      <circle cx="20" cy="35.4" r="1.2" fill="#0B1B2B" />
      <circle cx="4.6" cy="20" r="1.2" fill="#0B1B2B" />
      <circle cx="35.4" cy="20" r="1.2" fill="#0B1B2B" />
      <path d="M10 31c1-5 5-8 10-8s9 3 10 8z" fill="#F4ECDD" />
      <path
        d="M12.5 21.5c1-4 4.2-6 7.5-6s6.5 2 7.5 6z"
        fill="#F4ECDD"
        stroke="#0B1B2B"
      />
      <rect x="11.5" y="20.5" width="17" height="2.4" rx="1.2" fill="#0B1B2B" />
      <path
        d="M15 27.5q1.6-1.4 3.2 0"
        stroke="#0B1B2B"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="23.6" cy="27" rx="1.5" ry="2" fill="#0B1B2B" />
    </svg>
  );
}

export const Anchor = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="5" r="2.2" />
    <path d="M12 7.2V21M8 11h8M4.5 14.5c.5 3.6 3.6 6.5 7.5 6.5s7-2.9 7.5-6.5" />
  </Icon>
);

export const Starfish = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.5l2.4 6.3 6.8.4-5.3 4.3 1.8 6.6L12 16.4l-5.7 3.7 1.8-6.6-5.3-4.3 6.8-.4z" />
  </Icon>
);

export const Fishhook = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="15" cy="4" r="1.8" />
    <path d="M15 5.8V15a5 5 0 0 1-10 0v-2.5l2.5 2" />
  </Icon>
);

export const Bell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v2M7 17V11a5 5 0 0 1 10 0v6l2 2H5z" />
    <circle cx="12" cy="21" r="1.3" />
    <path d="M9 3h6" />
  </Icon>
);

export const Crate = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8l9-4 9 4v9l-9 4-9-4z" />
    <path d="M3 8l9 4 9-4M12 12v9" />
  </Icon>
);

export const Logbook = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" />
  </Icon>
);

export const Dock = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 18h18M5 18V9l7-4 7 4v9M9 18v-5h6v5" />
  </Icon>
);

/** Catalog view toggle: the commit-row list. */
export const ListRows = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </Icon>
);

/** Catalog view toggle: full-width cards, one porthole each. */
export const Portholes = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
    <circle cx="7" cy="7" r="1.6" />
    <circle cx="17" cy="7" r="1.6" />
    <circle cx="7" cy="17" r="1.6" />
    <circle cx="17" cy="17" r="1.6" />
  </Icon>
);

export const Search = (p: IconProps) => (
  <Icon {...p} strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
);

export const Lock = (p: IconProps) => (
  <Icon {...p} strokeWidth="2">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p} strokeWidth="3">
    <path d="M4 12.5l5 5L20 6.5" />
  </Icon>
);

export const Cross = (p: IconProps) => (
  <Icon {...p} strokeWidth="3.4">
    <path d="M5 5l14 14M19 5L5 19" />
  </Icon>
);

export const Play = ({ size = 16, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...rest}
  >
    <path d="M7 4l13 8-13 8z" />
  </svg>
);

export const Undo = (p: IconProps) => (
  <Icon {...p} strokeWidth="2">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);

export const Copy = (p: IconProps) => (
  <Icon {...p} strokeWidth="2">
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Icon>
);

/** Marks a spec row that differs from the seeded listing. */
export const GullFootprint = (p: IconProps) => (
  <Icon {...p} strokeWidth="2.4" style={{ transform: "rotate(18deg)" }}>
    <path d="M12 21V11M12 11L5 4M12 11l7-7M12 11V3" />
  </Icon>
);

export const Knot = (p: IconProps) => (
  <Icon {...p} strokeWidth="2.2">
    <path d="M6 12c0-4 12-4 12 0s-12 4-12 0z" />
    <path d="M12 8v8" />
  </Icon>
);

/** The bobbing buoy beside "Live" on the Harbor Master's Log. */
export function Buoy() {
  return (
    <svg
      width="28"
      height="32"
      viewBox="0 0 28 32"
      aria-hidden="true"
      className="gh-buoy"
    >
      <path
        d="M6 26 Q14 30 22 26 L19 12 H9 Z"
        fill="#D2452F"
        stroke="#0B1B2B"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M7.5 19 H20.5" stroke="#FFFFFF" strokeWidth="3" />
      <path d="M14 12 V4" stroke="#0B1B2B" strokeWidth="2" />
      <circle
        cx="14"
        cy="4"
        r="3"
        fill="#E8C77E"
        stroke="#0B1B2B"
        strokeWidth="2"
      />
      <path
        d="M1 29 Q7 26 14 29 T27 29"
        fill="none"
        stroke="#1E7A4E"
        strokeWidth="2"
      />
    </svg>
  );
}

export function Lighthouse() {
  return (
    <svg
      width="44"
      height="56"
      viewBox="0 0 44 56"
      aria-hidden="true"
      className="gh-lighthouse"
    >
      <path
        d="M16 54l3-34h6l3 34z"
        fill="#F4ECDD"
        stroke="#0B1B2B"
        strokeWidth="2"
      />
      <path d="M17.5 38h9M18.5 28h7" stroke="#D2452F" strokeWidth="4" />
      <rect
        x="15"
        y="10"
        width="14"
        height="10"
        rx="1"
        fill="#E8C77E"
        stroke="#0B1B2B"
        strokeWidth="2"
      />
      <path
        d="M14 10l8-7 8 7z"
        fill="#D2452F"
        stroke="#0B1B2B"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
