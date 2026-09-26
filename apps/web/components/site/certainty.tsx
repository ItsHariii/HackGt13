import { EvidenceBadge } from "@/components/cartel/evidence-badge";
import { RequirementChip } from "@/components/cartel/requirement-chip";
import { Stamp } from "@/components/paper/stamp";

/**
 * "Pencil, ink, stamp": how sure Cartel is shows in how each thing is
 * drawn (SDD §17.7). Shared by the landing and /trust.
 */
export function Certainty() {
  const card = "sheet flex flex-col gap-3 p-5";
  return (
    <ol className="grid gap-5 md:grid-cols-3">
      <li className={card}>
        <h3 className="font-serif text-h4">Pencil</h3>
        <p className="text-graphite-2 text-small">
          A guess. Dashed and gray until you confirm it, and never counted as a
          pass.
        </p>
        <p className="mt-auto flex flex-wrap gap-2">
          <RequirementChip kind="assumed" />
          <EvidenceBadge level="estimate" />
        </p>
      </li>
      <li className={card}>
        <h3 className="font-serif text-h4">Ink</h3>
        <p className="text-graphite-2 text-small">
          A source said so, and Cartel shows which one and when.
        </p>
        <p className="mt-auto flex flex-wrap gap-2">
          <EvidenceBadge level="manufacturer" />
          <EvidenceBadge level="confirmed" detail="Merchant checkout" />
        </p>
      </li>
      <li className={card}>
        <h3 className="font-serif text-h4">Stamp</h3>
        <p className="text-graphite-2 text-small">
          Committed: a version you signed, or a payment that went through.
        </p>
        <p className="mt-auto flex flex-wrap items-center gap-4 pt-1">
          <Stamp tone="signed" size="sm">
            SIGNED v7
          </Stamp>
          <Stamp tone="paid" size="sm">
            PAID
          </Stamp>
        </p>
      </li>
    </ol>
  );
}
