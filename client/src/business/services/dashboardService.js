// BUSINESS LAYER: the dashboard's rules and calculations.
// It asks the data layer (repositories) for raw records, then works out the numbers the page shows.
// It does not draw anything (that is the presentation layer's job) and does not know where data is stored.
import { getAppointments } from "../../data/repositories/appointmentRepository.js";
import {
  getMonthlyRevenue,
  getPopularServices,
} from "../../data/repositories/analyticsRepository.js";
import { toISODate } from "../utils/format.js";

export async function getDashboardData() {
  const [appointments, monthlyRevenue, popularServices] = await Promise.all([
    getAppointments(),
    getMonthlyRevenue(),
    getPopularServices(),
  ]);

  const today = toISODate();

  // Today's appointments, earliest first.
  const schedule = appointments
    .filter((appointment) => appointment.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  // Business rules: cancelled appointments do not count as "today's appointments",
  // and revenue only counts completed services.
  const active = schedule.filter(
    (appointment) => appointment.status !== "Cancelled",
  );
  const completed = schedule.filter(
    (appointment) => appointment.status === "Completed",
  );

  return {
    stats: {
      todayAppointments: active.length,
      todayCancelled: schedule.length - active.length,
      pendingAppointments: appointments.filter((a) => a.status === "Pending")
        .length,
      completedToday: completed.length,
      todayRevenue: completed.reduce(
        (sum, appointment) => sum + appointment.price,
        0,
      ),
    },
    schedule,
    monthlyRevenue,
    popularServices,
  };
}
