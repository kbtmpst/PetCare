// A label + an input/select/textarea + an optional error message.
// Usage:
//   <FormField label="Date" htmlFor="date" required error={errors.date}>
//     <input id="date" className={inputClass(Boolean(errors.date))} ... />
//   </FormField>

// Shared styles for inputs. On phones the text is 16px, which stops iPhones from zooming in on focus.
const common =
  "w-full rounded-md border bg-white px-3 text-base outline-none placeholder:text-muted focus:ring-2 disabled:bg-canvas disabled:text-muted sm:text-sm";
const normalColors = "border-line focus:border-sage-500 focus:ring-sage-200";
const errorColors = "border-red-400 focus:border-red-500 focus:ring-red-100";

export function inputClass(hasError = false) {
  return `${common} h-11 sm:h-10 ${hasError ? errorColors : normalColors}`;
}

export function textareaClass(hasError = false) {
  return `${common} py-2 ${hasError ? errorColors : normalColors}`;
}

export default function FormField({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  className = "",
  children,
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
