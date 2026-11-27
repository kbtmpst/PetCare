// BUSINESS LAYER: checks the data sent to the Appointments API.
// These functions only check values. They never touch the database or Express.
// They return an object of error messages (empty = OK), like the other validators.
// The limits match the columns of the "appointments" table and the frontend's appointment form.
//
// The body is only allowed to choose: petId, serviceId, date, time, notes.
// Everything else a client might send (customerId, price, duration, status, id ...) is IGNORED here:
// the business service decides the owner, price, duration and status itself.

// The allowed statuses (the ENUM list of the appointments table).
export const APPOINTMENT_STATUSES = [
  "Pending",
  "Confirmed",
  "In Progress",
  "Completed",
  "Cancelled",
];

const MAX_NOTES_LENGTH = 300; // notes VARCHAR(300)
const MAX_ID = 4294967295; // the largest value of the INT UNSIGNED id column

// "5" -> 5. Anything that is not a plain positive whole number (like "abc", "0", "1.5", "-2") -> null.
export function parseId(value) {
  const text = String(value ?? "");
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return id <= MAX_ID ? id : null;
}

// Today as "YYYY-MM-DD" (used only when the caller does not say what today is).
function defaultToday() {
  return new Date().toISOString().slice(0, 10);
}

// True for a real calendar date written as YYYY-MM-DD ("2024-02-29" yes, "2023-02-29" no, "2026-13-01" no).
export function isRealDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// True for a time written as HH:MM on a 24-hour clock ("08:30" yes, "8:30" no, "24:00" no, "12:60" no).
function isRealTime(text) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}

// Reads a required id field (petId, serviceId). Accepts a number or a text like "5".
function readId(value, label) {
  if (value === undefined || value === null || value === "")
    return { error: `${label} is required.` };
  if (typeof value !== "number" && typeof value !== "string")
    return { error: `${label} must be a positive whole number.` };
  const id = parseId(value);
  if (id === null)
    return { error: `${label} must be a positive whole number.` };
  return { id };
}

// Checks the body of POST /api/appointments and PUT /api/appointments/:id.
// Returns { errors, values }. "values" holds the cleaned data and is only meant to be used when errors is empty:
//   { petId, serviceId, date, time, notes }   (notes is "" when empty)
// "today" ("YYYY-MM-DD") rejects a date in the past. The business service passes it in.
// "existing" is the appointment being edited, or null when creating. When editing, an appointment that keeps
// its original date is still allowed (the same rule as the frontend form).
export function validateAppointmentInput(
  body,
  today = defaultToday(),
  existing = null,
) {
  const errors = {};
  const input =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? body
      : {};

  const pet = readId(input.petId, "Pet (petId)");
  if (pet.error) errors.petId = pet.error;

  const service = readId(input.serviceId, "Service (serviceId)");
  if (service.error) errors.serviceId = service.error;

  let date = "";
  if (input.date === undefined || input.date === null || input.date === "") {
    errors.date = "Date is required.";
  } else if (typeof input.date !== "string" || !isRealDate(input.date)) {
    errors.date = "Date must be a real date written as YYYY-MM-DD.";
  } else {
    date = input.date;
    const dateChanged = !existing || date !== existing.date;
    if (dateChanged && date < today)
      errors.date = "The date cannot be in the past.";
  }

  let time = "";
  if (input.time === undefined || input.time === null || input.time === "") {
    errors.time = "Time is required.";
  } else if (typeof input.time !== "string" || !isRealTime(input.time)) {
    errors.time =
      "Time must be written as HH:MM on a 24-hour clock, for example 13:30.";
  } else {
    time = input.time;
  }

  let notes = "";
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== "string") {
      errors.notes = "Notes must be text.";
    } else {
      notes = input.notes.trim();
      if (notes.length > MAX_NOTES_LENGTH)
        errors.notes = `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`;
    }
  }

  return {
    errors,
    values: { petId: pet.id, serviceId: service.id, date, time, notes },
  };
}

// Checks the optional filters of GET /api/appointments:
//   ?status=Pending  ?date=2026-12-01  ?petId=5  ?customerId=3
// Returns { errors, filters }. A filter that is not used is left out of "filters".
export function validateAppointmentFilters(query) {
  const errors = {};
  const filters = {};
  const input = query !== null && typeof query === "object" ? query : {};

  if (input.status !== undefined) {
    if (
      typeof input.status !== "string" ||
      !APPOINTMENT_STATUSES.includes(input.status)
    ) {
      errors.status = `The status filter must be one of: ${APPOINTMENT_STATUSES.join(", ")}.`;
    } else {
      filters.status = input.status;
    }
  }

  if (input.date !== undefined) {
    if (typeof input.date !== "string" || !isRealDate(input.date)) {
      errors.date =
        "The date filter must be a real date written as YYYY-MM-DD.";
    } else {
      filters.date = input.date;
    }
  }

  for (const name of ["petId", "customerId"]) {
    if (input[name] !== undefined) {
      const id = typeof input[name] === "string" ? parseId(input[name]) : null;
      if (id === null)
        errors[name] = `The ${name} filter must be a positive whole number.`;
      else filters[name] = id;
    }
  }

  return { errors, filters };
}

// Checks the body of PATCH /api/appointments/:id/status: { status: "Confirmed" }.
// Returns { errors, status }. Whether the move is allowed is decided by the business service.
export function validateStatusInput(body) {
  const errors = {};
  const input =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? body
      : {};

  if (
    input.status === undefined ||
    input.status === null ||
    input.status === ""
  ) {
    errors.status = "Status is required.";
  } else if (
    typeof input.status !== "string" ||
    !APPOINTMENT_STATUSES.includes(input.status)
  ) {
    errors.status = `Status must be one of: ${APPOINTMENT_STATUSES.join(", ")}.`;
  }

  return { errors, status: errors.status ? undefined : input.status };
}
