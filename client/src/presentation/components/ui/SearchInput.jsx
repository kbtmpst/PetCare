import { Search } from "lucide-react";

// A text box with a magnifying-glass icon, used by the filter bars on every page.
// onChange receives the new text (not the browser event), so the page can store it directly.
export default function SearchInput({ id, value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-md border border-line bg-white pl-9 pr-3 text-base outline-none placeholder:text-muted focus:border-sage-500 focus:ring-2 focus:ring-sage-200 sm:h-10 sm:text-sm"
      />
    </div>
  );
}
