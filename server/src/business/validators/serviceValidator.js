// BUSINESS LAYER: checks the data sent to the Services API.
// These functions only check values. They never touch the database or Express.
// They return an object of error messages (empty = OK), like the frontend's serviceValidator.

const MAX_NAME_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_PRICE = 100000;
const MAX_DURATION_MINUTES = 600; // 10 hours is far longer than any grooming session
const MAX_ID = 4294967295; // the largest value of the INT UNSIGNED id column

// "5" -> 5. Anything that is not a plain positive whole number (like "abc", "0", "1.5", "-2") -> null.
export function parseId(value) {
  const text = String(value ?? "");
  if (!/^[1-9]\d+$|^[1-9]$/.test(text)) return null;
  const id = Number(text);
  return id <= MAX_ID ? id : null;
}

// Reads a number that may arrive as a JSON number (650) or as digits in text ("650").
// Returns { number } when it is a number, { empty: true } when missing, or { invalid: true } otherwise.
function readNumber(value) {
  if (value === undefined || value === null) return { empty: true };

  if (typeof value === "number") {
    return Number.isFinite(value) ? { number: value } : { invalid: true };
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return { empty: true };
    // Only plain decimals like "650" or "-5" or "19.99" (no "1e3", no "0x10", no "abc").
    return /^-?\d+(\.\d+)?$/.test(text)
      ? { number: Number(text) }
      : { invalid: true };
  }
  return { invalid: true }; // booleans, arrays, objects...
}

// Checks the body of POST /api/services and PUT /api/services/:id.
// Returns { errors, values }. "values" holds the cleaned data and is only meant to be used when errors is empty.
// "active" is optional: when it is left out, values.active is undefined (the caller decides the default).
export function validateServiceInput(body) {
  const errors = {};

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      errors: { body: "The request body must be a JSON object." },
      values: {},
    };
  }

  // name
  let name = "";
  if (typeof body.name !== "string") {
    errors.name =
      body.name === undefined || body.name === null
        ? "Service name is required."
        : "Service name must be text.";
  } else {
    name = body.name.trim();
    if (!name) errors.name = "Service name is required.";
    else if (name.length > MAX_NAME_LENGTH)
      errors.name = `Service name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  // description (optional)
  let description = "";
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      errors.description = "Description must be text.";
    } else {
      description = body.description.trim();
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
      }
    }
  }

  // price: required, a number from 0 to 100,000 with at most 2 decimal places
  let price = 0;
  const priceInput = readNumber(body.price);
  if (priceInput.empty) {
    errors.price = "Price is required.";
  } else if (priceInput.invalid) {
    errors.price = "Price must be a number.";
  } else if (priceInput.number < 0) {
    errors.price = "Price cannot be negative.";
  } else if (priceInput.number > MAX_PRICE) {
    errors.price = `Price cannot be more than ${MAX_PRICE.toLocaleString("en-US")}.`;
  } else if (Math.round(priceInput.number * 100) / 100 !== priceInput.number) {
    errors.price = "Price can have at most 2 decimal places.";
  } else {
    price = priceInput.number;
  }

  // durationMinutes: required, a whole number from 1 to 600
  let durationMinutes = 0;
  const durationInput = readNumber(body.durationMinutes);
  if (durationInput.empty) {
    errors.durationMinutes = "Duration is required.";
  } else if (durationInput.invalid) {
    errors.durationMinutes = "Duration must be a number of minutes.";
  } else if (!Number.isInteger(durationInput.number)) {
    errors.durationMinutes = "Duration must be a whole number of minutes.";
  } else if (durationInput.number <= 0) {
    errors.durationMinutes = "Duration must be more than 0 minutes.";
  } else if (durationInput.number > MAX_DURATION_MINUTES) {
    errors.durationMinutes = `Duration cannot be more than ${MAX_DURATION_MINUTES} minutes.`;
  } else {
    durationMinutes = durationInput.number;
  }

  // active (optional): must be true or false when it is sent
  let active;
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean")
      errors.active = "active must be true or false.";
    else active = body.active;
  }

  return {
    errors,
    values: { name, description, price, durationMinutes, active },
  };
}

// Checks the body of PATCH /api/services/:id/status. It must be { "active": true } or { "active": false }.
export function validateStatusInput(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      errors: { body: "The request body must be a JSON object." },
      active: undefined,
    };
  }
  if (typeof body.active !== "boolean") {
    return {
      errors: { active: "active is required and must be true or false." },
      active: undefined,
    };
  }
  return { errors: {}, active: body.active };
}

// Checks the optional ?active=true or ?active=false filter of GET /api/services.
// Returns { errors, active } where active is true, false, or undefined (no filter).
export function validateActiveFilter(value) {
  if (value === undefined) return { errors: {}, active: undefined };
  if (value === "true") return { errors: {}, active: true };
  if (value === "false") return { errors: {}, active: false };
  return {
    errors: { active: 'The active filter must be "true" or "false".' },
    active: undefined,
  };
}
