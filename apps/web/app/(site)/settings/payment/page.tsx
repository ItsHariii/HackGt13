import { PaymentSettings } from "@/components/payments/payment-settings";
import { checkoutReturn } from "@/lib/checkout-return";

export default async function Page({
  searchParams,
}: PageProps<"/settings/payment">) {
  const returnTo = checkoutReturn((await searchParams).return);
  return <PaymentSettings returnTo={returnTo} />;
}
