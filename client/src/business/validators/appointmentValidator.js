// BUSINESS LAYER: checks the appointment form values.
// It returns an object of error messages, for example { date: "Please choose a date." }.
// An empty object {} means the form is valid.
//
// The price is NOT checked here. The form does not decide the price: appointmentService.js takes it from the
// selected service record (see buildAppointmentRecord there).
import { toISODate } from "../utils/format.js";

// "form" holds the values exactly as typed (all strings).
// "existing" is the appointment being edited, or null when creating a new one.
export function validateAppointment(form, existing = null) {
  const errors = {};

  if (!form.petId) {
    errors.petId = "Please select a pet.";
  }

  if (!form.serviceId) {
    errors.serviceId = "Please select a grooming service.";
  }

  if (!form.date) {
    errors.date = "Please choose a date.";
  } else {
    // Rule: you cannot book a date that has already passed.
    // When editing, an appointment that keeps its original date is still allowed.
    const dateChanged = !existing || form.date !== existing.date;
    if (dateChanged && form.date < toISODate()) {
      errors.date = "The date cannot be in the past.";
    }
  }

  if (!form.time) {
    errors.time = "Please choose a time.";
  }

  if (form.notes && form.notes.length > 300) {
    errors.notes = "Notes must be 300 characters or fewer.";
  }

  return errors;
}
