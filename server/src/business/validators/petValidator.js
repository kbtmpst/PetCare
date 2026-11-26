// BUSINESS LAYER: checks the data sent to the Pets API.
// These functions only check values. They never touch the database or Express.
// They return an object of error messages (empty = OK), like the frontend's petValidator.
// The limits and the allowed choices match the columns of the "pets" table.

// The allowed choices (the ENUM lists of the pets table).
export const PET_SPECIES = ["Dog", "Cat", "Other"];
export const PET_SEXES = ["Male", "Female"];

const MAX_NAME_LENGTH = 50; // name VARCHAR(50)
const MAX_BREED_LENGTH = 50; // breed VARCHAR(50)
const MAX_NOTES_LENGTH = 300; // notes VARCHAR(300)
const MAX_SEARCH_LENGTH = 100;
const MAX_ID = 4294967295; // the largest value of the INT UNSIGNED id column
const MIN_BIRTH_YEAR = 1900;

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
function isRealDate(text) {
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

// Reads a field that must be one of a fixed list (exact spelling, like "Dog").
function readChoice(value, label, choices) {
  if (value === undefined || value === null || value === "")
    return { error: `${label} is required.` };
  const text = typeof value === "string" ? value.trim() : value;
  if (!choices.includes(text))
    return { error: `${label} must be one of: ${choices.join(", ")}.` };
  return { text };
}

// Checks the body of POST /api/pets and PUT /api/pets/:id.
// Returns { errors, values }. "values" holds the cleaned data and is only meant to be used when errors is empty.
// "today" ("YYYY-MM-DD") is used to reject a birth date in the future. The business service passes it in.
// birthDate and notes are optional: when empty, they are "".
export function validatePetInput(body, today = defaultToday()) {
  const errors = {};

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      errors: { body: "The request body must be a JSON object." },
      values: {},
    };
  }

  // customerId (the owner): required, a positive whole number. Whether that customer exists is checked later.
  let customerId = null;
  if (
    body.customerId === undefined ||
    body.customerId === null ||
    body.customerId === ""
  ) {
    errors.customerId = "Owner (customerId) is required.";
  } else if (
    typeof body.customerId !== "number" &&
    typeof body.customerId !== "string"
  ) {
    errors.customerId = "customerId must be a positive whole number.";
  } else {
    customerId = parseId(body.customerId);
    if (customerId === null)
      errors.customerId = "customerId must be a positive whole number.";
  }

  const name = readRequiredText(body.name, "Pet name", MAX_NAME_LENGTH);
  if (name.error) errors.name = name.error;

  const species = readChoice(body.species, "Species", PET_SPECIES);
  if (species.error) errors.species = species.error;

  const breed = readRequiredText(body.breed, "Breed", MAX_BREED_LENGTH);
  if (breed.error) errors.breed = breed.error;

  const sex = readChoice(body.sex, "Sex", PET_SEXES);
  if (sex.error) errors.sex = sex.error;

  // birthDate (optional): a real date written as YYYY-MM-DD, not in the future.
  let birthDate = "";
  if (body.birthDate !== undefined && body.birthDate !== null) {
    if (typeof body.birthDate !== "string") {
      errors.birthDate = "Date of birth must be text written as YYYY-MM-DD.";
    } else {
      birthDate = body.birthDate.trim();
      if (birthDate !== "") {
        if (!isRealDate(birthDate)) {
          errors.birthDate =
            "Date of birth must be a real date written as YYYY-MM-DD.";
        } else if (Number(birthDate.slice(0, 4)) < MIN_BIRTH_YEAR) {
          errors.birthDate = `Date of birth cannot be before ${MIN_BIRTH_YEAR}.`;
        } else if (birthDate > today) {
          errors.birthDate = "Date of birth cannot be in the future.";
        }
      }
    }
  }

  // notes (optional)
  let notes = "";
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") {
      errors.notes = "Notes must be text.";
    } else {
      notes = body.notes.trim();
      if (notes.length > MAX_NOTES_LENGTH)
        errors.notes = `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`;
    }
  }

  return {
    errors,
    values: {
      customerId,
      name: name.text ?? "",
      species: species.text ?? "",
      breed: breed.text ?? "",
      birthDate,
      sex: sex.text ?? "",
      notes,
    },
  };
}

// Checks the optional ?customerId=... and ?search=... of GET /api/pets.
// Returns { errors, customerId, search }. A filter that is not used is undefined.
export function validatePetFilters(query) {
  const errors = {};
  let customerId;
  let search;

  if (query.customerId !== undefined) {
    customerId =
      typeof query.customerId === "string" ? parseId(query.customerId) : null;
    if (customerId === null) {
      errors.customerId =
        "The customerId filter must be a positive whole number.";
      customerId = undefined;
    }
  }

  if (query.search !== undefined) {
    if (typeof query.search !== "string") {
      errors.search = "The search must be a single piece of text.";
    } else {
      const text = query.search.trim();
      if (text.length > MAX_SEARCH_LENGTH)
        errors.search = `The search must be ${MAX_SEARCH_LENGTH} characters or fewer.`;
      else if (text !== "") search = text;
    }
  }

  return { errors, customerId, search };
}
