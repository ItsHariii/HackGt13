import { CommandBar as Bar } from "@/components/cartel/command-bar";

/**
 * The refinement bar (TASKS T11.3). Sending a refinement needs the A4
 * patch → confirm → re-solve flow, which isn't wired into the web app yet,
 * so submitting is disabled and says so.
 */
export function CommandBar() {
  return (
    <Bar
      label="Ask Cartel to refine this plan"
      placeholder="Ask Cartel… e.g. 'Make it $100 cheaper without changing the monitor'"
      disabledReason="Refinements arrive with the AI layer. Nothing you type here is sent yet."
    />
  );
}
