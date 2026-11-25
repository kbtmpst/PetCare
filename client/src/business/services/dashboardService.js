// BUSINESS LAYER: the dashboard's rules and calculations.
// It asks the appointment service for the appointments (which already include the pet, species, owner and
// service names looked up through the IDs), the transaction service for revenue, and the repositories
// (data layer) for the customer / pet counts and the chart figures, then works out the numbers the page shows.
// It does not draw anything (that is the presentation layer's job) and does not know where data is stored.
import { getAppointmentList, isOpen } from "./appointmentService.js";
import { getRevenueFigures } from "./transactionService.js";
import * as customerRepository from "../../data/repositories/customerRepository.js";
import * as petRepository from "../../data/repositories/petRepository.js";
import {
  getMonthlyRevenue,
  getPopularServices,
} from "../../data/repositories/analyticsRepository.js";
import { toISODate } from "../utils/format.js";

// How many rows the "Upcoming" and "Recent" lists show.
const LIST_LIMIT = 5;

export async function getDashboardData() {
  const [
    appointments,
    customers,
    pets,
    revenue,
    monthlyRevenue,
    popularServices,
  ] = await Promise.all([
    getAppointmentList(),
    customerRepository.getCustomers(),
    petRepository.getPets(),
    getRevenueFigures(),
    getMonthlyRevenue(),
    getPopularServices(),
  ]);

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
  };
}
