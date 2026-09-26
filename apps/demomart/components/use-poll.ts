"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Poll a JSON endpoint every `intervalMs`, pausing while the tab is hidden. */
export function usePoll<T>(url: string, intervalMs = 1000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (inflight.current || document.hidden) return;
    inflight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(
          res.status === 401 ? "Sign in required" : `HTTP ${res.status}`,
        );
      }
      const json = (await res.json()) as T;
      if (alive.current) {
        setData(json);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      inflight.current = false;
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [load, intervalMs]);

  return { data, error, refresh: load };
}
