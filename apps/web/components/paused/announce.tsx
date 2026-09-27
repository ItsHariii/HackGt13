"use client";
import { useEffect, useState } from "react";

/**
 * An assertive live region that speaks once the page is interactive, so
 * screen readers announce the pause even on a fresh page load (Motion
 * board 05: "Purchase paused. No payment was made. …").
 */
export function Announce({ text }: { text: string }) {
  const [said, setSaid] = useState("");
  useEffect(() => {
    const t = requestAnimationFrame(() => setSaid(text));
    return () => cancelAnimationFrame(t);
  }, [text]);
  return (
    <p aria-live="assertive" className="sr-only">
      {said}
    </p>
  );
}
