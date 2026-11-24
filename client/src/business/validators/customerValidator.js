// BUSINESS LAYER: checks the customer form values.
// Returns an object of error messages, for example { firstName: "First name is required." }.
// An empty object {} means the form is valid.

// A reasonable phone number: optional "+", then 7 to 13 digits. Spaces, dashes, dots and brackets are allowed
// when typing, for example "0917 123 4567", "0917-123-4567" or "+63 917 123 4567".
const PHONE_PATTERN = /^\+?\d{7,13}$/;

// Simple email check: something@something.something (no spaces).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomer(form) {
  const errors = {};

  const firstName = (form.firstName || "").trim();
  const lastName = (form.lastName || "").trim();
  const contactNumber = (form.contactNumber || "").trim();
  const email = (form.email || "").trim();
  const address = (form.address || "").trim();

  if (!firstName) {
    errors.firstName = "First name is required.";
  } else if (firstName.length > 50) {
    errors.firstName = "First name must be 50 characters or fewer.";
  }

  if (!lastName) {
    errors.lastName = "Last name is required.";
  } else if (lastName.length > 50) {
    errors.lastName = "Last name must be 50 characters or fewer.";
  }

  if (!contactNumber) {
    errors.contactNumber = "Contact number is required.";
  } else if (!PHONE_PATTERN.test(contactNumber.replace(/[\s\-().]/g, ""))) {
    errors.contactNumber =
      "Enter a valid contact number, for example 0917 123 4567.";
  }

  // Email is optional, but if something is typed it must look like an email.
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address, for example name@example.com.";
  }

  if (address.length > 200) {
    errors.address = "Address must be 200 characters or fewer.";
  }

  return errors;
}
