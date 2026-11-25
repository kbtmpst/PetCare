// BUSINESS LAYER: the calculations behind the Analytics page.
// The page gives this file a date range; this file reads the real records through the repositories
// (appointments, transactions, customers, services), keeps only the ones inside the range, and returns
// numbers and chart-ready lists. Nothing here draws anything, and no figure is typed in by hand.
//
// How the records are linked (nothing is copied):
//   appointment.serviceId   -> service     (the current service name)
//   transaction.appointmentId -> appointment
//
// Dates are text like "2026-11-25" ("YYYY-MM-DD"). We compare and count them as text / by their year-month-day
// parts and never with new Date("2026-11-25"), which can shift the day in some time zones.
import * as appointmentRepository from "../../data/repositories/appointmentRepository.js";
import * as transactionRepository from "../../data/repositories/transactionRepository.js";
import * as customerRepository from "../../data/repositories/customerRepository.js";
import * as serviceRepository from "../../data/repositories/serviceRepository.js";
import { APPOINTMENT_STATUSES } from "./appointmentService.js";
import { PAYMENT_METHODS } from "../validators/transactionValidator.js";
import { toISODate } from "../utils/format.js";

// The choices of the date range dropdown. The default one is listed first in the page.
export const DATE_RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisYear", label: "This year" },
  { value: "custom", label: "Custom range" },
];

export const DEFAULT_DATE_FILTER = { preset: "last30", start: "", end: "" };

const MAX_RANGE_DAYS = 3660; // about 10 years; protects the page from absurd custom ranges
const POPULAR_SERVICES_LIMIT = 8;

// ---------------------------------------------------------------------------
// Small date helpers (all work with "YYYY-MM-DD" text)
// ---------------------------------------------------------------------------

// "2026-11-25" -> a local Date for that day.
function parseISO(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// "2026-11-25" + 3 -> "2026-11-28"
function addDays(iso, days) {
  const date = parseISO(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

// How many days from a to b (b - a). Uses UTC so a daylight-saving change can never add or remove an hour.
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000,
  );
}

function isValidISODate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return toISODate(parseISO(text)) === text; // rejects "2026-02-31"
}

function startOfMonth(iso) {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonth(iso) {
  const [year, month] = iso.split("-").map(Number);
  return toISODate(new Date(year, month, 0)); // day 0 of the next month = last day of this month
}

// The Monday of the week that contains this day.
function startOfWeek(iso) {
  const daysSinceMonday = (parseISO(iso).getDay() + 6) % 7;
  return addDays(iso, -daysSinceMonday);
}

function nextMonth(iso) {
  const [year, month] = iso.split("-").map(Number);
  return toISODate(new Date(year, month, 1));
}

// "2026-11-25" -> "Nov 25"      (with year: "Nov 25, 2026")
function formatDay(iso, withYear = false) {
  return parseISO(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function formatMonth(iso) {
  return parseISO(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// The date range
// ---------------------------------------------------------------------------

// Turns the filter chosen on the page ({ preset, start, end }) into a real range.
// Returns { ok: true, range: { start, end, label, days } } or { ok: false, error: "message for the user" }.
//   "today" is a parameter only so the tests can pretend it is another day.
export function resolveDateRange(filter, today = new Date()) {
  const todayISO = toISODate(today);
  let start;
  let end;

  switch (filter.preset) {
    case "today":
      start = todayISO;
      end = todayISO;
      break;
    case "last7":
      start = addDays(todayISO, -6); // today plus the 6 days before it = 7 days
      end = todayISO;
      break;
    case "last30":
      start = addDays(todayISO, -29);
      end = todayISO;
      break;
    case "thisMonth":
      start = startOfMonth(todayISO);
      end = endOfMonth(todayISO);
      break;
    case "lastMonth": {
      end = addDays(startOfMonth(todayISO), -1); // the day before this month began
      start = startOfMonth(end);
      break;
    }
    case "thisYear":
      start = `${todayISO.slice(0, 4)}-01-01`;
      end = `${todayISO.slice(0, 4)}-12-31`;
      break;
    case "custom": {
      if (!filter.start || !filter.end) {
        return {
          ok: false,
          error: "Please choose both a start date and an end date.",
        };
      }
      if (!isValidISODate(filter.start) || !isValidISODate(filter.end)) {
        return { ok: false, error: "Please enter valid dates." };
      }
      if (filter.start > filter.end) {
        return {
          ok: false,
          error: "The start date cannot be after the end date.",
        };
      }
      if (daysBetween(filter.start, filter.end) + 1 > MAX_RANGE_DAYS) {
        return {
          ok: false,
          error: "Please choose a range of 10 years or less.",
        };
      }
      start = filter.start;
      end = filter.end;
      break;
    }
    default:
      return { ok: false, error: "Unknown date range." };
  }

  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const label =
    start === end
      ? formatDay(start, true)
      : `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`;

  return {
    ok: true,
    range: { start, end, label, days: daysBetween(start, end) + 1 },
  };
}

// A range is split into days, weeks or months so the trend charts stay readable.
function chooseGranularity(days) {
  if (days <= 31) return "day";
  if (days <= 140) return "week"; // up to 20 weeks
  return "month";
}

function bucketStart(iso, granularity) {
  if (granularity === "day") return iso;
  if (granularity === "week") return startOfWeek(iso);
  return startOfMonth(iso);
}

function nextBucket(iso, granularity) {
  if (granularity === "day") return addDays(iso, 1);
  if (granularity === "week") return addDays(iso, 7);
  return nextMonth(iso);
}

function bucketLabels(iso, granularity) {
  if (granularity === "day")
    return { label: formatDay(iso), tooltipLabel: formatDay(iso, true) };
  if (granularity === "week")
    return {
      label: formatDay(iso),
      tooltipLabel: `Week of ${formatDay(iso, true)}`,
    };
  return { label: formatMonth(iso), tooltipLabel: formatMonth(iso) };
}

// Every bucket from the start of the range to its end, so quiet days/weeks/months show as 0 instead of
// being skipped. Returns [{ key, label, tooltipLabel, value }].
function makeEmptyBuckets(range, granularity) {
  const buckets = [];
  let key = bucketStart(range.start, granularity);
  while (key <= range.end) {
    buckets.push({ key, ...bucketLabels(key, granularity), value: 0 });
    key = nextBucket(key, granularity);
  }
  return buckets;
}

// Adds 1 (or an amount) to the bucket that a date falls into.
function addToBuckets(buckets, granularity, date, amount) {
  const bucket = buckets.find(
    (item) => item.key === bucketStart(date, granularity),
  );
  if (bucket) bucket.value += amount;
}

function inRange(date, range) {
  return date >= range.start && date <= range.end;
}

// ---------------------------------------------------------------------------
// The analytics
// ---------------------------------------------------------------------------

// Returns everything the Analytics page shows for one date range (from resolveDateRange):
//   stats                 the four summary cards
//   granularity           "day" | "week" | "month"
//   revenueTrend          [{ key, label, tooltipLabel, value }]   PAID transactions, by the day they were paid
//   appointmentTrend      [{ key, label, tooltipLabel, value }]   appointments, by appointment date
//   popularServices       [{ name, value }]                       most booked first
//   statusBreakdown       [{ name, value }]                       one entry per appointment status
//   paymentBreakdown      [{ name, value, count }]                PAID transactions per payment method (value = pesos)
//   has                   { revenue, appointments, popularServices, payments }  false = show the empty state
export async function getAnalytics(range) {
  const [allAppointments, allTransactions, customers, services] =
    await Promise.all([
      appointmentRepository.getAppointments(),
      transactionRepository.getTransactions(),
      customerRepository.getCustomers(),
      serviceRepository.getServices(),
    ]);

  const granularity = chooseGranularity(range.days);

  // ---- Appointments inside the range (by appointment date)
  const appointments = allAppointments.filter((appointment) =>
    inRange(appointment.date, range),
  );
  const completed = appointments.filter(
    (appointment) => appointment.status === "Completed",
  );

  // ---- Revenue: PAID transactions only, counted on the day they were paid.
  // Pending payments are not revenue yet, and refunded payments were given back.
  const paidTransactions = allTransactions.filter(
    (transaction) =>
      transaction.status === "Paid" && inRange(transaction.paidDate, range),
  );
  const totalRevenue = paidTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );

  // ---- Customers
  const newCustomers = customers.filter((customer) =>
    inRange(customer.dateRegistered, range),
  );

  const stats = {
    totalRevenue,
    paidCount: paidTransactions.length,
    averageTransaction:
      paidTransactions.length > 0
        ? Math.round(totalRevenue / paidTransactions.length)
        : 0,
    totalAppointments: appointments.length,
    completedAppointments: completed.length,
    // Completed appointments as a percentage of all appointments in the range (0 when there are none).
    completionRate:
      appointments.length > 0
        ? Math.round((completed.length / appointments.length) * 100)
        : 0,
    totalCustomers: customers.length,
    newCustomers: newCustomers.length,
  };

  // ---- Trends
  const revenueTrend = makeEmptyBuckets(range, granularity);
  for (const transaction of paidTransactions) {
    addToBuckets(
      revenueTrend,
      granularity,
      transaction.paidDate,
      transaction.amount,
    );
  }

  const appointmentTrend = makeEmptyBuckets(range, granularity);
  for (const appointment of appointments) {
    addToBuckets(appointmentTrend, granularity, appointment.date, 1);
  }

  // ---- Popular services: appointments grouped by serviceId, most booked first.
  // Cancelled appointments are not counted (the service was not done); they show in the status chart.
  const bookedCounts = new Map();
  for (const appointment of appointments) {
    if (appointment.status === "Cancelled") continue;
    bookedCounts.set(
      appointment.serviceId,
      (bookedCounts.get(appointment.serviceId) || 0) + 1,
    );
  }
  const popularServices = [...bookedCounts.entries()]
    .map(([serviceId, count]) => {
      const service = services.find((item) => item.id === serviceId);
      // Use the service's current name; fall back to the name copied into the appointment if it was deleted.
      const fallback = appointments.find(
        (appointment) => appointment.serviceId === serviceId,
      );
      return { name: service ? service.name : fallback.service, value: count };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, POPULAR_SERVICES_LIMIT);

  // ---- Status distribution: one entry per status the project uses (zero counts are kept for the legend).
  const statusBreakdown = APPOINTMENT_STATUSES.map((status) => ({
    name: status,
    value: appointments.filter((appointment) => appointment.status === status)
      .length,
  }));

  // ---- Payment breakdown: PAID transactions grouped by payment method.
  const methodNames = [...PAYMENT_METHODS];
  for (const transaction of paidTransactions) {
    if (!methodNames.includes(transaction.paymentMethod))
      methodNames.push(transaction.paymentMethod);
  }
  const paymentBreakdown = methodNames
    .map((method) => {
      const matching = paidTransactions.filter(
        (transaction) => transaction.paymentMethod === method,
      );
      return {
        name: method,
        value: matching.reduce(
          (sum, transaction) => sum + transaction.amount,
          0,
        ),
        count: matching.length,
      };
    })
    .filter((entry) => entry.count > 0);

  return {
    range,
    granularity,
    stats,
    revenueTrend,
    appointmentTrend,
    popularServices,
    statusBreakdown,
    paymentBreakdown,
    has: {
      revenue: paidTransactions.length > 0,
      appointments: appointments.length > 0,
      popularServices: popularServices.length > 0,
      payments: paymentBreakdown.length > 0,
    },
  };
}
