import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-card px-5 py-2.5 font-semibold text-ui transition-[transform,box-shadow] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      /* Style Tile v2: Primary (ink offset) / Secondary / Link. */
      variant: {
        default:
          "bg-graphite text-paper-raised shadow-primary hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_0_var(--color-ink)]",
        outline:
          "border border-graphite bg-paper-raised text-graphite hover:bg-paper",
        ghost: "text-graphite hover:bg-paper",
        link: "min-h-6 px-0 py-0 text-ink underline underline-offset-4 hover:text-graphite",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
function Button({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
