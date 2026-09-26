import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatusIcon } from "./status-icon";

const STEPS = ["Brief", "Rules", "Plans", "Contract"] as const;

export function WorkspaceHeader({
  title,
  path,
  current,
}: {
  title: string;
  path: string;
  /** 1-based index into Brief · Rules · Plans · Contract. */
  current: number;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-graphite border-b-[3px] border-double px-4 sm:gap-6 sm:px-7">
      <Wordmark className="text-[22px]" />
      <span className="hidden h-6 w-px bg-rule sm:block" aria-hidden="true" />
      <h1 className="truncate font-serif font-semibold text-[19px] tracking-[-0.015em]">
        {title}
      </h1>
      <span className="hidden font-mono text-muted text-small md:inline">
        {path}
      </span>
      <div className="flex-1" />
      <nav aria-label="Plan progress" className="hidden lg:block">
        <ol className="flex items-center gap-2 text-small">
          {STEPS.map((step, i) => {
            const n = i + 1;
            return (
              <li key={step} className="flex items-center gap-2">
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={
                      n <= current
                        ? "w-5 border-graphite border-t"
                        : "w-5 border-pencil border-t border-dashed"
                    }
                  />
                )}
                {n < current ? (
                  <span className="flex items-center gap-1.5 font-semibold text-green-check">
                    <StatusIcon kind="done" size={14} />
                    {step}
                    <span className="sr-only">(done)</span>
                  </span>
                ) : n === current ? (
                  <span
                    aria-current="step"
                    className="flex h-7 items-center gap-1.5 rounded-pill border border-graphite bg-paper-raised px-2.5 font-semibold"
                  >
                    <span className="font-mono">{n}</span>
                    {step}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="font-mono">{n}</span>
                    {step}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <ThemeToggle />
    </header>
  );
}
