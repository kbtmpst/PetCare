const styles = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Confirmed: "bg-sky-50 text-sky-700 ring-sky-600/20",
  "In Progress": "bg-violet-50 text-violet-700 ring-violet-600/20",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Cancelled: "bg-stone-100 text-stone-600 ring-stone-500/20",
};

export default function StatusBadge({ status }) {
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
