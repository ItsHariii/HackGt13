/**
 * The uneven-ink filter every stamp uses (`filter: url(#stamp)`), defined
 * once per document. Values are the design's (docs/DESIGN.md).
 */
export function StampFilter() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <filter id="stamp" x="-10%" y="-20%" width="120%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.75"
            numOctaves={2}
            seed={4}
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 2.3"
            result="m"
          />
          <feComposite in="SourceGraphic" in2="m" operator="in" result="c" />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05"
            numOctaves={2}
            seed={9}
            result="w"
          />
          <feDisplacementMap
            in="c"
            in2="w"
            scale={2.4}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
