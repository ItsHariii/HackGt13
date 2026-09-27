import type { Metadata } from "next";
import Link from "next/link";
import { AccountButton } from "@/components/auth/upgrade-dialog";
import { OrderList } from "@/components/orders/order-list";
import { storedOrders } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";

/** Reads the visitor's session and orders on every request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Profile" };

/** Profile: who you are signed in as, what Cartel bought for you, and your settings. */
export default async function ProfilePage() {
  const db = await createClient();
  const [user, orders] = await Promise.all([
    db ? db.auth.getUser().then((r) => r.data.user) : null,
    storedOrders(),
  ]);
  const saved = user && !user.is_anonymous;
  return (
    <main className="dot-grid min-h-[70vh] text-graphite">
      <div className="mx-auto flex max-w-[960px] flex-col gap-10 px-5 py-12 sm:px-8">
        <header className="flex flex-col gap-2">
          <p className="font-semibold text-meta text-muted uppercase tracking-label">
            Profile
          </p>
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            {saved ? (user.email ?? "Your account") : "Guest session"}
          </h1>
          <p className="max-w-[560px] text-graphite-2">
            {saved
              ? "Your orders and settings follow this account."
              : user
                ? "Orders made in this browser are kept for this session. Save your account to keep them."
                : "Sign in to see your orders."}
          </p>
          {!saved && (
            <div className="mt-2">
              <AccountButton />
            </div>
          )}
        </header>

        <section
          aria-labelledby="orders-heading"
          className="flex flex-col gap-4"
        >
          <h2
            id="orders-heading"
            className="font-semibold font-serif text-[28px] tracking-heading"
          >
            Orders
          </h2>
          {orders.length === 0 ? (
            <p className="sheet p-5 text-graphite-2">
              No orders yet.{" "}
              <Link href="/workspace" className="text-ink underline">
                Open a plan
              </Link>{" "}
              and check out to see its receipt here.
            </p>
          ) : (
            <OrderList orders={orders} />
          )}
        </section>

        <section
          aria-labelledby="settings-heading"
          className="flex flex-col gap-3"
        >
          <h2
            id="settings-heading"
            className="font-semibold font-serif text-[28px] tracking-heading"
          >
            Settings
          </h2>
          <ul className="flex flex-col gap-2 text-ui">
            <li>
              {/* A full page load: the card form's CSP is set for that route only. */}
              <a href="/settings/payment" className="text-ink underline">
                Payment methods
              </a>
            </li>
            <li>
              <Link href="/settings/signing" className="text-ink underline">
                Passkeys
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
