import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Search } from "lucide-react";

export default function Header({ onMenuClick }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // Sends the search term to the Appointments page, which will read ?search= when it is built.
  function handleSubmit(event) {
    event.preventDefault();
    const term = query.trim();
    navigate(
      term
        ? `/appointments?search=${encodeURIComponent(term)}`
        : "/appointments",
    );
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white/90 px-3 backdrop-blur sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
      {/* Hamburger: shown while the sidebar is a drawer (below 769px). 44px tap target. */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-sage-50 hover:text-ink md:hidden"
      >
        <Menu size={22} />
      </button>

      <form
        onSubmit={handleSubmit}
        className="relative min-w-0 max-w-md flex-1"
      >
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        {/* text-base on mobile stops iOS from zooming the page when the input is focused */}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search appointments..."
          aria-label="Search appointments"
          className="h-11 w-full rounded-md border border-line bg-canvas pl-9 pr-3 text-base outline-none placeholder:text-muted focus:border-sage-500 focus:ring-2 focus:ring-sage-200 sm:h-10 sm:text-sm"
        />
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">Admin</p>
          <p className="text-xs text-muted">Shop Manager</p>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-600 text-sm font-semibold text-white"
          aria-hidden="true"
        >
          A
        </div>
      </div>
    </header>
  );
}
