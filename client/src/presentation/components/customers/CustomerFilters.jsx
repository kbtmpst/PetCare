import { RotateCcw } from "lucide-react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass } from "../ui/FormField.jsx";
import SearchInput from "../ui/SearchInput.jsx";

// The search box, the sort dropdown and the Reset button for the customers table.
// Like the appointment filters, this component keeps no state of its own: the page owns the values
// ("filters") and this component reports each change back with onChange / onReset.
export default function CustomerFilters({
  filters,
  sortOptions,
  hasFilters,
  onChange,
  onReset,
}) {
  return (
    <Card bodyClassName="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_auto] xl:items-end">
        <FormField
          label="Search"
          htmlFor="customer-search"
          className="sm:col-span-2 xl:col-span-1"
        >
          <SearchInput
            id="customer-search"
            value={filters.search}
            onChange={(search) => onChange({ ...filters, search })}
            placeholder="Name, customer ID or contact number"
          />
        </FormField>

        <FormField label="Sort by" htmlFor="customer-sort">
          <select
            id="customer-sort"
            value={filters.sort}
            onChange={(event) =>
              onChange({ ...filters, sort: event.target.value })
            }
            className={inputClass()}
          >
            {sortOptions.map((option) => (
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
