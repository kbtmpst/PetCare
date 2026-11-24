import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";

// The sidebar turns into a slide-in drawer below this width.
// It must match the `md` breakpoint set in src/index.css.
const DRAWER_BREAKPOINT = 769;

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // While the drawer is open: lock page scroll, close on Escape,
  // and close if the window is resized up to a width where the sidebar is always visible.
  useEffect(() => {
    if (!sidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    function handleResize() {
      if (window.innerWidth >= DRAWER_BREAKPOINT) setSidebarOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="md:pl-56 lg:pl-64">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full min-w-0 max-w-7xl p-4 sm:p-6 lg:p-8 2xl:max-w-[1600px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
