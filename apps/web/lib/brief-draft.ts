import {
  type AiRunner,
  type RequirementSet,
  streamRequirements,
} from "@cartel/ai";
import type { Pack } from "@cartel/proof-engine";
import { aiFailure } from "./ai-failure";

/*
 * A1 for a saved plan as an NDJSON stream (SDD §10.1, TASKS T11.2), so the
 * review page fills in while the model writes. Nothing is saved here; the
 * shopper confirms on the page and `saveRequirements` stores the set.
 *   {"type":"partial","requirements":[…],"questions":[…]}
 *   {"type":"done","pack":…,"requirements":[…],"questions":[…]}
 *   {"type":"error","reason":"off"|"unavailable"}
 */

export type DraftLine =
  | ({ type: "partial" } & Pick<RequirementSet, "requirements" | "questions">)
  | ({ type: "done" } & Pick<
      RequirementSet,
      "pack" | "requirements" | "questions"
    >)
  | { type: "error"; reason: "off" | "unavailable" };

export type DraftPlan = {
  id: string;
  brief: string;
  packs: readonly Pack[];
};

export function briefDraftStream(
  router: AiRunner,
  plan: DraftPlan,
  options: {
    signal?: AbortSignal;
    today?: string;
    /** Called once with the pack A1 matched, before the final line. */
    onPack?: (pack: string) => Promise<void>;
    onError?: (error: unknown) => void;
  } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: DraftLine) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      try {
        const stream = await streamRequirements(router, {
          brief: plan.brief,
          packs: plan.packs,
          planId: plan.id,
          today: options.today ?? new Date().toISOString().slice(0, 10),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        // If the partials throw, `completed` rejects too; it's handled below.
        stream.completed.catch(() => {});
        let seen = "";
        for await (const part of stream.partials) {
          // Only whole drafts count; skip lines that add nothing new.
          const key = `${part.requirements.length}:${part.questions.length}`;
          if (key === seen) continue;
          seen = key;
          send({
            type: "partial",
            requirements: part.requirements,
            questions: part.questions,
          });
        }
        const done = await stream.completed;
        if (done.pack) await options.onPack?.(done.pack);
        send({
          type: "done",
          pack: done.pack,
          requirements: done.requirements,
          questions: done.questions,
        });
      } catch (error) {
        if (!options.signal?.aborted) {
          const reason = aiFailure(error) ?? "unavailable";
          if (reason === "unavailable") options.onError?.(error);
          send({ type: "error", reason });
        }
      } finally {
        controller.close();
      }
    },
  });
}
