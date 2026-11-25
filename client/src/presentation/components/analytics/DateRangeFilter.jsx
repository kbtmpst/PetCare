import Card from "../ui/Card.jsx";
import FormField, { inputClass } from "../ui/FormField.jsx";

// The date range controls: a dropdown of ready-made ranges, plus a start and end date when "Custom range"
// is chosen. This component keeps no state of its own: the page owns the filter and this component reports
// every change back with the two callbacks.
//   filter:         { preset, start, end }
//   presets:        [{ value, label }]
//   rangeLabel:     text describing the range that is currently shown, for example "Oct 27 – Nov 25, 2026"
//   error:          a message when the custom dates are not valid (the page keeps showing the last good range)
//   onPresetChange: called with the chosen preset value
//   onDateChange:   called with ("start" | "end", "YYYY-MM-DD")
export default function DateRangeFilter({
  filter,
  presets,
  rangeLabel,
  error,
  onPresetChange,
  onDateChange,
}) {
  const isCustom = filter.preset === "custom";

  return (
    <Card bodyClassName="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[220px_180px_180px_minmax(0,1fr)] xl:items-end">
        <FormField label="Date range" htmlFor="range-preset">
          <select
            id="range-preset"
            value={filter.preset}
            onChange={(event) => onPresetChange(event.target.value)}
            className={inputClass()}
          >
            {presets.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </FormField>

        {isCustom && (
          <>
            <FormField label="Start date" htmlFor="range-start">
              <input
                id="range-start"
                type="date"
                value={filter.start}
                onChange={(event) => onDateChange("start", event.target.value)}
                className={inputClass(Boolean(error))}
              />
            </FormField>

            <FormField label="End date" htmlFor="range-end">
              <input
                id="range-end"
                type="date"
                value={filter.end}
                onChange={(event) => onDateChange("end", event.target.value)}
                className={inputClass(Boolean(error))}
              />
            </FormField>
          </>
        )}

        <p className="text-sm text-muted sm:col-span-2 xl:col-span-1 xl:col-start-4 xl:pb-2.5 xl:text-right">
          {rangeLabel && (
            <>
              Showing <span className="font-medium text-ink">{rangeLabel}</span>
            </>
          )}
        </p>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error} The charts still show the last valid range.
        </p>
      )}
    </Card>
  );
}
