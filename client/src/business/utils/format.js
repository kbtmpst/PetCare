const pad = (n) => String(n).padStart(2, "0");

// Local date as "YYYY-MM-DD" (the same format MySQL DATE columns use).
export function toISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 1150 -> "₱1,150"
export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// "13:30" -> "1:30 PM"
export function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${pad(minutes)} ${suffix}`;
}

// "2026-11-23" -> "Nov 23, 2026"
// (Built from the parts, not new Date("2026-11-23"), which can show the wrong day in some time zones.)
export function formatShortDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// "2023-08-10" -> "3 yrs 3 mos". Returns "—" when there is no birth date.
export function formatAge(birthDate, today = new Date()) {
  if (!birthDate) return "—";

  const [year, month, day] = birthDate.split("-").map(Number);
  let totalMonths =
    (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month);
  if (today.getDate() < day) totalMonths -= 1; // this month's birthday has not happened yet

  if (totalMonths < 0) return "—"; // a birth date in the future, which the validator does not allow
  if (totalMonths < 1) return "Under 1 mo";

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yearText = years > 0 ? `${years} ${years === 1 ? "yr" : "yrs"}` : "";
  const monthText =
    months > 0 ? `${months} ${months === 1 ? "mo" : "mos"}` : "";
  return [yearText, monthText].filter(Boolean).join(" ");
}

// (1, "pet") -> "1 pet"      (3, "pet") -> "3 pets"
export function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Date -> "Monday, November 23, 2026"
export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
