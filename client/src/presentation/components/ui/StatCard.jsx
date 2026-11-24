// On mobile the icon sits above the label so the label keeps the full card width in a 2-column grid.
// From the tablet breakpoint up, the icon moves to the right of the label.
export default function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
        <p className="text-xs font-medium text-muted sm:text-sm">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sage-100 text-sage-700 sm:h-9 sm:w-9">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight sm:mt-3 sm:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
