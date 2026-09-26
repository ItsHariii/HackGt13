import type { ReactNode } from "react";

export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex max-w-[640px] flex-col gap-2">
      {eyebrow && (
        <p className="font-semibold text-graphite-2 text-meta uppercase tracking-label">
          {eyebrow}
        </p>
      )}
      <h2
        id={id}
        className="font-semibold font-serif text-h3 tracking-heading sm:text-h2"
      >
        {title}
      </h2>
      {children && <p className="text-body text-graphite-2">{children}</p>}
    </div>
  );
}
