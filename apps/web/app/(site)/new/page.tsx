import type { Metadata } from "next";
import { BriefForm } from "@/components/new/brief-form";

export const metadata: Metadata = { title: "Start a plan" };

/** /new (TASKS T11.1; design "Brief and Requirements"). */
export default function NewPlanPage() {
  return (
    <main className="dot-grid text-graphite">
      <div className="mx-auto flex max-w-[860px] flex-col gap-8 px-5 pt-16 pb-20 sm:px-8">
        <div className="flex flex-col gap-3">
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            What do you need?
          </h1>
          <p className="text-body text-graphite-2">
            Write it the way you'd tell a friend. Budget, sizes, deadlines,
            deal-breakers.
          </p>
        </div>
        <BriefForm />
      </div>
    </main>
  );
}
