import { BadgeCheck, CircleMinus } from "lucide-react";
import { shortHash, type Verification } from "@/lib/orders";

export function VerificationBadges({ v }: { v: Verification | null }) {
  const signed = v?.signature?.status === "verified";
  return (
    <ul className="badges" aria-label="Verification">
      <li className={v?.agent ? "ok" : "none"}>
        {v?.agent ? (
          <BadgeCheck size={14} aria-hidden="true" />
        ) : (
          <CircleMinus size={14} aria-hidden="true" />
        )}
        Agent {v?.agent ? "verified" : "unknown"}
      </li>
      <li className={v?.grant?.status === "verified" ? "ok" : "none"}>
        <BadgeCheck size={14} aria-hidden="true" /> Grant verified
      </li>
      <li className={signed ? "ok" : "none"}>
        {signed ? (
          <BadgeCheck size={14} aria-hidden="true" />
        ) : (
          <CircleMinus size={14} aria-hidden="true" />
        )}
        {signed
          ? `Customer-signed contract v${v?.contract?.version} · ${shortHash(v?.contract?.bodyHash)}`
          : "Contract signature not provided"}
      </li>
    </ul>
  );
}
