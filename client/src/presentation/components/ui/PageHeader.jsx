// Title on the left, optional actions (buttons, filters) on the right.
// On mobile the actions drop below the title and use the full width.
export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">{children}</div>
      )}
    </div>
  );
}
