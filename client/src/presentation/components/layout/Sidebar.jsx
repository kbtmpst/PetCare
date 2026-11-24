import { NavLink } from "react-router-dom";
import {
  CalendarDays,
  LayoutDashboard,
  PawPrint,
  Receipt,
  Scissors,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/pets", label: "Pets", icon: PawPrint },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/services", label: "Services", icon: Scissors },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/analytics", label: "Analytics", icon: TrendingUp },
];

// Below 769px (mobile and tablet) the sidebar is a drawer that slides in over the page.
// From 769px up (laptop and desktop) it is always visible.
export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Dark overlay behind the drawer (drawer mode only) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* "invisible" keeps a closed drawer out of keyboard/screen-reader reach; md:visible undoes it */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col border-r border-line bg-white transition-[transform,visibility] duration-200 md:visible md:w-56 md:max-w-none md:translate-x-0 md:shadow-none lg:w-64 ${
          open
            ? "visible translate-x-0 shadow-xl"
            : "invisible -translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4 sm:h-16 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sage-600 text-white">
              <PawPrint size={20} />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              PetCare
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-sage-50 hover:text-ink md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav
          className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
          aria-label="Main navigation"
        >
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors md:py-2.5 ${
                  isActive
                    ? "bg-sage-100 text-sage-800"
                    : "text-muted hover:bg-sage-50 hover:text-ink"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
