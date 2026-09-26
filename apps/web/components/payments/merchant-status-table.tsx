export type MerchantStatus = {
  merchant: string;
  status: string;
  versionId: string;
  contractStatus: string;
  executable: boolean;
  handoff?: boolean;
};
const labels: Record<string, string> = {
  paid: "Paid",
  failed: "Failed",
  not_attempted: "Not attempted",
  reconcile_required: "Awaiting reconciliation",
};
export function MerchantStatusTable({
  merchants,
}: {
  merchants: MerchantStatus[];
}) {
  return (
    <section className="my-8">
      <h2 className="font-serif text-2xl">Each store, its own purchase.</h2>
      <p className="mt-2 text-sm text-muted">
        A payment at one store can succeed while another fails. Completed
        payments are not automatically reversed.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-y border-border text-left">
          <caption className="sr-only">Payment status by merchant</caption>
          <thead>
            <tr>
              <th className="py-3 pr-4">Store</th>
              <th className="py-3">Payment status</th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((m) => (
              <tr key={m.merchant} className="border-t border-border">
                <th className="py-4 pr-4 font-normal">{m.merchant}</th>
                <td className="py-4">{labels[m.status] ?? m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
