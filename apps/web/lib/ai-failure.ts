import { AiDisabledError, AiUnavailableError } from "@cartel/ai";

/** What the UI shows when a call can't run: "off" (by config) or "unavailable". */
export function aiFailure(error: unknown): "off" | "unavailable" | null {
  if (error instanceof AiDisabledError) return "off";
  if (error instanceof AiUnavailableError) return "unavailable";
  return null;
}
