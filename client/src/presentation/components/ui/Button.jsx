// A reusable button so every button in the app looks the same.
// Usage: <Button variant="primary" onClick={doSomething}>Save</Button>
//   variant: "primary" | "secondary" | "danger" | "danger-outline"
//   size:    "md" (default, 44px tall on phones for easy tapping) | "sm" (compact, for tables)

const variants = {
  primary: "bg-sage-600 text-white hover:bg-sage-700",
  secondary: "border border-line bg-white text-ink hover:bg-sage-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  "danger-outline":
    "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

const sizes = {
  md: "min-h-11 px-4 sm:min-h-10",
  sm: "min-h-9 px-3",
};

export default function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-600 disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
