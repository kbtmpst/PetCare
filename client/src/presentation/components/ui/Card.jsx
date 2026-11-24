export default function Card({
  title,
  action,
  children,
  bodyClassName = "p-4 sm:p-5",
}) {
  return (
    // min-w-0 lets the card shrink inside grid layouts so charts and long text never push the page wider
    <section className="min-w-0 rounded-lg border border-line bg-white shadow-sm">
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
