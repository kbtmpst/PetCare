// A small coloured label: green for Paid, amber for Pending, blue for Refunded.
// (The shared StatusBadge is for appointment statuses, so transactions get their own tiny badge.)
const styles = {
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Refunded: "bg-sky-50 text-sky-700 ring-sky-600/20",
};

export default function TransactionStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        styles[status] ?? styles.Pending
      }`}
    >
      {status}
    </span>
  );
}
