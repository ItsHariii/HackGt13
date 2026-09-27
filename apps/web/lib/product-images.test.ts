import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; gtin: string | null; image_url: string | null };
const rows: Row[] = [
  {
    id: "42efbc2d-22ed-4fb7-86dd-cc5cbe54bc78",
    gtin: "00812345000078",
    image_url: "https://greathub.example/products/birchline-mini-desk-44.webp",
  },
  {
    id: "0b7c7c0e-6f7c-4a57-9d1e-3a1f2b9c8d01",
    gtin: "00812345000108",
    image_url: null,
  },
];

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const q = {
          filter: (_: Row) => true,
          in(column: "id" | "gtin", values: string[]) {
            const prev = q.filter;
            q.filter = (r) => prev(r) && values.includes(r[column] ?? "");
            return q;
          },
          not() {
            const prev = q.filter;
            q.filter = (r) => prev(r) && r.image_url !== null;
            return q;
          },
          // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable Supabase query builder
          then(resolve: (v: { data: Row[] }) => void) {
            resolve({ data: rows.filter(q.filter) });
          },
        };
        return q;
      },
    }),
  }),
}));

const { productImages } = await import("./product-images");

describe("productImages", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SECRET_KEY = "test";
  });

  it("finds catalog photos for checkout offers named product:{gtin}", async () => {
    const images = await productImages([
      "product:00812345000078",
      "product:00812345000108",
    ]);
    expect(images.get("product:00812345000078")).toBe(
      "https://greathub.example/products/birchline-mini-desk-44.webp",
    );
    expect(images.has("product:00812345000108")).toBe(false);
  });

  it("still finds catalog photos by row ID", async () => {
    const images = await productImages([
      "42efbc2d-22ed-4fb7-86dd-cc5cbe54bc78",
    ]);
    expect(images.size).toBe(1);
  });

  it("ignores IDs it can't look up", async () => {
    expect((await productImages(["checkout:abc", "product:x"])).size).toBe(0);
  });
});
