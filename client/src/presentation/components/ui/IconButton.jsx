// A small square button that shows only an icon (used for View / Edit / Delete in tables).
// "label" is the text for screen readers and the hover tooltip, so every icon button is still understandable.
//   <IconButton label="Edit CUS-001" onClick={...}><Pencil size={18} /></IconButton>
export default function IconButton({
  label,
  onClick,
  danger = false,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-muted hover:bg-sage-100 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
