// BUSINESS LAYER: checks the service form values.
// Returns an object of error messages, for example { name: "Service name is required." }.
// An empty object {} means the form is valid.

// The two choices in the Status dropdown. The form shows these words; the saved record uses
// service.active (true / false).
export const SERVICE_STATUSES = ["Active", "Inactive"];

const MAX_PRICE = 100000;
const MAX_DURATION_MINUTES = 600; // 10 hours is already far longer than any grooming session

// "form" holds the values exactly as typed (all strings).
export function validateService(form) {
  const errors = {};

  const name = (form.name || "").trim();
  const description = (form.description || "").trim();

  if (!name) {
    errors.name = "Service name is required.";
  } else if (name.length > 50) {
    errors.name = "Service name must be 50 characters or fewer.";
  }

  if (description.length > 200) {
    errors.description = "Description must be 200 characters or fewer.";
  }

  // Price: required, a number, 0 or more. (Number("") is 0, so an empty box is checked first.)
  const priceText = String(form.price ?? "").trim();
  if (priceText === "") {
    errors.price = "Price is required.";
  } else if (Number.isNaN(Number(priceText))) {
    errors.price = "Price must be a number.";
  } else if (Number(priceText) < 0) {
    errors.price = "Price cannot be negative.";
  } else if (Number(priceText) > MAX_PRICE) {
    errors.price = `Price cannot be more than ${MAX_PRICE.toLocaleString("en-US")}.`;
  }

  // Duration: required, a whole number of minutes, more than 0.
  const durationText = String(form.durationMinutes ?? "").trim();
  if (durationText === "") {
    errors.durationMinutes = "Duration is required.";
  } else if (Number.isNaN(Number(durationText))) {
    errors.durationMinutes = "Duration must be a number of minutes.";
  } else if (!Number.isInteger(Number(durationText))) {
    errors.durationMinutes = "Duration must be a whole number of minutes.";
  } else if (Number(durationText) <= 0) {
    errors.durationMinutes = "Duration must be more than 0 minutes.";
  } else if (Number(durationText) > MAX_DURATION_MINUTES) {
    errors.durationMinutes = `Duration cannot be more than ${MAX_DURATION_MINUTES} minutes.`;
  }

  if (!SERVICE_STATUSES.includes(form.status)) {
    errors.status = "Please select a status.";
  }

  return errors;
}
