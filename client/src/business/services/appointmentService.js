// BUSINESS LAYER: the rules for appointments.
// The page (presentation) calls these functions. These functions use the repositories (data) to read and
// save, and use the validator to check the form. Nothing here draws anything on screen.
import * as appointmentRepository from "../../data/repositories/appointmentRepository.js";
import * as petRepository from "../../data/repositories/petRepository.js";
import * as customerRepository from "../../data/repositories/customerRepository.js";
import * as serviceRepository from "../../data/repositories/serviceRepository.js";
import * as transactionRepository from "../../data/repositories/transactionRepository.js";
import { validateAppointment } from "../validators/appointmentValidator.js";
import { toISODate } from "../utils/format.js";

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
// If a linked record cannot be found, a readable fallback ("Unknown pet", "Unknown owner") is used instead.
export async function getAppointmentList() {
  const [appointments, pets, customers] = await Promise.all([
    appointmentRepository.getAppointments(),
    petRepository.getPets(),
    customerRepository.getCustomers(),
  ]);

  return appointments
    .map((appointment) => {
      const pet = pets.find((item) => item.id === appointment.petId);
      const customer = customers.find(
        (item) => item.id === appointment.customerId,
      );
      return {
        ...appointment,
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
// Create / edit / change status
// ---------------------------------------------------------------------------

// Turns the form values into a full appointment record, or returns { errors } if something is wrong.
// The owner is found through the pet (pet.customerId), so the appointment always gets the pet's real owner.
// The form never sends an owner, so the owner and pet can never be mismatched.
async function buildAppointmentRecord(form, existing) {
  const errors = validateAppointment(form, existing);

  const pet = form.petId ? await petRepository.getPetById(form.petId) : null;
  const owner = pet
    ? await customerRepository.getCustomerById(pet.customerId)
    : null;
  const service = form.serviceId
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

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    record: {
      petId: pet.id,
      customerId: owner.id,
      serviceId: service.id,
      service: service.name,
      price: Number(form.price),
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
  if (newStatus === "Completed") {
    await transactionRepository.createTransaction({
      appointmentId: id,
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
