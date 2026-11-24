import { useEffect } from "react";
import { X } from "lucide-react";

// A pop-up window. Reusable for every page (appointments, pets, customers, ...).
//   title:    text in the header
//   onClose:  called when the X button, the Escape key, or (optionally) the dark background is used
//   footer:   buttons shown in a fixed bar at the bottom
//   size:     "sm" | "md" | "lg" (maximum width on bigger screens)
//
// On phones it slides up from the bottom and uses the full width. If the content is taller than the
// screen, only the middle part scrolls, so the header and footer buttons always stay visible.

const widths = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export default function Modal({
  title,
  onClose,
  footer,
  size = "md",
  closeOnBackgroundClick = true,
  children,
}) {
  // Stop the page behind the modal from scrolling while the modal is open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Close when the Escape key is pressed.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleBackgroundMouseDown(event) {
    // Only react to clicks on the dark background itself, not on the white panel.
    if (closeOnBackgroundClick && event.target === event.currentTarget)
      onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onMouseDown={handleBackgroundMouseDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-lg bg-white shadow-xl sm:max-h-[90dvh] sm:rounded-lg ${widths[size]}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line py-2 pl-4 pr-2 sm:pl-5">
          <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-sage-50 hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain p-4 sm:p-5">
          {children}
        </div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
