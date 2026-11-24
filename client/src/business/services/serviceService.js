// BUSINESS LAYER: the rules for grooming services.
// The Services page calls these functions. They use the repositories (data layer) to read and save,
// and the validator to check the form. Nothing here draws anything on screen.
import * as serviceRepository from "../../data/repositories/serviceRepository.js";
import * as appointmentRepository from "../../data/repositories/appointmentRepository.js";
import { validateService } from "../validators/serviceValidator.js";
import { pluralize } from "../utils/format.js";

// The choices of the status filter on the page. "" means "show all".
export const SERVICE_STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

// ---------------------------------------------------------------------------
// Reading data
// ---------------------------------------------------------------------------

// All services (A-Z by name), each one extended with:
//   status            "Active" or "Inactive" (the saved record only has service.active = true / false)
//   appointmentCount  how many appointments were booked with this service (found through appointment.serviceId)
export async function getServiceList() {
  const [services, appointments] = await Promise.all([
    serviceRepository.getServices(),
    appointmentRepository.getAppointments(),
  ]);

  return services
    .map((service) => ({
      ...service,
      status: service.active ? "Active" : "Inactive",
      appointmentCount: appointments.filter(
        (appointment) => appointment.serviceId === service.id,
      ).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Calculations for the page
// ---------------------------------------------------------------------------

// The numbers on the summary cards. They are calculated from the list, never typed in by hand.
export function getServiceSummary(services) {
  const totalPrice = services.reduce((sum, service) => sum + service.price, 0);
  return {
    total: services.length,
    active: services.filter((service) => service.active).length,
    inactive: services.filter((service) => !service.active).length,
    averagePrice:
      services.length > 0 ? Math.round(totalPrice / services.length) : 0,
  };
}

// Search by service name, description or service ID, and filter by status ("" means all statuses).
export function filterServices(services, filters) {
  const term = filters.search.trim().toLowerCase();

  return services.filter((service) => {
    const matchesSearch =
      term === "" ||
      [service.name, service.description, String(service.id)].some((text) =>
        text.toLowerCase().includes(term),
      );
    const matchesStatus =
      filters.status === "" || service.status === filters.status;
    return matchesSearch && matchesStatus;
  });
}

// ---------------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------------

// Turns the form values into a service record, or returns { errors } if something is wrong.
// "ignoreId" is the service being edited, so it is not compared with itself.
async function buildServiceRecord(form, ignoreId) {
  const errors = validateService(form);

  // Rule: two services cannot have the same name (capital letters do not matter).
  const name = (form.name || "").trim();
  if (name && !errors.name) {
    const services = await serviceRepository.getServices();
    const duplicate = services.find(
      (service) =>
        service.id !== ignoreId &&
        service.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) errors.name = "A service with this name already exists.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    record: {
      name,
      description: (form.description || "").trim(),
      price: Number(form.price),
      durationMinutes: Number(form.durationMinutes),
      active: form.status === "Active",
    },
  };
}

// Returns { ok: true, service } or { ok: false, errors }.
export async function createService(form) {
  const { errors, record } = await buildServiceRecord(form, null);
  if (errors) return { ok: false, errors };

  const service = await serviceRepository.createService(record);
  return { ok: true, service };
}

// Returns { ok: true, service } or { ok: false, errors }.
// Appointments keep the service name and price they were booked with, so editing a service here
// never changes old appointments or past revenue.
export async function updateService(id, form) {
  const existing = await serviceRepository.getServiceById(id);
  if (!existing)
    return { ok: false, errors: { general: "Service not found." } };

  const { errors, record } = await buildServiceRecord(form, id);
  if (errors) return { ok: false, errors };

  const service = await serviceRepository.updateService(id, record);
  return { ok: true, service };
}

// Rule: a service that has appointments cannot be deleted. Deleting it would erase the link behind
// those appointments (and their revenue records). Set it to Inactive instead: it can no longer be booked,
// but the history stays.
// Returns { allowed: true } or { allowed: false, reason: "message to show the user" }.
export async function checkServiceDeletion(id) {
  const service = await serviceRepository.getServiceById(id);
  if (!service) return { allowed: false, reason: "Service not found." };

  const appointments = (await appointmentRepository.getAppointments()).filter(
    (appointment) => appointment.serviceId === id,
  );

  if (appointments.length > 0) {
    return {
      allowed: false,
      reason: `${service.name} cannot be deleted because it has ${pluralize(
        appointments.length,
        "appointment record",
      )}. Edit the service and set its status to Inactive instead. It will no longer be bookable, and the appointment history stays accurate.`,
    };
  }
  return { allowed: true };
}

// Returns { ok: true } or { ok: false, error: "message" }.
export async function deleteService(id) {
  const check = await checkServiceDeletion(id); // always re-check, even if the page already did
  if (!check.allowed) return { ok: false, error: check.reason };

  await serviceRepository.deleteService(id);
  return { ok: true };
}
