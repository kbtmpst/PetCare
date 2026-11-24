// DATA LAYER: the only place that knows where appointments are stored.
//
// For now the appointments live in a normal JavaScript array in memory, so create / update work while
// the app is open. Refreshing the browser resets them to the sample data.
//
// Later, each function below becomes a fetch() call to the Express API, for example:
//
//   const response = await fetch("/api/appointments");
//   if (!response.ok) throw new Error("Failed to load appointments");
//   return response.json();
//
// The business layer calls these functions and does not care where the data comes from.
import { appointments as sampleAppointments } from "../mock/sampleData.js";

// A copy of the sample data, so editing here never changes the original sample file.
let appointments = sampleAppointments.map((appointment) => ({
  ...appointment,
}));

// "APT-014" -> next one is "APT-015". With MySQL, the database would create the id for us.
function makeNextId() {
  const highest = appointments.reduce(
    (max, appointment) =>
      Math.max(max, Number(appointment.id.replace("APT-", ""))),
    0,
  );
  return `APT-${String(highest + 1).padStart(3, "0")}`;
}

// READ: all appointments. Returns copies so other code cannot change our stored data by accident.
export async function getAppointments() {
  return appointments.map((appointment) => ({ ...appointment }));
}

// CREATE: save a new appointment and return it (with its new id).
export async function createAppointment(data) {
  const newAppointment = { ...data, id: makeNextId() };
  appointments = [...appointments, newAppointment];
  return { ...newAppointment };
}

// UPDATE: change some fields of one appointment. Returns the updated appointment, or null if not found.
export async function updateAppointment(id, changes) {
  const existing = appointments.find((appointment) => appointment.id === id);
  if (!existing) return null;

  const updated = { ...existing, ...changes, id }; // the id can never change
  appointments = appointments.map((appointment) =>
    appointment.id === id ? updated : appointment,
  );
  return { ...updated };
}
