// BUSINESS LAYER: the dashboard's rules and calculations.
// It asks the appointment service for the appointments (which already include the pet, species, owner and
// service names looked up through the IDs), the transaction service for revenue, and the repositories
// (data layer) for the customer / pet counts, then works out the numbers the page shows.
//
// The two charts do NOT have their own numbers. They come from getAnalytics() in analyticsService.js, the same
// function the Analytics page uses, so the Dashboard and Analytics can never disagree:
//   Monthly Revenue  = PAID transactions only (pending and refunded are left out), by the month they were paid.
//   Popular Services = non-cancelled appointments grouped by serviceId, using each service's current name.
// Both cover the last 6 months (the 5 months before this one, plus this month up to today).
// It does not draw anything (that is the presentation layer's job) and does not know where data is stored.
import { getAppointmentList, isOpen } from "./appointmentService.js";
import { getRevenueFigures } from "./transactionService.js";
import { getAnalytics, resolveDateRange } from "./analyticsService.js";
import * as customerRepository from "../../data/repositories/customerRepository.js";
import * as petRepository from "../../data/repositories/petRepository.js";
import { toISODate } from "../utils/format.js";

// How many rows the "Upcoming" and "Recent" lists show.
const LIST_LIMIT = 5;

// How many months the charts cover, and how many bars the Popular Services chart shows.
const CHART_MONTHS = 6;
const POPULAR_LIMIT = 5;

// The date range of the charts: the 1st of the month (CHART_MONTHS - 1) months ago, up to today.
// A range this long is always split into months by analyticsService, so the revenue chart gets 6 bars.
function getChartRange() {
  const now = new Date();
  const start = toISODate(
    new Date(now.getFullYear(), now.getMonth() - (CHART_MONTHS - 1), 1),
  );
  return resolveDateRange({ preset: "custom", start, end: toISODate(now) })
    .range;
}

export async function getDashboardData() {
  const [appointments, customers, pets, revenue, analytics] = await Promise.all(
    [
      getAppointmentList(),
      customerRepository.getCustomers(),
      petRepository.getPets(),
      getRevenueFigures(),
      getAnalytics(getChartRange()),
    ],
  );

  const today = toISODate();

  // Today's appointments, earliest first.
  const schedule = appointments
    .filter((appointment) => appointment.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  // Upcoming: still going to happen (Pending, Confirmed or In Progress) on a LATER day. Soonest first.
  const upcoming = appointments
    .filter(
      (appointment) => appointment.date > today && isOpen(appointment.status),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    )
    .slice(0, LIST_LIMIT);

  // Recent: appointments from days BEFORE today, whatever their status. Newest first.
  const recent = appointments
    .filter((appointment) => appointment.date < today)
    .sort(
      (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time),
    )
    .slice(0, LIST_LIMIT);

  // Business rule: cancelled appointments do not count as "today's appointments".
  const active = schedule.filter(
    (appointment) => appointment.status !== "Cancelled",
  );
  const completedToday = schedule.filter(
    (appointment) => appointment.status === "Completed",
  );

  // Chart data in the shape the charts expect. The month label is the short name ("Nov").
  const monthlyRevenue = analytics.revenueTrend.map((bucket) => ({
    month: bucket.label.split(" ")[0],
    revenue: bucket.value,
  }));
  const popularServices = analytics.popularServices
    .slice(0, POPULAR_LIMIT)
    .map((service) => ({ name: service.name, count: service.value }));

  return {
    stats: {
      todayAppointments: active.length,
      todayCancelled: schedule.length - active.length,
      pendingAppointments: appointments.filter((a) => a.status === "Pending")
        .length,
      completedToday: completedToday.length,
      totalCustomers: customers.length,
      totalPets: pets.length,
      // Revenue comes from PAID transactions (see transactionService.js), not from appointment prices.
      todayRevenue: revenue.todayRevenue,
      totalRevenue: revenue.totalRevenue,
    },
    schedule,
    upcoming,
    recent,
    monthlyRevenue,
    popularServices,
    // false = the page shows "no data yet" instead of an empty chart
    hasRevenue: analytics.has.revenue,
    hasPopularServices: analytics.has.popularServices,
  };
}
