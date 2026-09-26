export default function PlanLayout({
  children,
  drawer,
}: LayoutProps<"/plans/[id]">) {
  return (
    <>
      {children}
      {drawer}
    </>
  );
}
