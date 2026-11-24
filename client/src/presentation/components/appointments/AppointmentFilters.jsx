import { RotateCcw } from "lucide-react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass } from "../ui/FormField.jsx";
import SearchInput from "../ui/SearchInput.jsx";

// The search box, status dropdown, date picker and Reset button.
// This component does not keep its own state. The page owns the filter values and passes them in
// ("filters"), and this component reports every change back up with onChange / onReset.
export default function AppointmentFilters({
  filters,
  statuses,
  hasFilters,
  onChange,
  onReset,
}) {
  return (
    <Card bodyClassName="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_180px_auto] xl:items-end">
        <FormField
          label="Search"
          htmlFor="filter-search"
          className="sm:col-span-2 xl:col-span-1"
        >
          <SearchInput
            id="filter-search"
            value={filters.search}
            onChange={(search) => onChange({ ...filters, search })}
            placeholder="Appointment ID, pet or owner"
          />
        </FormField>

        <FormField label="Status" htmlFor="filter-status">
          <select
            id="filter-status"
            value={filters.status}
            onChange={(event) =>
              onChange({ ...filters, status: event.target.value })
            }
            className={inputClass()}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Date" htmlFor="filter-date">
          <input
            id="filter-date"
            type="date"
            value={filters.date}
            onChange={(event) =>
              onChange({ ...filters, date: event.target.value })
            }
            className={inputClass()}
          />
        </FormField>

        <Button
          variant="secondary"
          onClick={onReset}
          disabled={!hasFilters}
          className="w-full sm:col-span-2 xl:col-span-1 xl:w-auto"
        >
          <RotateCcw size={16} />
          Reset
        </Button>
      </div>
    </Card>
  );
}
