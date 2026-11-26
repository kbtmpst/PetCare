// BUSINESS LAYER: checks the data sent to the authentication API.
// These functions only check values. They never touch the database or Express.
// They return an object of error messages (empty = OK), like the other validators.
import { validateCustomerInput } from "./customerValidator.js";

const MAX_EMAIL_LENGTH = 255; // users.email VARCHAR(255)
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes, so longer passwords are refused
const MAX_LOGIN_PASSWORD_LENGTH = 1000; // just a sanity limit for the login form
// Simple email check: something@something.something (no spaces).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isObject(body) {
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

// Reads the email: trimmed and lowercase (so "Maria@Example.com " and "maria@example.com" are the same account).
// With checkFormat false (used by login) only "present, text, not too long" is checked.
// Returns { email } or { error }.
function readEmail(value, { checkFormat }) {
  if (value === undefined || value === null)
    return { error: "Email is required." };
  if (typeof value !== "string") return { error: "Email must be text." };
  const email = value.trim().toLowerCase();
  if (!email) return { error: "Email is required." };
  if (email.length > MAX_EMAIL_LENGTH)
    return { error: `Email must be ${MAX_EMAIL_LENGTH} characters or fewer.` };
  if (checkFormat && !EMAIL_PATTERN.test(email)) {
    return {
      error: "Enter a valid email address, for example name@example.com.",
    };
  }
  return { email };
}

// The password rules for NEW passwords. Returns an error message, or null when the password is fine.
// The password is never trimmed or changed: it is used exactly as typed.
export function validatePassword(value, label = "Password") {
  if (value === undefined || value === null || value === "")
    return `${label} is required.`;
  if (typeof value !== "string") return `${label} must be text.`;
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    return `${label} is too long (the limit is ${MAX_PASSWORD_BYTES} bytes, about ${MAX_PASSWORD_BYTES} characters).`;
  }
  if (value.length < MIN_PASSWORD_LENGTH)
    return `${label} must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/\p{L}/u.test(value) || !/\d/.test(value))
    return `${label} must contain at least one letter and one number.`;
  return null;
}

// Reads a password that is only being CHECKED (login, current password): just "present, text, not huge".
function readExistingPassword(value, label) {
  if (value === undefined || value === null || value === "")
    return { error: `${label} is required.` };
  if (typeof value !== "string") return { error: `${label} must be text.` };
  if (value.length > MAX_LOGIN_PASSWORD_LENGTH)
    return { error: `${label} is too long.` };
  return { password: value };
}

// Checks the body of POST /api/auth/register (a customer signing up).
// The account role is NOT read from the request: a registration always creates a "customer".
// Returns { errors, values } with values = { email, password, firstName, lastName, contactNumber, address }.
export function validateRegisterInput(body) {
  if (!isObject(body)) {
    return {
      errors: { body: "The request body must be a JSON object." },
      values: {},
    };
  }

  const errors = {};

  const email = readEmail(body.email, { checkFormat: true });
  if (email.error) errors.email = email.error;

  const passwordError = validatePassword(body.password, "Password");
  if (passwordError) errors.password = passwordError;

  // The profile fields follow exactly the same rules as the Customers API.
  const profile = validateCustomerInput({
    firstName: body.firstName,
    lastName: body.lastName,
    contactNumber: body.contactNumber,
    address: body.address,
  });
  Object.assign(errors, profile.errors);

  return {
    errors,
    values: {
      email: email.email ?? "",
      password: typeof body.password === "string" ? body.password : "",
      firstName: profile.values.firstName,
      lastName: profile.values.lastName,
      contactNumber: profile.values.contactNumber,
      address: profile.values.address,
    },
  };
}

// Checks the body of POST /api/auth/login. Returns { errors, values: { email, password } }.
// Whether the email and password are CORRECT is decided later, with one generic message.
export function validateLoginInput(body) {
  if (!isObject(body)) {
    return {
      errors: { body: "The request body must be a JSON object." },
      values: {},
    };
  }

  const errors = {};
  const email = readEmail(body.email, { checkFormat: false });
  if (email.error) errors.email = email.error;
  const password = readExistingPassword(body.password, "Password");
  if (password.error) errors.password = password.error;

  return {
    errors,
    values: { email: email.email ?? "", password: password.password ?? "" },
  };
}

// Checks the body of POST /api/auth/change-password.
// Returns { errors, values: { currentPassword, newPassword } }.
export function validateChangePasswordInput(body) {
  if (!isObject(body)) {
    return {
      errors: { body: "The request body must be a JSON object." },
      values: {},
    };
  }

  const errors = {};
  const current = readExistingPassword(
    body.currentPassword,
    "Current password",
  );
  if (current.error) errors.currentPassword = current.error;

  const newPasswordError = validatePassword(body.newPassword, "New password");
  if (newPasswordError) {
    errors.newPassword = newPasswordError;
  } else if (
    current.password !== undefined &&
    body.newPassword === current.password
  ) {
    errors.newPassword =
      "The new password must be different from the current password.";
  }

  return {
    errors,
    values: {
      currentPassword: current.password ?? "",
      newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
    },
  };
}
