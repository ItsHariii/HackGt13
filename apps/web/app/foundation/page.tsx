import { RealtimeSpike } from "@/components/realtime-spike";
export const metadata = { title: "Foundation status" };
export default function Foundation() {
  return (
    <main className="lab">
      <p className="eyebrow">Developer tools / Phase 1</p>
      <h1>Check the foundations.</h1>
      <p>
        This isolated test checks anonymous identity, database permissions, and
        private broadcasts. It creates no shopping plan or payment.
      </p>
      <RealtimeSpike />
      <p className="text-sm">
        Readiness:{" "}
        <a className="text-link" href="/api/health">
          Cartel health ↗
        </a>
      </p>
    </main>
  );
}
