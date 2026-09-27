import { LandingFooter, LandingNav } from "@/components/site/landing-chrome";

/** Landing v2: the kraft desk with its own nav and torn footer. */
export default function LandingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="kraft-desk overflow-x-clip">
      <LandingNav />
      {children}
      <LandingFooter />
    </div>
  );
}
