/**
 * A dashed paper skeleton (SDD §17.4: no bare spinners). The status line is
 * the text equivalent for screen readers.
 */
export function PageSkeleton({
  label,
  rows = 4,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div className="dot-grid min-h-[60vh] text-graphite">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 py-12 sm:px-8">
        <p role="status" className="text-muted text-small">
          {label}
        </p>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <div className="h-10 w-2/5 rounded-sheet border border-pencil border-dashed" />
          <div className="h-4 w-3/5 rounded-sheet border border-pencil border-dashed" />
          {Array.from({ length: rows }, (_, i) => `row-${i}`).map((k) => (
            <div
              key={k}
              className="h-20 rounded-card border border-pencil border-dashed"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
