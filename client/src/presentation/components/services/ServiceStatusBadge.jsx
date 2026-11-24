// A small coloured label: green for Active, grey for Inactive.
// (The shared StatusBadge is for appointment statuses, so services get their own tiny badge.)
const styles = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Inactive: "bg-stone-100 text-stone-600 ring-stone-500/20",
};

export default function ServiceStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        styles[status] ?? styles.Inactive
      }`}
    >
      {status}
    </span>
  );
}
