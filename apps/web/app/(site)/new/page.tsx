import type { Metadata } from "next";
import { BriefForm } from "@/components/new/brief-form";

export const metadata: Metadata = { title: "Start a plan" };

/** /new (TASKS T11.1; design "Brief and Requirements", New brief frame). */
export default function NewPlanPage() {
  return (
    <main className="dot-grid text-graphite">
      <div className="mx-auto flex max-w-[920px] flex-col gap-7 px-5 pt-[72px] pb-24 sm:px-0">
        <div className="flex flex-col gap-2.5">
          <h1 className="font-semibold font-serif text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[52px]">
            What do you need?
          </h1>
          <p className="text-[18px] text-graphite-2 leading-normal">
            Write it the way you&apos;d tell a friend. Budget, sizes, deadlines,
            deal-breakers.
          </p>
        </div>
        <BriefForm />
      </div>
    </main>
  );
}
