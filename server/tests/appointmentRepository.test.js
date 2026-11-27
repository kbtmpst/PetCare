// Tests for the SQL of the appointment repository, using a FAKE connection (no MySQL).
// They prove the SQL text, the placeholders and the ORDER of the parameters, and how rows become objects.
// They do NOT prove MySQL accepts the statements. That needs the real-database checks.
//
// The repository file imports the real MySQL pool (mysql2 + your .env). If that cannot load here, these tests are
// SKIPPED instead of failing.
import { test } from "node:test";
import assert from "node:assert/strict";

let repository = null;
try {
  repository =
    await import("../src/data/repositories/appointmentRepository.js");
} catch {
  repository = null; // mysql2 / the environment settings are not available in this environment
}
const skip =
  repository === null
    ? "the MySQL pool cannot be loaded here (needs mysql2 and server/.env)"
    : false;

// A fake connection. "answers" is a list of results returned for the 1st, 2nd ... query.
function fakeConnection(answers = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      return answers[calls.length - 1] ?? [[]];
    },
  };
}

const ROW = {
  id: 5,
  pet_id: 1,
  customer_id: 30,
  service_id: 2,
  service_name: "Basic Bath",
  price: "350.00",
  duration_minutes: 60,
  appointment_date: "2026-12-10",
  start_time: "08:30:00",
  notes: null,
  status: "Pending",
};
const EXPECTED = {
  id: 5,
  petId: 1,
  customerId: 30,
  serviceId: 2,
  service: "Basic Bath",
  price: 350,
  durationMinutes: 60,
  date: "2026-12-10",
  time: "08:30",
  notes: "",
  status: "Pending",
};

test(
  "a row becomes an appointment: DECIMAL text to number, 08:30:00 to 08:30, NULL notes to empty text",
  { skip },
  async () => {
    const connection = fakeConnection([[[ROW]]]);
    const tx = repository.createTransactionQueries(connection);
    assert.deepEqual(await tx.getAppointmentById(5), EXPECTED);
    assert.deepEqual(connection.calls[0].params, [5]);
    assert.match(connection.calls[0].sql, /WHERE a\.id = \?$/);
  },
);

test(
  "getAppointmentById gives null when there is no row",
  { skip },
  async () => {
    assert.equal(
      await repository
        .createTransactionQueries(fakeConnection())
        .getAppointmentById(99),
      null,
    );
  },
);

test(
  "getAppointmentForUpdate locks ONLY the appointment row (FOR UPDATE OF a)",
  { skip },
  async () => {
    const connection = fakeConnection([[[ROW]]]);
    const found = await repository
      .createTransactionQueries(connection)
      .getAppointmentForUpdate(5);
    assert.deepEqual(found, EXPECTED);
    assert.match(connection.calls[0].sql, /WHERE a\.id = \? FOR UPDATE OF a$/);
    assert.deepEqual(connection.calls[0].params, [5]);
  },
);

test(
  "findScheduleCandidates: day before to day after, Cancelled ignored, placeholders only",
  { skip },
  async () => {
    const connection = fakeConnection([
      [
        [
          {
            id: 3,
            appointment_date: "2026-12-10",
            start_time: "10:00:00",
            duration_minutes: 120,
          },
        ],
      ],
    ]);
    const found = await repository
      .createTransactionQueries(connection)
      .findScheduleCandidates({ date: "2026-12-10" });
    assert.deepEqual(found, [
      { id: 3, date: "2026-12-10", time: "10:00", durationMinutes: 120 },
    ]);
    const { sql, params } = connection.calls[0];
    assert.match(
      sql,
      /BETWEEN DATE_SUB\(\?, INTERVAL 1 DAY\) AND DATE_ADD\(\?, INTERVAL 1 DAY\)/,
    );
    assert.match(sql, /status <> 'Cancelled'/);
    assert.equal(sql.includes("id <> ?"), false);
    assert.deepEqual(params, ["2026-12-10", "2026-12-10"]);
  },
);

test(
  "findScheduleCandidates with excludeId leaves the appointment being edited out",
  { skip },
  async () => {
    const connection = fakeConnection();
    await repository
      .createTransactionQueries(connection)
      .findScheduleCandidates({ date: "2026-12-10", excludeId: 8 });
    assert.match(connection.calls[0].sql, /AND id <> \?$/);
    assert.deepEqual(connection.calls[0].params, [
      "2026-12-10",
      "2026-12-10",
      8,
    ]);
  },
);

test(
  "insertAppointment: parameter order matches the columns, an empty note becomes NULL, and it reads the new row back",
  { skip },
  async () => {
    const connection = fakeConnection([[{ insertId: 5 }], [[ROW]]]);
    const created = await repository
      .createTransactionQueries(connection)
      .insertAppointment({
        petId: 1,
        customerId: 30,
        serviceId: 2,
        price: 350,
        durationMinutes: 60,
        date: "2026-12-10",
        time: "08:30",
        notes: "",
        status: "Pending",
      });
    assert.deepEqual(created, EXPECTED);
    assert.match(
      connection.calls[0].sql,
      /INSERT INTO appointments \(pet_id, customer_id, service_id, price, duration_minutes, appointment_date, start_time, notes, status\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)/,
    );
    assert.deepEqual(connection.calls[0].params, [
      1,
      30,
      2,
      350,
      60,
      "2026-12-10",
      "08:30",
      null,
      "Pending",
    ]);
    assert.deepEqual(connection.calls[1].params, [5]); // read back by the new id
  },
);

test("insertAppointment keeps a real note", { skip }, async () => {
  const connection = fakeConnection([[{ insertId: 5 }], [[ROW]]]);
  await repository.createTransactionQueries(connection).insertAppointment({
    petId: 1,
    customerId: 30,
    serviceId: 2,
    price: 350,
    durationMinutes: 60,
    date: "2026-12-10",
    time: "08:30",
    notes: "Nervous",
    status: "Pending",
  });
  assert.equal(connection.calls[0].params[7], "Nervous");
});

test(
  "updateAppointmentDetails never touches the status, and puts the id last",
  { skip },
  async () => {
    const connection = fakeConnection([[{}], [[ROW]]]);
    const updated = await repository
      .createTransactionQueries(connection)
      .updateAppointmentDetails(5, {
        petId: 2,
        customerId: 30,
        serviceId: 1,
        price: 650,
        durationMinutes: 120,
        date: "2026-12-11",
        time: "09:00",
        notes: "",
      });
    assert.deepEqual(updated, EXPECTED);
    const { sql, params } = connection.calls[0];
    assert.match(
      sql,
      /^UPDATE appointments SET pet_id = \?, customer_id = \?, service_id = \?, price = \?, duration_minutes = \?, appointment_date = \?, start_time = \?, notes = \? WHERE id = \?$/,
    );
    assert.equal(/status/.test(sql), false);
    assert.deepEqual(params, [
      2,
      30,
      1,
      650,
      120,
      "2026-12-11",
      "09:00",
      null,
      5,
    ]);
  },
);

test(
  "setStatus changes only the status of one appointment",
  { skip },
  async () => {
    const connection = fakeConnection();
    await repository
      .createTransactionQueries(connection)
      .setStatus(5, "Confirmed");
    assert.equal(
      connection.calls[0].sql,
      "UPDATE appointments SET status = ? WHERE id = ?",
    );
    assert.deepEqual(connection.calls[0].params, ["Confirmed", 5]);
  },
);

test(
  "insertTransaction writes the Pending payment record on the same connection",
  { skip },
  async () => {
    const connection = fakeConnection([[{ insertId: 11 }]]);
    const id = await repository
      .createTransactionQueries(connection)
      .insertTransaction({
        appointmentId: 5,
        serviceName: "Basic Bath",
        amount: 350,
      });
    assert.equal(id, 11);
    assert.match(connection.calls[0].sql, /^INSERT INTO transactions/);
    assert.deepEqual(connection.calls[0].params, [5, "Basic Bath", 350]);
  },
);

test(
  "no statement glues a value into the SQL text (every value is a placeholder)",
  { skip },
  async () => {
    const connection = fakeConnection([
      [{ insertId: 5 }],
      [[ROW]],
      [{}],
      [[ROW]],
      [{}],
      [[]],
      [[]],
      [[]],
    ]);
    const tx = repository.createTransactionQueries(connection);
    const evil = "x'; DROP TABLE appointments;--";
    await tx.insertAppointment({
      petId: 1,
      customerId: 1,
      serviceId: 1,
      price: 1,
      durationMinutes: 1,
      date: "2026-12-10",
      time: "08:30",
      notes: evil,
      status: "Pending",
    });
    await tx.updateAppointmentDetails(5, {
      petId: 1,
      customerId: 1,
      serviceId: 1,
      price: 1,
      durationMinutes: 1,
      date: "2026-12-10",
      time: "08:30",
      notes: evil,
    });
    await tx.setStatus(5, evil);
    await tx.getAppointmentForUpdate(evil);
    await tx.findScheduleCandidates({ date: evil, excludeId: evil });
    for (const call of connection.calls)
      assert.equal(call.sql.includes("DROP"), false, call.sql);
  },
);

test(
  "the module exports exactly the functions the business layer uses",
  { skip },
  () => {
    for (const name of [
      "getAppointments",
      "getAppointmentById",
      "createTransactionQueries",
      "runInTransaction",
      "runInScheduleTransaction",
    ]) {
      assert.equal(typeof repository[name], "function", name);
    }
  },
);
