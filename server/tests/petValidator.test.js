// Unit tests for the Pets validators. They need no database and no Express.
// Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseId,
  validatePetInput,
  validatePetFilters,
  PET_SPECIES,
  PET_SEXES,
} from "../src/business/validators/petValidator.js";

const TODAY = "2026-11-26"; // a fixed "today" so the tests give the same result every day

const valid = {
  customerId: 1,
  name: "Mochi",
  species: "Dog",
  breed: "Shih Tzu",
  birthDate: "2023-08-14",
  sex: "Male",
  notes: "Loves water",
};

const check = (changes) => validatePetInput({ ...valid, ...changes }, TODAY);

// ---------------------------------------------------------------------------
// ids
// ---------------------------------------------------------------------------

test("parseId accepts positive whole numbers only (invalid pet ids)", () => {
  assert.equal(parseId("5"), 5);
  assert.equal(parseId("4294967295"), 4294967295);
  for (const bad of [
    "0",
    "-1",
    "1.5",
    "abc",
    " 2",
    "",
    "01",
    undefined,
    null,
    "4294967296",
    "1e3",
    "PET-001",
  ]) {
    assert.equal(parseId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------------------------
// valid data and optional fields
// ---------------------------------------------------------------------------

test("valid pet data passes", () => {
  const { errors, values } = validatePetInput(valid, TODAY);
  assert.deepEqual(errors, {});
  assert.deepEqual(values, valid);
});

test("birthDate and notes are optional", () => {
  const { errors, values } = validatePetInput(
    {
      customerId: 2,
      name: "Cooper",
      species: "Dog",
      breed: "Golden Retriever",
      sex: "Male",
    },
    TODAY,
  );
  assert.deepEqual(errors, {});
  assert.equal(values.birthDate, "");
  assert.equal(values.notes, "");
});

test("null, empty and blank birthDate/notes are accepted as empty", () => {
  for (const empty of [null, "", "   "]) {
    const { errors, values } = check({ birthDate: empty, notes: empty });
    assert.deepEqual(errors, {});
    assert.equal(values.birthDate, "");
    assert.equal(values.notes, "");
  }
});

test("every allowed species and sex is accepted", () => {
  for (const species of PET_SPECIES)
    assert.deepEqual(check({ species }).errors, {}, species);
  for (const sex of PET_SEXES) assert.deepEqual(check({ sex }).errors, {}, sex);
});

test("customerId may be a number or digits in text", () => {
  assert.equal(check({ customerId: "7" }).values.customerId, 7);
  assert.equal(check({ customerId: 7 }).values.customerId, 7);
});

test("unknown fields are ignored (id, createdAt cannot be set by the client)", () => {
  const { errors, values } = validatePetInput(
    { ...valid, id: 99, createdAt: "2000-01-01", ownerName: "x" },
    TODAY,
  );
  assert.deepEqual(errors, {});
  assert.deepEqual(Object.keys(values).sort(), [
    "birthDate",
    "breed",
    "customerId",
    "name",
    "notes",
    "sex",
    "species",
  ]);
});

// ---------------------------------------------------------------------------
// required fields
// ---------------------------------------------------------------------------

test("required fields are reported", () => {
  const { errors } = validatePetInput({}, TODAY);
  assert.equal(errors.customerId, "Owner (customerId) is required.");
  assert.equal(errors.name, "Pet name is required.");
  assert.equal(errors.species, "Species is required.");
  assert.equal(errors.breed, "Breed is required.");
  assert.equal(errors.sex, "Sex is required.");
  assert.equal(errors.birthDate, undefined);
  assert.equal(errors.notes, undefined);
});

test("blank (spaces only) and null required fields count as missing", () => {
  const { errors } = validatePetInput(
    { customerId: "", name: "   ", species: "", breed: "\t", sex: null },
    TODAY,
  );
  assert.equal(errors.customerId, "Owner (customerId) is required.");
  assert.equal(errors.name, "Pet name is required.");
  assert.equal(errors.species, "Species is required.");
  assert.equal(errors.breed, "Breed is required.");
  assert.equal(errors.sex, "Sex is required.");
});

// ---------------------------------------------------------------------------
// trimming
// ---------------------------------------------------------------------------

test("text is trimmed", () => {
  const { errors, values } = check({
    name: "  Mochi ",
    breed: " Shih Tzu  ",
    species: " Dog ",
    sex: " Male ",
    birthDate: " 2023-08-14 ",
    notes: "  Loves water  ",
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(values, valid);
});

// ---------------------------------------------------------------------------
// field formats and boundaries
// ---------------------------------------------------------------------------

test("name and breed: 50 characters is allowed, 51 is not", () => {
  assert.deepEqual(
    check({ name: "x".repeat(50), breed: "y".repeat(50) }).errors,
    {},
  );
  assert.equal(
    check({ name: "x".repeat(51) }).errors.name,
    "Pet name must be 50 characters or fewer.",
  );
  assert.equal(
    check({ breed: "y".repeat(51) }).errors.breed,
    "Breed must be 50 characters or fewer.",
  );
  assert.deepEqual(check({ name: "x" }).errors, {}); // 1 character is enough
});

test("name and breed must be text", () => {
  assert.equal(check({ name: 123 }).errors.name, "Pet name must be text.");
  assert.equal(check({ breed: ["Aspin"] }).errors.breed, "Breed must be text.");
});

test("notes: 300 characters is allowed, 301 is not", () => {
  assert.deepEqual(check({ notes: "n".repeat(300) }).errors, {});
  assert.equal(
    check({ notes: "n".repeat(301) }).errors.notes,
    "Notes must be 300 characters or fewer.",
  );
  assert.equal(check({ notes: 42 }).errors.notes, "Notes must be text.");
});

test("species and sex must be one of the allowed choices", () => {
  assert.equal(
    check({ species: "Bird" }).errors.species,
    "Species must be one of: Dog, Cat, Other.",
  );
  assert.equal(
    check({ species: "dog" }).errors.species,
    "Species must be one of: Dog, Cat, Other.",
  );
  assert.ok(check({ species: 5 }).errors.species);
  assert.equal(
    check({ sex: "Unknown" }).errors.sex,
    "Sex must be one of: Male, Female.",
  );
  assert.ok(check({ sex: "male" }).errors.sex);
  assert.ok(check({ sex: true }).errors.sex);
});

test("birthDate: boundary values around today", () => {
  assert.deepEqual(check({ birthDate: TODAY }).errors, {}); // today is allowed
  assert.deepEqual(check({ birthDate: "2026-11-25" }).errors, {}); // yesterday
  assert.equal(
    check({ birthDate: "2026-11-27" }).errors.birthDate,
    "Date of birth cannot be in the future.",
  );
  assert.equal(
    check({ birthDate: "2099-01-01" }).errors.birthDate,
    "Date of birth cannot be in the future.",
  );
});

test("birthDate: boundary values for the oldest allowed date", () => {
  assert.deepEqual(check({ birthDate: "1900-01-01" }).errors, {});
  assert.equal(
    check({ birthDate: "1899-12-31" }).errors.birthDate,
    "Date of birth cannot be before 1900.",
  );
});

test("birthDate: must be a real YYYY-MM-DD date", () => {
  assert.deepEqual(check({ birthDate: "2024-02-29" }).errors, {}); // leap day
  for (const bad of [
    "2023-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "2026-1-5",
    "14/08/2023",
    "2023-08-14T10:00:00",
    "yesterday",
    "0000-01-01",
  ]) {
    assert.ok(
      check({ birthDate: bad }).errors.birthDate,
      `should reject ${bad}`,
    );
  }
  assert.ok(check({ birthDate: 20230814 }).errors.birthDate); // a number, not text
});

// ---------------------------------------------------------------------------
// invalid customer / owner ids
// ---------------------------------------------------------------------------

test("invalid customerId values are rejected", () => {
  for (const bad of [
    0,
    -1,
    1.5,
    "abc",
    "0",
    "-3",
    " 2",
    "1.5",
    "CUS-001",
    "4294967296",
    true,
    [1],
    { id: 1 },
    NaN,
  ]) {
    assert.equal(
      check({ customerId: bad }).errors.customerId,
      "customerId must be a positive whole number.",
      `should reject ${JSON.stringify(bad)}`,
    );
  }
});

test("customerId boundary values", () => {
  assert.equal(check({ customerId: 1 }).errors.customerId, undefined);
  assert.equal(check({ customerId: 4294967295 }).errors.customerId, undefined);
  assert.ok(check({ customerId: 4294967296 }).errors.customerId);
});

// ---------------------------------------------------------------------------
// invalid bodies and combined errors
// ---------------------------------------------------------------------------

test("body must be a JSON object", () => {
  for (const bad of [null, undefined, "text", 5, true, []]) {
    assert.equal(
      validatePetInput(bad, TODAY).errors.body,
      "The request body must be a JSON object.",
    );
  }
});

test("several errors are reported together", () => {
  const { errors } = validatePetInput(
    {
      customerId: "x",
      name: "",
      species: "Fish",
      breed: "y".repeat(51),
      sex: "?",
      birthDate: "2099-01-01",
      notes: "n".repeat(301),
    },
    TODAY,
  );
  assert.deepEqual(Object.keys(errors).sort(), [
    "birthDate",
    "breed",
    "customerId",
    "name",
    "notes",
    "sex",
    "species",
  ]);
});

// ---------------------------------------------------------------------------
// list filters (?customerId= and ?search=)
// ---------------------------------------------------------------------------

test("filters: nothing given means no filter", () => {
  assert.deepEqual(validatePetFilters({}), {
    errors: {},
    customerId: undefined,
    search: undefined,
  });
});

test("filters: customerId and search can be used together", () => {
  assert.deepEqual(validatePetFilters({ customerId: "3", search: "  mo " }), {
    errors: {},
    customerId: 3,
    search: "mo",
  });
});

test("filters: blank search means no search", () => {
  assert.equal(validatePetFilters({ search: "   " }).search, undefined);
  assert.deepEqual(validatePetFilters({ search: "" }).errors, {});
});

test("filters: invalid customerId is rejected", () => {
  for (const bad of ["0", "-1", "abc", "1.5", "", ["1", "2"], { a: "1" }]) {
    assert.equal(
      validatePetFilters({ customerId: bad }).errors.customerId,
      "The customerId filter must be a positive whole number.",
      `should reject ${JSON.stringify(bad)}`,
    );
  }
});

test("filters: invalid search is rejected (repeated parameter, too long)", () => {
  assert.ok(validatePetFilters({ search: ["a", "b"] }).errors.search);
  assert.ok(validatePetFilters({ search: { x: "y" } }).errors.search);
  assert.ok(validatePetFilters({ search: "x".repeat(101) }).errors.search);
  assert.deepEqual(validatePetFilters({ search: "x".repeat(100) }).errors, {});
});
