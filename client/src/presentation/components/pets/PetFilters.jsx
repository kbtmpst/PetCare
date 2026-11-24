import { RotateCcw } from "lucide-react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass } from "../ui/FormField.jsx";
import SearchInput from "../ui/SearchInput.jsx";

// The search box, the species dropdown and the Reset button for the pets table.
// The page owns the values ("filters") and this component reports each change back with onChange / onReset.
export default function PetFilters({
  filters,
  speciesOptions,
  hasFilters,
  onChange,
  onReset,
}) {
  return (
    <Card bodyClassName="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_auto] xl:items-end">
        <FormField
          label="Search"
          htmlFor="pet-search"
          className="sm:col-span-2 xl:col-span-1"
        >
          <SearchInput
            id="pet-search"
            value={filters.search}
            onChange={(search) => onChange({ ...filters, search })}
            placeholder="Pet name, owner, breed or pet ID"
          />
        </FormField>

        <FormField label="Species" htmlFor="pet-species">
          <select
            id="pet-species"
            value={filters.species}
            onChange={(event) =>
              onChange({ ...filters, species: event.target.value })
            }
            className={inputClass()}
          >
            <option value="">All species</option>
            {speciesOptions.map((species) => (
              <option key={species} value={species}>
                {species}
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
