import "server-only";
import { db } from "./supabase/admin";
import type { Tables } from "./supabase/db";

export type OrderRow = Tables<{ schema: "greathub" }, "orders">;

export interface Verification {
  contract?: {
    id: string;
    version: number;
    bodyHash: string;
    expiresAt: string;
  };
  grant?: {
    status: string;
    id: string;
    maxTotalMinor: number;
    expiresAt: number;
  };
  signature?: {
    status: "verified" | "absent";
    credentialId?: string;
    signedAt?: string;
    userVerified?: boolean;
  };
  agent?: { keyId: string; tag: string | null };
  verifiedAt?: string;
}

export interface Payment {
  rail?: string;
  railLabel?: string;
  transactionId?: string | null;
  status?: string;
  reconciliationId?: string | null;
  approvalCode?: string | null;
  reference?: string;
}

export const NEXT_STATUSES: Record<string, string[]> = {
  created: ["confirmed", "manual_review", "canceled"],
  manual_review: ["confirmed", "canceled"],
  confirmed: ["shipped", "canceled"],
  shipped: ["fulfilled"],
  fulfilled: [],
  canceled: [],
};

export async function listOrders(): Promise<OrderRow[]> {
  const { data, error } = await db()
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`orders query failed: ${error.message}`);
  return data ?? [];
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  if (!/^dm_ord_[A-Za-z0-9]{1,64}$/.test(id)) return null;
  const { data, error } = await db()
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`order query failed: ${error.message}`);
  return data;
}

export function shortHash(hash: string | undefined): string {
  return hash ? `${hash.slice(0, 7 + 8)}…${hash.slice(-4)}` : "—";
}
