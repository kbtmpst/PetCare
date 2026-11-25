import Card from "../ui/Card.jsx";

// A white card with a title, a short description and a chart area.
// When "isEmpty" is true it shows the message instead of the chart, so an empty date range never shows an
// empty axis or fake data.
//   heightClass: the height of the chart area (Tailwind classes)
export default function ChartCard({
  title,
  description,
  isEmpty,
  emptyMessage,
  heightClass = "h-56 sm:h-64",
  className = "",
  children,
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Card title={title}>
        {description && (
          <p className="-mt-1 mb-3 text-xs text-muted">{description}</p>
        )}
        {isEmpty ? (
          <div
            className={`flex items-center justify-center rounded-md bg-canvas px-4 text-center ${heightClass}`}
          >
            <p className="text-sm text-muted">{emptyMessage}</p>
          </div>
        ) : (
          <div className={heightClass}>{children}</div>
        )}
      </Card>
    </div>
  );
}
