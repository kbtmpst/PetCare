// Tests for the appointment validator (no database, no Express).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPOINTMENT_STATUSES,
  parseId,
  isRealDate,
  validateAppointmentInput,
  validateAppointmentFilters,
  validateStatusInput,
} from "../src/business/validators/appointmentValidator.js";

const TODAY = "2026-12-01";
const valid = (overrides = {}) => ({
  petId: 1,
  serviceId: 2,
  date: "2026-12-05",
  time: "09:30",
  notes: "Careful with ears",
  ...overrides,
});
const check = (body, existing = null) =>
  validateAppointmentInput(body, TODAY, existing);

test("the allowed statuses are exactly the ENUM of the appointments table", () => {
  assert.deepEqual(APPOINTMENT_STATUSES, [
    "Pending",
    "Confirmed",
    "In Progress",
    "Completed",
    "Cancelled",
  ]);
});

test("parseId accepts plain positive whole numbers only", () => {
  assert.equal(parseId("5"), 5);
  assert.equal(parseId(5), 5);
  assert.equal(parseId("4294967295"), 4294967295);
  for (const bad of [
    "0",
    "-1",
    "1.5",
    "abc",
    "",
    " 5",
    "5 ",
    "05",
    "+5",
    "1e3",
    "4294967296",
    null,
    undefined,
    {},
    [],
    true,
  ]) {
    assert.equal(parseId(bad), null, JSON.stringify(bad));
  }
});

test("isRealDate checks real calendar dates", () => {
  assert.equal(isRealDate("2028-02-29"), true);
  for (const bad of [
    "2027-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-12-32",
    "2026-1-5",
    "26-12-01",
    "",
    "2026/12/01",
    "2026-12-01T00:00",
  ]) {
    assert.equal(isRealDate(bad), false, bad);
  }
});

test("a valid body gives no errors and clean values", () => {
  const { errors, values } = check(valid());
  assert.deepEqual(errors, {});
  assert.deepEqual(values, {
    petId: 1,
    serviceId: 2,
    date: "2026-12-05",
    time: "09:30",
    notes: "Careful with ears",
  });
});

test("ids may be numbers or plain digit text", () => {
  const { errors, values } = check(valid({ petId: "7", serviceId: "3" }));
  assert.deepEqual(errors, {});
  assert.equal(values.petId, 7);
  assert.equal(values.serviceId, 3);
});

test("notes are optional, trimmed, and empty becomes an empty string", () => {
  for (const notes of [undefined, null, "", "   "]) {
    const { errors, values } = check(valid({ notes }));
    assert.deepEqual(errors, {}, String(notes));
    assert.equal(values.notes, "");
  }
  assert.equal(check(valid({ notes: "  hi  " })).values.notes, "hi");
});

test("required fields: petId, serviceId, date and time", () => {
  const { errors } = check({});
  assert.deepEqual(Object.keys(errors).sort(), [
    "date",
    "petId",
    "serviceId",
    "time",
  ]);
  for (const field of ["petId", "serviceId", "date", "time"]) {
    for (const empty of [undefined, null, ""]) {
      assert.ok(
        check(valid({ [field]: empty })).errors[field],
        `${field} ${empty}`,
      );
    }
  }
});

test("a body that is not an object is treated as empty (all required errors, no crash)", () => {
  for (const body of [undefined, null, "text", 5, [], true]) {
    const { errors } = check(body);
    assert.deepEqual(
      Object.keys(errors).sort(),
      ["date", "petId", "serviceId", "time"],
      JSON.stringify(body),
    );
  }
});

test("invalid petId and serviceId", () => {
  for (const bad of [
    "abc",
    "0",
    "-3",
    "1.5",
    " 2",
    "5x",
    0,
    -1,
    1.5,
    true,
    [1],
    {},
    "99999999999",
  ]) {
    assert.ok(
      check(valid({ petId: bad })).errors.petId,
      `petId ${JSON.stringify(bad)}`,
    );
    assert.ok(
      check(valid({ serviceId: bad })).errors.serviceId,
      `serviceId ${JSON.stringify(bad)}`,
    );
  }
});

test("invalid date formats and values", () => {
  for (const bad of [
    "tomorrow",
    "2026-13-01",
    "2027-02-29",
    "2026-12-5",
    "05/12/2026",
    "2026-12-05T09:30",
    20261205,
    true,
    {},
    [],
  ]) {
    assert.ok(check(valid({ date: bad })).errors.date, JSON.stringify(bad));
  }
});

test("invalid time formats and values", () => {
  for (const bad of [
    "9:30",
    "24:00",
    "12:60",
    "09:30:00",
    "0930",
    "noon",
    "09:3",
    "9.30",
    930,
    true,
    {},
    [],
  ]) {
    assert.ok(check(valid({ time: bad })).errors.time, JSON.stringify(bad));
  }
  for (const good of ["00:00", "09:30", "23:59"]) {
    assert.equal(check(valid({ time: good })).errors.time, undefined, good);
  }
});

test("a date in the past is rejected; today and the future are fine", () => {
  assert.equal(
    check(valid({ date: "2026-11-30" })).errors.date,
    "The date cannot be in the past.",
  );
  assert.equal(
    check(valid({ date: "2020-01-01" })).errors.date,
    "The date cannot be in the past.",
  );
  assert.equal(check(valid({ date: "2026-12-01" })).errors.date, undefined);
  assert.equal(check(valid({ date: "2026-12-02" })).errors.date, undefined);
});

test("editing: keeping the original date is allowed even when it is now in the past, changing it to the past is not", () => {
  const existing = { date: "2026-11-20" };
  assert.equal(
    check(valid({ date: "2026-11-20" }), existing).errors.date,
    undefined,
  );
  assert.equal(
    check(valid({ date: "2026-11-21" }), existing).errors.date,
    "The date cannot be in the past.",
  );
  assert.equal(
    check(valid({ date: "2026-12-10" }), existing).errors.date,
    undefined,
  );
});

test("notes: 300 characters is fine, 301 is too long, and notes must be text", () => {
  assert.equal(
    check(valid({ notes: "x".repeat(300) })).errors.notes,
    undefined,
  );
  assert.ok(check(valid({ notes: "x".repeat(301) })).errors.notes);
  assert.equal(
    check(valid({ notes: "  " + "x".repeat(300) + "  " })).errors.notes,
    undefined,
  ); // trimmed first
  for (const bad of [123, true, {}, ["a"]])
    assert.ok(check(valid({ notes: bad })).errors.notes, JSON.stringify(bad));
});

test("customerId, price, duration, status and id in the body are IGNORED (never in the values, never an error)", () => {
  const { errors, values } = check(
    valid({
      customerId: 999,
      price: 1,
      duration: 5,
      durationMinutes: 5,
      status: "Completed",
      id: 77,
      createdAt: "x",
      role: "admin",
    }),
  );
  assert.deepEqual(errors, {});
  assert.deepEqual(Object.keys(values).sort(), [
    "date",
    "notes",
    "petId",
    "serviceId",
    "time",
  ]);
  assert.equal(JSON.stringify(values).includes("999"), false);
});

test("every error is reported at once", () => {
  const { errors } = check({
    petId: "x",
    serviceId: 0,
    date: "bad",
    time: "bad",
    notes: 5,
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    "date",
    "notes",
    "petId",
    "serviceId",
    "time",
  ]);
});

// --- filters ---------------------------------------------------------------

test("filters: none, all, and a mix", () => {
  assert.deepEqual(validateAppointmentFilters({}), { errors: {}, filters: {} });
  assert.deepEqual(
    validateAppointmentFilters({
      status: "In Progress",
      date: "2026-12-01",
      petId: "4",
      customerId: "9",
    }),
    {
      errors: {},
      filters: {
        status: "In Progress",
        date: "2026-12-01",
        petId: 4,
        customerId: 9,
      },
    },
  );
});

test("filters: invalid values give errors and are left out", () => {
  const { errors, filters } = validateAppointmentFilters({
    status: "Finished",
    date: "2026-02-30",
    petId: "0",
    customerId: "abc",
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    "customerId",
    "date",
    "petId",
    "status",
  ]);
  assert.deepEqual(filters, {});
});

test("filters: arrays and objects (like ?petId=1&petId=2) are rejected, not trusted", () => {
  for (const bad of [["1", "2"], { a: 1 }, 5]) {
    assert.ok(
      validateAppointmentFilters({ petId: bad }).errors.petId,
      JSON.stringify(bad),
    );
    assert.ok(
      validateAppointmentFilters({ customerId: bad }).errors.customerId,
      JSON.stringify(bad),
    );
  }
  assert.ok(validateAppointmentFilters({ status: ["Pending"] }).errors.status);
  assert.ok(validateAppointmentFilters({ date: ["2026-12-01"] }).errors.date);
});

test("filters: a missing or non-object query is fine", () => {
  for (const query of [undefined, null, "x"])
    assert.deepEqual(validateAppointmentFilters(query), {
      errors: {},
      filters: {},
    });
});

// --- status ----------------------------------------------------------------

test("status body: every allowed status passes", () => {
  for (const status of APPOINTMENT_STATUSES)
    assert.deepEqual(validateStatusInput({ status }), { errors: {}, status });
});

test("status body: missing, unknown, wrongly spelled or non-text statuses fail", () => {
  for (const body of [
    {},
    undefined,
    null,
    { status: "" },
    { status: null },
    { status: "Finished" },
    { status: "pending" },
    { status: " Pending" },
    { status: 1 },
    { status: ["Pending"] },
    "Pending",
  ]) {
    const result = validateStatusInput(body);
    assert.ok(result.errors.status, JSON.stringify(body));
    assert.equal(result.status, undefined);
  }
});
