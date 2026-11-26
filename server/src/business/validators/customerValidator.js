// BUSINESS LAYER: checks the data sent to the Customers API.
// These functions only check values. They never touch the database or Express.
// They return an object of error messages (empty = OK), like the frontend's customerValidator.
// The limits match the columns of the "customers" table.

const MAX_NAME_LENGTH = 50; // first_name, last_name VARCHAR(50)
const MAX_CONTACT_LENGTH = 30; // contact_number VARCHAR(30)
const MAX_EMAIL_LENGTH = 255; // email VARCHAR(255)
const MAX_ADDRESS_LENGTH = 200; // address VARCHAR(200)
const MAX_SEARCH_LENGTH = 100;
const MAX_ID = 4294967295; // the largest value of the INT UNSIGNED id column

// Optional "+", then 7 to 13 digits (after removing spaces, dashes, dots and brackets).
const PHONE_PATTERN = /^\+?\d{7,13}$/;
// Simple email check: something@something.something (no spaces).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "5" -> 5. Anything that is not a plain positive whole number (like "abc", "0", "1.5", "-2") -> null.
export function parseId(value) {
  const text = String(value ?? "");
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return id <= MAX_ID ? id : null;
}

// Reads a required text field. Returns { text } (trimmed) or { error }.
function readRequiredText(value, label, maxLength) {
  if (value === undefined || value === null)
    return { error: `${label} is required.` };
  if (typeof value !== "string") return { error: `${label} must be text.` };
  const text = value.trim();
  if (!text) return { error: `${label} is required.` };
  if (text.length > maxLength)
    return { error: `${label} must be ${maxLength} characters or fewer.` };
  return { text };
}

// Reads an optional text field. A missing or empty value becomes "".
function readOptionalText(value, label) {
  if (value === undefined || value === null) return { text: "" };
  if (typeof value !== "string") return { error: `${label} must be text.` };
  return { text: value.trim() };
}

// Checks the body of POST /api/customers and PUT /api/customers/:id.
// Returns { errors, values }. "values" holds the cleaned data and is only meant to be used when errors is empty.
// Text is trimmed and the email is changed to lowercase (the same as the frontend).
// email and address are optional: when empty, they are "".
export function validateCustomerInput(body) {
  const errors = {};

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      errors: { body: "The request body must be a JSON object." },
      values: {},
    };
  }

  const first = readRequiredText(body.firstName, "First name", MAX_NAME_LENGTH);
  if (first.error) errors.firstName = first.error;

  const last = readRequiredText(body.lastName, "Last name", MAX_NAME_LENGTH);
  if (last.error) errors.lastName = last.error;

  // contactNumber: required, stored exactly as typed (so spaces are kept), but it must look like a phone number.
  const contact = readRequiredText(
    body.contactNumber,
    "Contact number",
    MAX_CONTACT_LENGTH,
  );
  if (contact.error) {
    errors.contactNumber = contact.error;
  } else if (!PHONE_PATTERN.test(contact.text.replace(/[\s\-().]/g, ""))) {
    errors.contactNumber =
      "Enter a valid contact number, for example 0917 123 4567.";
  }

  // email (optional): when something is typed it must look like an email.
  const email = readOptionalText(body.email, "Email");
  if (email.error) {
    errors.email = email.error;
  } else if (email.text.length > MAX_EMAIL_LENGTH) {
    errors.email = `Email must be ${MAX_EMAIL_LENGTH} characters or fewer.`;
  } else if (email.text && !EMAIL_PATTERN.test(email.text)) {
    errors.email = "Enter a valid email address, for example name@example.com.";
  }

  // address (optional)
  const address = readOptionalText(body.address, "Address");
  if (address.error) {
    errors.address = address.error;
  } else if (address.text.length > MAX_ADDRESS_LENGTH) {
    errors.address = `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`;
  }

  return {
    errors,
    values: {
      firstName: first.text ?? "",
      lastName: last.text ?? "",
      contactNumber: contact.text ?? "",
      email: (email.text ?? "").toLowerCase(),
      address: address.text ?? "",
    },
  };
}

// Checks the optional ?search=... of GET /api/customers.
// Returns { errors, search } where search is the trimmed text, or undefined when there is nothing to search for.
export function validateSearch(value) {
  if (value === undefined) return { errors: {}, search: undefined };
  if (typeof value !== "string") {
    return {
      errors: { search: "The search must be a single piece of text." },
      search: undefined,
    };
  }
  const search = value.trim();
  if (search.length > MAX_SEARCH_LENGTH) {
    return {
      errors: {
        search: `The search must be ${MAX_SEARCH_LENGTH} characters or fewer.`,
      },
      search: undefined,
    };
  }
  return { errors: {}, search: search === "" ? undefined : search };
}
