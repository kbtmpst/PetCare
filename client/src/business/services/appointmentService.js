// BUSINESS LAYER: the rules for appointments.
// The page (presentation) calls these functions. These functions use the repositories (data) to read and
// save, and use the validator to check the form. Nothing here draws anything on screen.
import * as appointmentRepository from "../../data/repositories/appointmentRepository.js";
import * as petRepository from "../../data/repositories/petRepository.js";
import * as customerRepository from "../../data/repositories/customerRepository.js";
import * as serviceRepository from "../../data/repositories/serviceRepository.js";
import * as transactionRepository from "../../data/repositories/transactionRepository.js";
import { validateAppointment } from "../validators/appointmentValidator.js";
import {
  toISODate,
  formatCurrency,
  formatShortDate,
  formatTime,
} from "../utils/format.js";

// ---------------------------------------------------------------------------
// Statuses and the rules for moving between them
// ---------------------------------------------------------------------------

export const APPOINTMENT_STATUSES = [
  "Pending",
  "Confirmed",
  "In Progress",
  "Completed",
  "Cancelled",
];

// The normal path of an appointment: Pending -> Confirmed -> In Progress -> Completed.
const NEXT_STATUS = {
  Pending: "Confirmed",
  Confirmed: "In Progress",
  "In Progress": "Completed",
};

// The button text for moving to each status.
const ACTION_LABELS = {
  Confirmed: "Confirm",
  "In Progress": "Start",
  Completed: "Complete",
};

// Completed and Cancelled are final: they cannot be edited, cancelled or moved to another status.
function isFinished(status) {
  return status === "Completed" || status === "Cancelled";
}

// "Open" means the appointment is still going to happen (Pending, Confirmed or In Progress).
export function isOpen(status) {
  return !isFinished(status);
}

export function canEdit(status) {
  return !isFinished(status);
}

export function canCancel(status) {
  return !isFinished(status);
}

// Returns { status: "Confirmed", label: "Confirm" } for a Pending appointment, or null when there is no next step.
export function getNextStatusAction(status) {
  const next = NEXT_STATUS[status];
  return next ? { status: next, label: ACTION_LABELS[next] } : null;
}

// ---------------------------------------------------------------------------
// Reading data
// ---------------------------------------------------------------------------

function fullName(customer) {
  return `${customer.firstName} ${customer.lastName}`;
}

// All appointments, newest date first (and earliest time first within the same day).
// An appointment only stores petId and customerId. Here we look up the pet's name and breed and the
// owner's name through those ids, so the pages (and the Dashboard) can simply show appointment.pet,
// appointment.breed, appointment.species and appointment.customer, and always see the current names.
// The service name is looked up through serviceId in the same way, so renaming a service in the Services page
// changes it everywhere. (The name copied into the appointment when it was booked is only a backup, used if the
// service record cannot be found. The price is different: it stays the price the appointment was booked at.)
// If a linked record cannot be found, a readable fallback ("Unknown pet", "Unknown owner") is used instead.
export async function getAppointmentList() {
  const [appointments, pets, customers, services] = await Promise.all([
    appointmentRepository.getAppointments(),
    petRepository.getPets(),
    customerRepository.getCustomers(),
    serviceRepository.getServices(),
  ]);

  return appointments
    .map((appointment) => {
      const pet = pets.find((item) => item.id === appointment.petId);
      const customer = customers.find(
        (item) => item.id === appointment.customerId,
      );
      const service = services.find(
        (item) => item.id === appointment.serviceId,
      );
      return {
        ...appointment,
        service: service ? service.name : appointment.service,
        pet: pet ? pet.name : "Unknown pet",
        breed: pet ? pet.breed : "",
        species: pet ? pet.species : "Unknown",
        customer: customer ? fullName(customer) : "Unknown owner",
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.time.localeCompare(b.time);
    });
}

// The pets and services shown in the appointment form's dropdowns.
// Each pet also gets ownerName, so the form can show who the owner is as soon as a pet is picked.
export async function getFormOptions() {
  const [pets, customers, services] = await Promise.all([
    petRepository.getPets(),
    customerRepository.getCustomers(),
    serviceRepository.getServices(),
  ]);

  const petChoices = pets
    .map((pet) => {
      const owner = customers.find(
        (customer) => customer.id === pet.customerId,
      );
      return { ...pet, ownerName: owner ? fullName(owner) : "Unknown owner" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { pets: petChoices, services };
}

// ---------------------------------------------------------------------------
// Calculations for the page
// ---------------------------------------------------------------------------

// The numbers on the four summary cards. They are calculated from the list, never typed in by hand.
export function getAppointmentSummary(appointments) {
  const today = toISODate();
  const countByStatus = (status) =>
    appointments.filter((a) => a.status === status).length;

  return {
    // Same rule as the Dashboard: cancelled appointments do not count as "today's appointments".
    today: appointments.filter(
      (a) => a.date === today && a.status !== "Cancelled",
    ).length,
    pending: countByStatus("Pending"),
    inProgress: countByStatus("In Progress"),
    completed: countByStatus("Completed"),
  };
}

// Applies the search box, status filter and date filter. An empty filter means "do not filter by this".
export function filterAppointments(appointments, filters) {
  const term = filters.search.trim().toLowerCase();

  return appointments.filter((appointment) => {
    const matchesSearch =
      term === "" ||
      [appointment.id, appointment.pet, appointment.customer].some((text) =>
        text.toLowerCase().includes(term),
      );
    const matchesStatus =
      filters.status === "" || appointment.status === filters.status;
    const matchesDate =
      filters.date === "" || appointment.date === filters.date;

    return matchesSearch && matchesStatus && matchesDate;
  });
}

// ---------------------------------------------------------------------------
// Scheduling conflicts
// ---------------------------------------------------------------------------

// ASSUMPTION: the system has no staff or room scheduling, so the shop is treated as having ONE grooming
// resource (one groomer). That means any two appointments that overlap in time conflict, whichever pets they
// are for. The same pet can never be in two overlapping appointments either (this is a special case of the same rule).
// If staff scheduling is added later, only findScheduleConflict below needs to change.

// Used only if an appointment's service record cannot be found (services cannot be deleted while appointments use them).
const DEFAULT_DURATION_MINUTES = 60;

// "2026-11-25" + "13:30" -> a number of minutes. Using the date too means appointments on different days never
// overlap, and a long appointment that runs past midnight is still compared correctly.
function toMinutes(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day) / 60000 + hours * 60 + minutes;
}

// "13:00" + 120 minutes -> "3:00 PM"
function formatEndTime(time, durationMinutes) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = (hours * 60 + minutes + durationMinutes) % (24 * 60);
  return formatTime(
    `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
  );
}

// Looks for an existing appointment that overlaps the one being saved.
//   booking:  { petId, serviceDuration, date, time }
//   ignoreId: the appointment being edited, so it never conflicts with itself (null when creating)
// Rules: cancelled appointments are ignored. Two appointments overlap when each one starts before the other
// ends (so one that starts exactly when another ends is fine).
// Returns an error message, or "" when the time is free.
async function findScheduleConflict(booking, ignoreId) {
  const [appointments, services, pets] = await Promise.all([
    appointmentRepository.getAppointments(),
    serviceRepository.getServices(),
    petRepository.getPets(),
  ]);

  const newStart = toMinutes(booking.date, booking.time);
  const newEnd = newStart + booking.serviceDuration;

  const conflicts = appointments
    .filter(
      (appointment) =>
        appointment.status !== "Cancelled" && appointment.id !== ignoreId,
    )
    .map((appointment) => {
      const service = services.find(
        (item) => item.id === appointment.serviceId,
      );
      const duration = service
        ? service.durationMinutes
        : DEFAULT_DURATION_MINUTES;
      const start = toMinutes(appointment.date, appointment.time);
      return { appointment, duration, start, end: start + duration };
    })
    .filter((other) => newStart < other.end && other.start < newEnd);

  if (conflicts.length === 0) return "";

  // If the same pet is involved, say so first: that is the clearest message for the user.
  const sorted = [...conflicts].sort(
    (a, b) =>
      Number(b.appointment.petId === booking.petId) -
      Number(a.appointment.petId === booking.petId),
  );
  const { appointment, duration } = sorted[0];
  const when = `${formatTime(appointment.time)} to ${formatEndTime(appointment.time, duration)}`;
  const pet = pets.find((item) => item.id === appointment.petId);
  const petName = pet ? pet.name : "Another pet";

  if (appointment.petId === booking.petId) {
    return `${petName} already has appointment ${appointment.id} from ${when} on ${formatShortDate(appointment.date)}. Choose a different time.`;
  }
  return `This time overlaps appointment ${appointment.id} (${petName}, ${when} on ${formatShortDate(appointment.date)}). The shop can groom one pet at a time, so choose a different time.`;
}

// ---------------------------------------------------------------------------
// Create / edit / change status
// ---------------------------------------------------------------------------

// Turns the form values into a full appointment record, or returns { errors } if something is wrong.
//
// The owner is found through the pet (pet.customerId), so the appointment always gets the pet's real owner.
// The price is NOT taken from the form. It comes from the service record that serviceId points to:
//   - a new appointment, or an edit that picks a different service: the service's current catalog price;
//   - an edit that keeps the same service: the price the appointment already has (a snapshot), so a later change
//     of the catalog price never changes an old appointment.
// If the form still sends a price and it is not that price, the save is rejected.
async function buildAppointmentRecord(form, existing) {
  const errors = validateAppointment(form, existing);

  const pet = form.petId ? await petRepository.getPetById(form.petId) : null;
  const owner = pet
    ? await customerRepository.getCustomerById(pet.customerId)
    : null;

  // A service id must be plain digits like "2". Anything else ("abc", "", "1.5", " 2", "0") is invalid.
  const hasValidServiceId = /^[1-9]\d*$/.test(String(form.serviceId));
  const service = hasValidServiceId
    ? await serviceRepository.getServiceById(Number(form.serviceId))
    : null;

  if (form.petId && !pet) {
    errors.petId = "That pet could not be found.";
  } else if (pet && !owner) {
    errors.petId = "This pet has no registered owner.";
  }

  if (form.serviceId && !service) {
    errors.serviceId = "That service could not be found.";
  } else if (
    service &&
    !service.active &&
    (!existing || existing.serviceId !== service.id)
  ) {
    // Rule: only active services can be booked (an old appointment may keep its original service).
    errors.serviceId = "This service is not currently offered.";
  }

  // The real price, decided here and not by the form.
  let price = null;
  if (service) {
    price =
      existing && existing.serviceId === service.id
        ? existing.price
        : service.price;

    const priceSent =
      form.price !== undefined &&
      form.price !== null &&
      String(form.price).trim() !== "";
    if (priceSent && Number(form.price) !== price) {
      errors.price = `The price must match the selected service (${formatCurrency(price)}). Close the form and open it again.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // Rule: no overlapping appointments (see "Scheduling conflicts" above).
  const conflict = await findScheduleConflict(
    {
      petId: pet.id,
      serviceDuration: service.durationMinutes,
      date: form.date,
      time: form.time,
    },
    existing ? existing.id : null,
  );
  if (conflict) {
    return { errors: { time: conflict } };
  }

  return {
    record: {
      petId: pet.id,
      customerId: owner.id,
      serviceId: service.id,
      service: service.name, // a backup copy of the name (the lists use the current name from the service record)
      price,
      date: form.date,
      time: form.time,
      notes: (form.notes || "").trim(),
    },
  };
}

// Returns { ok: true, appointment } or { ok: false, errors }.
export async function createAppointment(form) {
  const { errors, record } = await buildAppointmentRecord(form, null);
  if (errors) return { ok: false, errors };

  // Every new appointment starts as Pending.
  const appointment = await appointmentRepository.createAppointment({
    ...record,
    status: "Pending",
  });
  return { ok: true, appointment };
}

// Edit or reschedule. The status is not changed here (see changeAppointmentStatus).
export async function updateAppointment(id, form) {
  const appointments = await appointmentRepository.getAppointments();
  const existing = appointments.find((appointment) => appointment.id === id);

  if (!existing) {
    return { ok: false, errors: { general: "Appointment not found." } };
  }
  if (!canEdit(existing.status)) {
    return {
      ok: false,
      errors: { general: `${existing.status} appointments cannot be edited.` },
    };
  }

  const { errors, record } = await buildAppointmentRecord(form, existing);
  if (errors) return { ok: false, errors };

  const appointment = await appointmentRepository.updateAppointment(id, record);
  return { ok: true, appointment };
}

// Moves an appointment to a new status, only if the rules allow it.
// Returns { ok: true, appointment } or { ok: false, error: "message" }.
export async function changeAppointmentStatus(id, newStatus) {
  const appointments = await appointmentRepository.getAppointments();
  const existing = appointments.find((appointment) => appointment.id === id);

  if (!existing) {
    return { ok: false, error: "Appointment not found." };
  }

  const isNextStep = newStatus === NEXT_STATUS[existing.status];
  const isCancelling = newStatus === "Cancelled" && canCancel(existing.status);

  if (!isNextStep && !isCancelling) {
    return {
      ok: false,
      error: `A ${existing.status} appointment cannot be changed to ${newStatus}.`,
    };
  }

  const appointment = await appointmentRepository.updateAppointment(id, {
    status: newStatus,
  });

  // Rule: when a service is completed, a payment record (transaction) is created for it. It starts as
  // Pending; the Transactions page marks it as Paid once the customer pays.
  // The transaction keeps a snapshot of what was agreed: the appointment's price, and the service name at this
  // moment. Renaming the service later does not change this transaction.
  if (newStatus === "Completed") {
    const service = await serviceRepository.getServiceById(existing.serviceId);
    await transactionRepository.createTransaction({
      appointmentId: id,
      serviceName: service ? service.name : existing.service,
      amount: existing.price,
      paymentMethod: "",
      status: "Pending",
      date: toISODate(),
      paidDate: "",
    });
  }

  return { ok: true, appointment };
}

export function cancelAppointment(id) {
  return changeAppointmentStatus(id, "Cancelled");
}
