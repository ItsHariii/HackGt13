import { demoMode } from "@/lib/config";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Mock CPSC (demo). Mirrors the shape of saferproducts.gov's Recall API for
 * recalls posted by the Chaos Panel's recall_posted mutation. Demo mode only,
 * and labeled in every response so it can never pass for the real feed.
 */
export async function GET(request: Request) {
  if (!demoMode()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const name = (url.searchParams.get("ProductName") ?? "").trim().toLowerCase();
  const number = url.searchParams.get("RecallNumber");
  const { data, error } = await db()
    .from("mock_recalls")
    .select(
      "recall_number, sku, hazard, remedy, posted_at, variants(gtin, mpn, listings(title), products(brand, name))",
    )
    .order("posted_at", { ascending: false });
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });
  const recalls = (data ?? [])
    .map((r) => {
      const v = r.variants as unknown as {
        gtin: string;
        mpn: string;
        listings: { title: string } | null;
        products: { brand: string; name: string } | null;
      } | null;
      return {
        RecallNumber: r.recall_number,
        RecallDate: r.posted_at,
        Title:
          `${v?.products?.brand ?? ""} ${v?.listings?.title ?? r.sku} recalled (DEMO)`.trim(),
        Description:
          "Mock CPSC (demo). Posted by the DemoMart Chaos Panel. Not a real recall.",
        Products: [
          {
            Name: v?.listings?.title ?? r.sku,
            Model: r.sku,
            Type: v?.products?.name ?? "",
          },
        ],
        Manufacturers: [{ Name: v?.products?.brand ?? "" }],
        ProductUPCs: v ? [{ UPC: v.gtin }] : [],
        Hazards: [{ Name: r.hazard }],
        Remedies: [{ Name: r.remedy }],
        URL: `${url.origin}${url.pathname}?RecallNumber=${r.recall_number}`,
      };
    })
    .filter((r) => !number || r.RecallNumber === number)
    .filter(
      (r) =>
        !name ||
        `${r.Title} ${r.Products[0]?.Name} ${r.Products[0]?.Model}`
          .toLowerCase()
          .includes(name),
    );
  return Response.json(recalls, {
    headers: {
      "Cache-Control": "no-store",
      "X-Mock-Source": "Mock CPSC (demo)",
    },
  });
}
