import { RotateCcw } from "lucide-react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass } from "../ui/FormField.jsx";
import SearchInput from "../ui/SearchInput.jsx";

// The search box, the status dropdown and the Reset button for the services table.
// This component keeps no state of its own: the page owns the values ("filters") and this component
// reports each change back with onChange / onReset.
export default function ServiceFilters({
  filters,
  statusOptions,
  hasFilters,
  onChange,
  onReset,
}) {
  return (
    <Card bodyClassName="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_auto] xl:items-end">
        <FormField
          label="Search"
          htmlFor="service-search"
          className="sm:col-span-2 xl:col-span-1"
        >
          <SearchInput
            id="service-search"
            value={filters.search}
            onChange={(search) => onChange({ ...filters, search })}
            placeholder="Service name or description"
          />
        </FormField>

        <FormField label="Status" htmlFor="service-status">
          <select
            id="service-status"
            value={filters.status}
            onChange={(event) =>
              onChange({ ...filters, status: event.target.value })
            }
            className={inputClass()}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>

        <Button
          variant="secondary"
          onClick={onReset}
          disabled={!hasFilters}
          className="w-full xl:w-auto"
        >
          <RotateCcw size={16} />
          Reset
        </Button>
      </div>
    </Card>
  );
}
