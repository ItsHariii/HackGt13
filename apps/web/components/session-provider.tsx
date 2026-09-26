"use client";
import type { User } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/browser";

type SessionState = {
  status: "loading" | "ready" | "unconfigured" | "error";
  user: User | null;
};
const SessionContext = createContext<SessionState>({
  status: "loading",
  user: null,
});
// Deduplicates Strict Mode and concurrent mounts. Supabase persists the session in cookies.
let bootstrap: Promise<User> | undefined;
async function ensureSession() {
  const client = createClient();
  if (!client) throw new Error("Supabase is not configured");
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session.user;
  const signedIn = await client.auth.signInAnonymously();
  if (signedIn.error) throw signedIn.error;
  if (!signedIn.data.user) throw new Error("No anonymous identity returned");
  return signedIn.data.user;
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: "loading",
    user: null,
  });
  useEffect(() => {
    const client = createClient();
    if (!client) {
      setState({ status: "unconfigured", user: null });
      return;
    }
    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (active && session) setState({ status: "ready", user: session.user });
    });
    bootstrap ??= ensureSession();
    void bootstrap
      .then((user) => {
        if (active) setState({ status: "ready", user });
      })
      .catch(() => {
        bootstrap = undefined;
        if (active) setState({ status: "error", user: null });
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return (
    <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
  );
}
export const useSession = () => useContext(SessionContext);
