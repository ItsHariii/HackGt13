import { CheckoutPanel } from "@/components/payments/checkout-panel";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CheckoutPanel planId={id} />;
}
