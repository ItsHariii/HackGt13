import type { Metadata } from "next";
import { ExploreDemo } from "@/components/dev/explore-demo";

export const metadata: Metadata = {
  title: "Explore layout",
  robots: { index: false },
};

/** The Explore layout with example data (TASKS T10.4). */
export default function LayoutsPage() {
  return (
    <div className="dot-grid text-graphite">
      <ExploreDemo />
    </div>
  );
}
