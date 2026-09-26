import { STATUS, type Status } from "@/lib/status";
import { cn } from "@/lib/utils";

/** A status as icon + label, never color alone (SDD §17.7). */
export function StatusMark({
  status,
  label,
  hideLabel = false,
  size = 16,
  className,
}: {
  status: Status;
  /** Overrides the default label ("Pass", "Can't check", …). */
  label?: string | undefined;
  /** Icon only, with the label kept for screen readers. */
  hideLabel?: boolean | undefined;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const s = STATUS[status];
  const Icon = s.icon;
  const text = label ?? s.label;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold",
        s.text,
        className,
      )}
    >
      <Icon size={size} strokeWidth={2.4} aria-hidden="true" />
      <span className={cn(hideLabel && "sr-only")}>{text}</span>
    </span>
  );
}
