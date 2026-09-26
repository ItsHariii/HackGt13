"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  adminConfigured,
  sessionValue,
  tokenMatches,
} from "@/lib/admin";

export async function signIn(
  _prev: { error: string } | null,
  form: FormData,
): Promise<{ error: string } | null> {
  if (!adminConfigured())
    return { error: "CHAOS_ADMIN_TOKEN is not configured (16+ characters)." };
  const token = String(form.get("token") ?? "");
  if (!(await tokenMatches(token)))
    return { error: "That token is not right." };
  const value = await sessionValue();
  if (!value) return { error: "Admin sign-in is unavailable." };
  (await cookies()).set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  const next = String(form.get("next") ?? "/chaos");
  redirect(next === "/orders" ? "/orders" : "/chaos");
}

export async function signOut() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/");
}
