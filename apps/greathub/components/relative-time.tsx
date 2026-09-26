"use client";
import { useEffect, useState } from "react";

export function RelativeTime({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  const label =
    s < 60
      ? `${s}s ago`
      : s < 3600
        ? `${Math.floor(s / 60)}m ago`
        : `${Math.floor(s / 3600)}h ago`;
  return (
    <time dateTime={iso} title={new Date(iso).toISOString()}>
      {label}
    </time>
  );
}
