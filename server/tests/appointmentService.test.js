// Tests for the appointment business rules (createAppointmentService).
//
// What is real here:  the business service and the real validator.
// What is fake here:  the repositories. A small in-memory "world" stands in for MySQL: it keeps appointments and
//                     payment records in arrays, and it can simulate a transaction (everything is undone when the work
//                     throws) and the shop-wide schedule lock (one booking at a time).
// So this proves the RULES and the order of the steps. It does NOT use real MySQL, real SQL, a real transaction or a real
// GET_LOCK, so it cannot prove those work. That needs the real-database checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppointmentService } from "../src/business/services/createAppointmentService.js";

const TODAY = "2026-12-01";
const STAFF = { role: "staff", customerId: null };
const ADMIN = { role: "admin", customerId: null };
const CUSTOMER_30 = { role: "customer", customerId: 30 };
const CUSTOMER_50 = { role: "customer", customerId: 50 };
const NO_PROFILE = { role: "customer", customerId: null };

const tick = () => new Promise((resolve) => setImmediate(resolve));
const clone = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// The fake world
// ---------------------------------------------------------------------------

function createWorld({ withScheduleMutex = true } = {}) {
  const state = { appointments: [], transactions: [], nextId: 1 };
  const log = []; // "schedule-tx begin", "tx commit", "tx rollback" ...
  const hooks = {
    onLock: null,
    failInsertTransaction: null,
    failInsertAppointment: null,
    lockTimeout: false,
  };
  let inTransaction = false;

  // Pets: 1 and 2 belong to customer 30, 3 to customer 50, 4 to customer 90 (a walk-in with no login account).
  const petData = {
    1: { id: 1, customerId: 30, name: "Mochi" },
    2: { id: 2, customerId: 30, name: "Biscuit" },
    3: { id: 3, customerId: 50, name: "Luna" },
    4: { id: 4, customerId: 90, name: "Walkin" },
  };
  const serviceData = {
    1: {
      id: 1,
      name: "Full Groom",
      price: 650,
      durationMinutes: 120,
      active: true,
    },
    2: {
      id: 2,
      name: "Basic Bath",
      price: 350,
      durationMinutes: 60,
      active: true,
    },
    3: {
      id: 3,
      name: "Old Package",
      price: 100,
      durationMinutes: 30,
      active: false,
    },
  };

  // Adds an appointment straight into the world (a set-up helper, not an API call).
  function seed(fields) {
    const service = serviceData[fields.serviceId ?? 1];
    const pet = petData[fields.petId ?? 1];
    const row = {
      id: state.nextId++,
      petId: pet.id,
      customerId: pet.customerId,
      serviceId: service.id,
      service: service.name,
      price: service.price,
      durationMinutes: service.durationMinutes,
      date: "2026-12-05",
      time: "09:00",
      notes: "",
      status: "Pending",
      ...fields,
    };
    state.appointments.push(row);
    return row;
  }

  const requireTransaction = (name) => {
    if (!inTransaction)
      throw new Error(`${name} was called OUTSIDE a transaction`);
  };

  function createTx() {
    return {
      async getAppointmentById(id) {
        requireTransaction("getAppointmentById");
        return clone(state.appointments.find((a) => a.id === id) ?? null);
      },
      async getAppointmentForUpdate(id) {
        requireTransaction("getAppointmentForUpdate");
        if (hooks.onLock) hooks.onLock(id);
        return clone(state.appointments.find((a) => a.id === id) ?? null);
      },
      async findScheduleCandidates({ date, excludeId }) {
        requireTransaction("findScheduleCandidates");
        await tick(); // lets a second request interleave here if nothing stops it
        const day = (offset) =>
          new Date(
            Date.UTC(
              ...date.split("-").map((n, i) => (i === 1 ? n - 1 : Number(n))),
              0,
            ) +
              offset * 86400000,
          )
            .toISOString()
            .slice(0, 10);
        const [from, to] = [day(-1), day(1)];
        return state.appointments
          .filter(
            (a) =>
              a.status !== "Cancelled" &&
              a.date >= from &&
              a.date <= to &&
              a.id !== excludeId,
          )
          .map((a) => ({
            id: a.id,
            date: a.date,
            time: a.time,
            durationMinutes: a.durationMinutes,
          }));
      },
      async insertAppointment(fields) {
        requireTransaction("insertAppointment");
        await tick();
        if (hooks.failInsertAppointment) throw hooks.failInsertAppointment;
        const row = {
          id: state.nextId++,
          service: serviceData[fields.serviceId].name,
          ...fields,
        };
        state.appointments.push(row);
        return clone(row);
      },
      async updateAppointmentDetails(id, fields) {
        requireTransaction("updateAppointmentDetails");
        const row = state.appointments.find((a) => a.id === id);
        Object.assign(row, fields, {
          service: serviceData[fields.serviceId].name,
        });
        return clone(row);
      },
      async setStatus(id, status) {
        requireTransaction("setStatus");
        state.appointments.find((a) => a.id === id).status = status;
      },
      async insertTransaction({ appointmentId, serviceName, amount }) {
        requireTransaction("insertTransaction");
        if (hooks.failInsertTransaction) throw hooks.failInsertTransaction;
        if (state.transactions.some((t) => t.appointmentId === appointmentId)) {
          throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
        }
        const row = {
          id: state.transactions.length + 1,
          appointmentId,
          serviceName,
          amount,
          status: "Pending",
          paymentMethod: null,
          paidDate: null,
        };
        state.transactions.push(row);
        return row.id;
      },
    };
  }

  // A simulated all-or-nothing transaction: if the work throws, the state goes back to what it was.
  async function runTransaction(label, work) {
    const snapshot = clone(state);
    inTransaction = true;
    log.push(`${label} begin`);
    try {
      const result = await work(createTx());
      log.push(`${label} commit`);
      return result;
    } catch (error) {
      state.appointments = snapshot.appointments;
      state.transactions = snapshot.transactions;
      state.nextId = snapshot.nextId;
      log.push(`${label} rollback`);
      throw error;
    } finally {
      inTransaction = false;
    }
  }

  // The fake schedule lock: one booking at a time (a promise chain), like GET_LOCK would do.
  let chain = Promise.resolve();
  function runInScheduleTransaction(work) {
    if (hooks.lockTimeout)
      return Promise.reject(
        Object.assign(new Error("busy"), { code: "SCHEDULE_LOCK_TIMEOUT" }),
      );
    if (!withScheduleMutex) return scheduleBody(work);
    const next = chain.then(() => scheduleBody(work));
    chain = next.catch(() => {});
    return next;
  }
  // (the fake keeps "inTransaction" per world, so two un-locked bookings would share it: that is fine for the checks)
  async function scheduleBody(work) {
    const snapshot = clone(state);
    log.push("schedule-lock acquired");
    inTransaction = true;
    try {
      const result = await work(createTx());
      log.push("schedule-tx commit");
      return result;
    } catch (error) {
      state.appointments = snapshot.appointments;
      state.transactions = snapshot.transactions;
      state.nextId = snapshot.nextId;
      log.push("schedule-tx rollback");
      throw error;
    } finally {
      inTransaction = false;
      log.push("schedule-lock released");
    }
  }

  const appointmentsRepo = {
    async getAppointments(filters = {}) {
      return clone(
        state.appointments.filter(
          (a) =>
            (filters.status === undefined || a.status === filters.status) &&
            (filters.date === undefined || a.date === filters.date) &&
            (filters.petId === undefined || a.petId === filters.petId) &&
            (filters.customerId === undefined ||
              a.customerId === filters.customerId),
        ),
      );
    },
    async getAppointmentById(id) {
      return clone(state.appointments.find((a) => a.id === id) ?? null);
    },
    runInTransaction: (work) => runTransaction("tx", work),
    runInScheduleTransaction,
  };

  const service = createAppointmentService({
    appointments: appointmentsRepo,
    pets: { getPetById: async (id) => clone(petData[id] ?? null) },
    services: { getServiceById: async (id) => clone(serviceData[id] ?? null) },
    today: () => TODAY,
  });

  return { service, state, log, hooks, seed, petData, serviceData };
}

const booking = (overrides = {}) => ({
  petId: 1,
  serviceId: 1,
  date: "2026-12-10",
  time: "10:00",
  notes: "",
  ...overrides,
});
const FORBIDDEN = {
  ok: false,
  type: "forbidden",
  message: "You do not have permission to do this.",
};

// ---------------------------------------------------------------------------
// Booking: server-derived values
// ---------------------------------------------------------------------------

test("staff books: owner comes from the pet, price and duration from the service, status is Pending", async () => {
  const { service, state } = createWorld();
  const result = await service.createAppointment(
    booking({ petId: 3, serviceId: 1, notes: "  Be gentle  " }),
    STAFF,
  );
  assert.equal(result.ok, true);
  const a = result.appointment;
  assert.equal(a.customerId, 50); // pet 3 belongs to customer 50
  assert.equal(a.price, 650);
  assert.equal(a.durationMinutes, 120);
  assert.equal(a.status, "Pending");
  assert.equal(a.notes, "Be gentle");
  assert.equal(state.appointments.length, 1);
});

test("a body that tries to set customerId, price, duration or status is ignored", async () => {
  const { service } = createWorld();
  const result = await service.createAppointment(
    booking({
      petId: 1,
      customerId: 999,
      price: 1,
      duration: 5,
      durationMinutes: 5,
      status: "Completed",
      id: 500,
    }),
    CUSTOMER_30,
  );
  assert.equal(result.ok, true);
  assert.equal(result.appointment.customerId, 30);
  assert.equal(result.appointment.price, 650);
  assert.equal(result.appointment.durationMinutes, 120);
  assert.equal(result.appointment.status, "Pending");
  assert.notEqual(result.appointment.id, 500);
});

test("staff and admin can book for ANY pet, including a walk-in customer with no login account", async () => {
  for (const actor of [STAFF, ADMIN]) {
    for (const petId of [1, 3, 4]) {
      const { service } = createWorld();
      const result = await service.createAppointment(booking({ petId }), actor);
      assert.equal(result.ok, true, `${actor.role} pet ${petId}`);
    }
  }
  const { service } = createWorld();
  assert.equal(
    (await service.createAppointment(booking({ petId: 4 }), STAFF)).appointment
      .customerId,
    90,
  );
});

test("a customer can book their own pets", async () => {
  const { service } = createWorld();
  for (const [petId, time] of [
    [1, "08:00"],
    [2, "11:00"],
  ]) {
    const result = await service.createAppointment(
      booking({ petId, time }),
      CUSTOMER_30,
    );
    assert.equal(result.ok, true);
    assert.equal(result.appointment.customerId, 30);
  }
});

test("a customer booking ANOTHER owner's pet (or a pet that does not exist) gets the same forbidden, and nothing is saved", async () => {
  const { service, state } = createWorld();
  for (const petId of [3, 4, 999]) {
    assert.deepEqual(
      await service.createAppointment(booking({ petId }), CUSTOMER_30),
      FORBIDDEN,
      `pet ${petId}`,
    );
  }
  assert.equal(state.appointments.length, 0);
});

test("a customer account with no customer profile cannot do anything", async () => {
  const { service, seed } = createWorld();
  const row = seed({});
  assert.deepEqual(
    await service.createAppointment(booking(), NO_PROFILE),
    FORBIDDEN,
  );
  assert.deepEqual(await service.getAppointmentList({}, NO_PROFILE), FORBIDDEN);
  assert.deepEqual(await service.getAppointment(row.id, NO_PROFILE), FORBIDDEN);
  assert.deepEqual(
    await service.updateAppointment(row.id, booking(), NO_PROFILE),
    FORBIDDEN,
  );
  assert.deepEqual(
    await service.changeAppointmentStatus(
      row.id,
      { status: "Cancelled" },
      NO_PROFILE,
    ),
    FORBIDDEN,
  );
  for (const customerId of [0, -1, "30", 30.5, NaN, undefined]) {
    assert.deepEqual(
      await service.createAppointment(booking(), {
        role: "customer",
        customerId,
      }),
      FORBIDDEN,
      String(customerId),
    );
  }
});

test("a missing actor or an unknown role is a programming error: it throws instead of letting anyone in", async () => {
  const { service } = createWorld();
  for (const actor of [
    undefined,
    null,
    {},
    { role: "owner" },
    { role: "ADMIN" },
    "admin",
  ]) {
    await assert.rejects(
      service.createAppointment(booking(), actor),
      /needs an actor/,
      JSON.stringify(actor),
    );
    await assert.rejects(
      service.getAppointmentList({}, actor),
      /needs an actor/,
    );
    await assert.rejects(service.getAppointment(1, actor), /needs an actor/);
    await assert.rejects(
      service.updateAppointment(1, booking(), actor),
      /needs an actor/,
    );
    await assert.rejects(
      service.changeAppointmentStatus(1, { status: "Cancelled" }, actor),
      /needs an actor/,
    );
  }
});

// ---------------------------------------------------------------------------
// Booking: validation, past dates, services
// ---------------------------------------------------------------------------

test("required and invalid fields give a 400-style validation result with field errors", async () => {
  const { service, state } = createWorld();
  const result = await service.createAppointment(
    { petId: "abc", date: "nope", time: "25:00", notes: 5 },
    STAFF,
  );
  assert.equal(result.ok, false);
  assert.equal(result.type, "validation");
  assert.equal(result.message, "Validation failed. Please check the fields.");
  assert.deepEqual(Object.keys(result.errors).sort(), [
    "date",
    "notes",
    "petId",
    "serviceId",
    "time",
  ]);
  assert.equal(state.appointments.length, 0);
});

test("a past date is rejected; today is accepted", async () => {
  const { service } = createWorld();
  const past = await service.createAppointment(
    booking({ date: "2026-11-30" }),
    STAFF,
  );
  assert.equal(past.type, "validation");
  assert.equal(past.errors.date, "The date cannot be in the past.");
  assert.equal(
    (await service.createAppointment(booking({ date: TODAY }), STAFF)).ok,
    true,
  );
});

test("an inactive service cannot be booked (by anyone)", async () => {
  for (const actor of [STAFF, ADMIN, CUSTOMER_30]) {
    const { service, state } = createWorld();
    const result = await service.createAppointment(
      booking({ serviceId: 3 }),
      actor,
    );
    assert.equal(result.type, "validation", actor.role);
    assert.equal(
      result.errors.serviceId,
      "This service is not available for booking.",
    );
    assert.equal(state.appointments.length, 0);
  }
});

test("a service that does not exist gives not found, a pet that does not exist gives not found (for staff)", async () => {
  const { service } = createWorld();
  const noService = await service.createAppointment(
    booking({ serviceId: 999 }),
    STAFF,
  );
  assert.equal(noService.type, "notFound");
  assert.ok(noService.errors.serviceId);
  const noPet = await service.createAppointment(booking({ petId: 999 }), STAFF);
  assert.equal(noPet.type, "notFound");
  assert.ok(noPet.errors.petId);
});

// ---------------------------------------------------------------------------
// Scheduling conflicts and privacy
// ---------------------------------------------------------------------------

test("two appointments that overlap conflict, whichever pets they are for (one groomer)", async () => {
  const { service, state } = createWorld();
  assert.equal(
    (
      await service.createAppointment(
        booking({ petId: 1, time: "10:00" }),
        STAFF,
      )
    ).ok,
    true,
  ); // 10:00-12:00
  const clash = await service.createAppointment(
    booking({ petId: 3, serviceId: 2, time: "11:30" }),
    STAFF,
  ); // another pet
  assert.equal(clash.ok, false);
  assert.equal(clash.type, "conflict");
  assert.ok(clash.errors.time);
  assert.equal(state.appointments.length, 1);
});

test("overlap edges: starting exactly when another ends is fine; one minute earlier is not", async () => {
  const { service } = createWorld();
  await service.createAppointment(booking({ time: "10:00" }), STAFF); // 10:00-12:00
  assert.equal(
    (
      await service.createAppointment(
        booking({ petId: 3, serviceId: 2, time: "12:00" }),
        STAFF,
      )
    ).ok,
    true,
  ); // 12:00-13:00
  assert.equal(
    (
      await service.createAppointment(
        booking({ petId: 4, serviceId: 2, time: "08:59" }),
        STAFF,
      )
    ).ok,
    true,
  ); // 08:59-09:59
  assert.equal(
    (
      await service.createAppointment(
        booking({ petId: 4, serviceId: 2, time: "09:00" }),
        STAFF,
      )
    ).ok,
    false,
  ); // 09:00-10:00 overlaps the 08:59-09:59 booking just made
});

test("a booking that ends exactly when another starts does not conflict", async () => {
  const { service } = createWorld();
  await service.createAppointment(booking({ time: "10:00" }), STAFF); // 10:00-12:00
  assert.equal(
    (
      await service.createAppointment(
        booking({ petId: 3, serviceId: 2, time: "09:00" }),
        STAFF,
      )
    ).ok,
    true,
  ); // 09:00-10:00
});

test("a different day never conflicts; a cancelled appointment never blocks", async () => {
  const { service, seed } = createWorld();
  seed({ date: "2026-12-10", time: "10:00" });
  assert.equal(
    (
      await service.createAppointment(
        booking({ petId: 3, date: "2026-12-11" }),
        STAFF,
      )
    ).ok,
    true,
  );
  const { service: s2, seed: seed2 } = createWorld();
  seed2({ date: "2026-12-10", time: "10:00", status: "Cancelled" });
  assert.equal(
    (await s2.createAppointment(booking({ petId: 3 }), STAFF)).ok,
    true,
  );
});

test("an appointment that runs past midnight blocks the early hours of the next day (and not later ones)", async () => {
  const { service, seed } = createWorld();
  seed({ date: "2026-12-10", time: "23:00", durationMinutes: 120 }); // 23:00 -> 01:00 on the 11th
  assert.equal(
    (
      await service.createAppointment(
        booking({ petId: 3, serviceId: 2, date: "2026-12-11", time: "00:30" }),
        STAFF,
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await service.createAppointment(
        booking({ petId: 3, serviceId: 2, date: "2026-12-11", time: "01:00" }),
        STAFF,
      )
    ).ok,
    true,
  );
});

test("PRIVACY: a customer's conflict message is generic: no appointment id, pet name, owner, time or date of another booking", async () => {
  const { service, seed } = createWorld();
  const other = seed({ petId: 3, date: "2026-12-10", time: "10:00" }); // customer 50's pet "Luna"
  const clash = await service.createAppointment(
    booking({ petId: 1, time: "10:30" }),
    CUSTOMER_30,
  );
  assert.equal(clash.type, "conflict");
  const text = JSON.stringify(clash);
  assert.equal(
    clash.message,
    "That time is not available. Please choose a different time.",
  );
  for (const secret of [
    `${other.id}`,
    "Luna",
    "10:00",
    "12:00",
    "50",
    "Full Groom",
    "2026-12-10",
  ]) {
    assert.equal(text.includes(secret), false, `leaked ${secret}`);
  }
  assert.equal(
    /\d/.test(text),
    false,
    "the generic message contains no numbers at all",
  );
});

test("staff and admin see the other appointment's number and time window, but never a pet or owner name", async () => {
  for (const actor of [STAFF, ADMIN]) {
    const { service, seed } = createWorld();
    const other = seed({ petId: 3, date: "2026-12-10", time: "10:00" }); // Luna, 10:00-12:00
    const clash = await service.createAppointment(
      booking({ petId: 1, time: "10:30" }),
      actor,
    );
    assert.equal(clash.type, "conflict");
    assert.ok(clash.message.includes(`appointment ${other.id}`), actor.role);
    assert.ok(clash.message.includes("10:00 to 12:00"), actor.role);
    assert.ok(clash.message.includes("2026-12-10"), actor.role);
    for (const name of ["Luna", "Mochi", "Biscuit", "Walkin"])
      assert.equal(clash.message.includes(name), false, name);
  }
});

// ---------------------------------------------------------------------------
// Race conditions (the strategy, as far as a unit test can show)
// ---------------------------------------------------------------------------

test("booking and the conflict check both run INSIDE the schedule lock and transaction (the fake refuses calls outside)", async () => {
  const { service, log } = createWorld();
  await service.createAppointment(booking(), STAFF);
  assert.deepEqual(log, [
    "schedule-lock acquired",
    "schedule-tx commit",
    "schedule-lock released",
  ]);
});

test("two people booking the SAME slot at the same moment: exactly one wins, the other gets a conflict", async () => {
  const { service, state } = createWorld();
  const results = await Promise.all([
    service.createAppointment(booking({ petId: 1 }), CUSTOMER_30),
    service.createAppointment(booking({ petId: 3 }), CUSTOMER_50),
  ]);
  assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
  assert.equal(results.find((r) => !r.ok).type, "conflict");
  assert.equal(state.appointments.length, 1);
});

test("ten simultaneous bookings of one slot: exactly one succeeds", async () => {
  const { service, state } = createWorld();
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      service.createAppointment(booking({ petId: [1, 2, 3, 4][i % 4] }), STAFF),
    ),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(state.appointments.length, 1);
});

test("CONTROL: with NO lock the same two simultaneous bookings both succeed (so the tests above really depend on the lock)", async () => {
  const { service, state } = createWorld({ withScheduleMutex: false });
  const results = await Promise.all([
    service.createAppointment(booking({ petId: 1 }), STAFF),
    service.createAppointment(booking({ petId: 3 }), STAFF),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 2); // the double booking the lock exists to prevent
  assert.equal(state.appointments.length, 2);
});

test("two simultaneous reschedules into the same free slot: exactly one wins", async () => {
  const { service, seed } = createWorld();
  const a = seed({ petId: 1, date: "2026-12-10", time: "08:00" });
  const b = seed({ petId: 3, date: "2026-12-10", time: "14:00" });
  const results = await Promise.all([
    service.updateAppointment(
      a.id,
      booking({ petId: 1, date: "2026-12-12", time: "10:00" }),
      STAFF,
    ),
    service.updateAppointment(
      b.id,
      booking({ petId: 3, date: "2026-12-12", time: "10:30" }),
      STAFF,
    ),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
});

test("if the schedule lock cannot be taken in time, the result is a 409-style conflict, not a crash", async () => {
  const { service, hooks, state } = createWorld();
  hooks.lockTimeout = true;
  const result = await service.createAppointment(booking(), STAFF);
  assert.equal(result.type, "conflict");
  assert.match(result.message, /busy/i);
  assert.equal(state.appointments.length, 0);
});

test("the database owner trigger (SQLSTATE 45000) becomes a validation result; unknown database errors are re-thrown", async () => {
  const { service, hooks } = createWorld();
  hooks.failInsertAppointment = Object.assign(new Error("owner mismatch"), {
    sqlState: "45000",
  });
  const trigger = await service.createAppointment(booking(), STAFF);
  assert.equal(trigger.type, "validation");
  assert.ok(trigger.errors.petId);

  hooks.failInsertAppointment = new Error("disk on fire");
  await assert.rejects(
    service.createAppointment(booking(), STAFF),
    /disk on fire/,
  );
});

// ---------------------------------------------------------------------------
// Editing / rescheduling
// ---------------------------------------------------------------------------

test("staff can edit and reschedule a Pending appointment (the status is unchanged)", async () => {
  const { service, seed } = createWorld();
  const row = seed({
    petId: 1,
    date: "2026-12-10",
    time: "10:00",
    notes: "old",
  });
  const result = await service.updateAppointment(
    row.id,
    booking({ petId: 1, date: "2026-12-12", time: "15:00", notes: "new" }),
    STAFF,
  );
  assert.equal(result.ok, true);
  assert.equal(result.appointment.date, "2026-12-12");
  assert.equal(result.appointment.time, "15:00");
  assert.equal(result.appointment.notes, "new");
  assert.equal(result.appointment.status, "Pending");
});

test("choosing a different service recalculates price and duration from that service", async () => {
  const { service, seed } = createWorld();
  const row = seed({ serviceId: 1 }); // 650, 120
  const result = await service.updateAppointment(
    row.id,
    booking({ serviceId: 2, date: row.date, time: row.time }),
    STAFF,
  );
  assert.equal(result.appointment.price, 350);
  assert.equal(result.appointment.durationMinutes, 60);
  assert.equal(result.appointment.service, "Basic Bath");
});

test("keeping the same service keeps the booked price and duration, even if the catalog changed since", async () => {
  const { service, seed, serviceData } = createWorld();
  const row = seed({ serviceId: 1, price: 600, durationMinutes: 90 }); // booked when the price was 600
  serviceData[1].price = 999;
  serviceData[1].durationMinutes = 200;
  const result = await service.updateAppointment(
    row.id,
    booking({ serviceId: 1, date: row.date, time: row.time, notes: "x" }),
    STAFF,
  );
  assert.equal(result.appointment.price, 600);
  assert.equal(result.appointment.durationMinutes, 90);
});

test("a price, duration, customerId or status sent in an edit is ignored", async () => {
  const { service, seed } = createWorld();
  const row = seed({});
  const result = await service.updateAppointment(
    row.id,
    booking({
      date: row.date,
      time: row.time,
      price: 1,
      durationMinutes: 1,
      customerId: 999,
      status: "Completed",
    }),
    STAFF,
  );
  assert.equal(result.ok, true);
  assert.equal(result.appointment.price, 650);
  assert.equal(result.appointment.customerId, 30);
  assert.equal(result.appointment.status, "Pending");
});

test("ownership comes from the selected pet: changing the pet changes the owner; keeping the pet keeps the booked owner", async () => {
  const { service, seed, petData } = createWorld();
  const changed = seed({ petId: 1, date: "2026-12-10", time: "08:00" });
  const toOther = await service.updateAppointment(
    changed.id,
    booking({ petId: 3, date: "2026-12-10", time: "08:00" }),
    STAFF,
  );
  assert.equal(toOther.appointment.customerId, 50);

  const kept = seed({ petId: 2, date: "2026-12-11", time: "08:00" }); // booked while pet 2 belonged to customer 30
  petData[2].customerId = 77; // the pet is later transferred to another owner
  const same = await service.updateAppointment(
    kept.id,
    booking({ petId: 2, date: "2026-12-11", time: "08:00", notes: "n" }),
    STAFF,
  );
  assert.equal(same.appointment.customerId, 30); // history stays with the original owner
});

test("only Pending can be edited by a customer; staff can edit any open appointment; Completed and Cancelled are immutable for everyone", async () => {
  for (const [status, staffOk, customerOk] of [
    ["Pending", true, true],
    ["Confirmed", true, false],
    ["In Progress", true, false],
    ["Completed", false, false],
    ["Cancelled", false, false],
  ]) {
    for (const [actor, expected] of [
      [STAFF, staffOk],
      [ADMIN, staffOk],
      [CUSTOMER_30, customerOk],
    ]) {
      const { service, seed } = createWorld();
      const row = seed({ status, petId: 1 });
      const result = await service.updateAppointment(
        row.id,
        booking({ petId: 1, date: row.date, time: row.time, notes: "changed" }),
        actor,
      );
      assert.equal(result.ok, expected, `${status} by ${actor.role}`);
      if (!expected)
        assert.equal(result.type, "conflict", `${status} by ${actor.role}`);
    }
  }
});

test("an immutable appointment is really not changed", async () => {
  const { service, seed, state } = createWorld();
  const done = seed({ status: "Completed", notes: "original" });
  await service.updateAppointment(
    done.id,
    booking({ date: done.date, time: done.time, notes: "hacked" }),
    STAFF,
  );
  assert.equal(state.appointments[0].notes, "original");
});

test("a customer can edit their own Pending appointment but not someone else's, a missing one, or a malformed id (all the same forbidden)", async () => {
  const { service, seed } = createWorld();
  const mine = seed({ petId: 1, date: "2026-12-10", time: "08:00" });
  const theirs = seed({ petId: 3, date: "2026-12-10", time: "14:00" });
  assert.equal(
    (
      await service.updateAppointment(
        mine.id,
        booking({ petId: 1, date: "2026-12-10", time: "09:00" }),
        CUSTOMER_30,
      )
    ).ok,
    true,
  );
  for (const id of [
    theirs.id,
    999,
    "abc",
    "0",
    "-1",
    "1.5",
    "",
    undefined,
    null,
  ]) {
    assert.deepEqual(
      await service.updateAppointment(id, booking(), CUSTOMER_30),
      FORBIDDEN,
      String(id),
    );
  }
});

test("a customer cannot move their appointment to someone else's pet, or take over another owner by any means", async () => {
  const { service, seed, state } = createWorld();
  const mine = seed({ petId: 1, date: "2026-12-10", time: "08:00" });
  assert.deepEqual(
    await service.updateAppointment(
      mine.id,
      booking({ petId: 3, date: "2026-12-10", time: "08:00" }),
      CUSTOMER_30,
    ),
    FORBIDDEN,
  );
  assert.deepEqual(
    await service.updateAppointment(
      mine.id,
      booking({ petId: 999, date: "2026-12-10", time: "08:00" }),
      CUSTOMER_30,
    ),
    FORBIDDEN,
  );
  assert.equal(state.appointments[0].petId, 1);
  assert.equal(state.appointments[0].customerId, 30);
  const result = await service.updateAppointment(
    mine.id,
    booking({ petId: 2, date: "2026-12-10", time: "08:00", customerId: 50 }),
    CUSTOMER_30,
  );
  assert.equal(result.ok, true);
  assert.equal(result.appointment.customerId, 30); // the body's customerId was ignored
});

test("staff get not found (404) and validation (400) for a missing or malformed id on edit; customers do not", async () => {
  const { service } = createWorld();
  assert.equal(
    (await service.updateAppointment(999, booking(), STAFF)).type,
    "notFound",
  );
  assert.equal(
    (await service.updateAppointment("abc", booking(), STAFF)).type,
    "validation",
  );
  assert.equal(
    (await service.updateAppointment("0", booking(), ADMIN)).type,
    "validation",
  );
});

test("rescheduling into a taken time is a conflict; staying in your own slot (or overlapping your own old time) is fine", async () => {
  const { service, seed } = createWorld();
  const a = seed({ petId: 1, date: "2026-12-10", time: "10:00" }); // 10:00-12:00
  seed({ petId: 3, date: "2026-12-10", time: "14:00", serviceId: 2 }); // 14:00-15:00
  assert.equal(
    (
      await service.updateAppointment(
        a.id,
        booking({ petId: 1, date: "2026-12-10", time: "14:30" }),
        STAFF,
      )
    ).type,
    "conflict",
  );
  assert.equal(
    (
      await service.updateAppointment(
        a.id,
        booking({ petId: 1, date: "2026-12-10", time: "11:00" }),
        STAFF,
      )
    ).ok,
    true,
  ); // overlaps only itself
});

test("the privacy rule applies to edits too: a customer's reschedule conflict is generic", async () => {
  const { service, seed } = createWorld();
  const mine = seed({ petId: 1, date: "2026-12-10", time: "08:00" });
  const other = seed({ petId: 3, date: "2026-12-10", time: "14:00" });
  const clash = await service.updateAppointment(
    mine.id,
    booking({ petId: 1, date: "2026-12-10", time: "14:30" }),
    CUSTOMER_30,
  );
  assert.equal(
    clash.message,
    "That time is not available. Please choose a different time.",
  );
  assert.equal(/\d/.test(JSON.stringify(clash)), false); // no id, time or date of the other booking
  assert.equal(JSON.stringify(clash).includes("Luna"), false);
  assert.ok(other.id > 0);
});

test("the schedule is only rechecked when date, time or duration change (a notes-only edit is not blocked)", async () => {
  const { service, seed } = createWorld();
  const a = seed({ petId: 1, date: "2026-12-10", time: "10:00" });
  seed({ petId: 3, date: "2026-12-10", time: "10:30" }); // an old overlap created some other way
  const result = await service.updateAppointment(
    a.id,
    booking({
      petId: 1,
      date: "2026-12-10",
      time: "10:00",
      notes: "only notes",
    }),
    STAFF,
  );
  assert.equal(result.ok, true);
});

test("editing: a past date is rejected unless the date is unchanged", async () => {
  const { service, seed } = createWorld();
  const old = seed({ petId: 1, date: "2026-11-20", time: "10:00" });
  assert.equal(
    (
      await service.updateAppointment(
        old.id,
        booking({
          petId: 1,
          date: "2026-11-20",
          time: "10:00",
          notes: "late note",
        }),
        STAFF,
      )
    ).ok,
    true,
  );
  const rejected = await service.updateAppointment(
    old.id,
    booking({ petId: 1, date: "2026-11-21", time: "10:00" }),
    STAFF,
  );
  assert.equal(rejected.type, "validation");
  assert.equal(rejected.errors.date, "The date cannot be in the past.");
});

test("editing: switching to an inactive service is rejected; keeping an already-booked inactive service is allowed", async () => {
  const { service, seed } = createWorld();
  const row = seed({ serviceId: 2 });
  assert.equal(
    (
      await service.updateAppointment(
        row.id,
        booking({ serviceId: 3, date: row.date, time: row.time }),
        STAFF,
      )
    ).type,
    "validation",
  );

  const { service: s2, seed: seed2, serviceData } = createWorld();
  const old = seed2({ serviceId: 1, price: 650 });
  serviceData[1].active = false; // the service was deactivated after booking
  assert.equal(
    (
      await s2.updateAppointment(
        old.id,
        booking({ serviceId: 1, date: old.date, time: old.time, notes: "n" }),
        STAFF,
      )
    ).ok,
    true,
  );
});

test("RACE: if the appointment was cancelled between our first read and the row lock, the edit is refused and nothing changes", async () => {
  const { service, seed, hooks, state } = createWorld();
  const row = seed({ petId: 1, notes: "keep" });
  hooks.onLock = (id) => {
    state.appointments.find((a) => a.id === id).status = "Cancelled"; // somebody else cancelled it just now
  };
  const result = await service.updateAppointment(
    row.id,
    booking({ petId: 1, date: row.date, time: row.time, notes: "changed" }),
    CUSTOMER_30,
  );
  assert.equal(result.type, "conflict");
  assert.equal(state.appointments[0].notes, "keep");
});

test("RACE: the actor is re-checked on the locked row (an appointment reassigned meanwhile is forbidden to the old owner)", async () => {
  const { service, seed, hooks, state } = createWorld();
  const row = seed({ petId: 1 });
  hooks.onLock = (id) => {
    state.appointments.find((a) => a.id === id).customerId = 50;
  };
  assert.deepEqual(
    await service.updateAppointment(
      row.id,
      booking({ petId: 1, date: row.date, time: row.time }),
      CUSTOMER_30,
    ),
    FORBIDDEN,
  );
});

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

test("staff and admin walk the normal path: Pending > Confirmed > In Progress > Completed", async () => {
  for (const actor of [STAFF, ADMIN]) {
    const { service, seed } = createWorld();
    const row = seed({});
    for (const status of ["Confirmed", "In Progress", "Completed"]) {
      const result = await service.changeAppointmentStatus(
        row.id,
        { status },
        actor,
      );
      assert.equal(result.ok, true, `${actor.role} -> ${status}`);
      assert.equal(result.appointment.status, status);
    }
  }
});

test("blocked moves for staff: skipping steps, going backwards, staying put, and leaving a final status", async () => {
  const blocked = [
    ["Pending", "In Progress"],
    ["Pending", "Completed"],
    ["Pending", "Pending"],
    ["Confirmed", "Completed"],
    ["Confirmed", "Pending"],
    ["Confirmed", "Confirmed"],
    ["In Progress", "Pending"],
    ["In Progress", "Confirmed"],
    ["In Progress", "In Progress"],
    ["Completed", "Pending"],
    ["Completed", "Confirmed"],
    ["Completed", "In Progress"],
    ["Completed", "Completed"],
    ["Completed", "Cancelled"],
    ["Cancelled", "Pending"],
    ["Cancelled", "Confirmed"],
    ["Cancelled", "In Progress"],
    ["Cancelled", "Completed"],
    ["Cancelled", "Cancelled"],
  ];
  for (const [from, to] of blocked) {
    const { service, seed, state } = createWorld();
    const row = seed({ status: from });
    const result = await service.changeAppointmentStatus(
      row.id,
      { status: to },
      STAFF,
    );
    assert.equal(result.ok, false, `${from} -> ${to}`);
    assert.equal(result.type, "conflict", `${from} -> ${to}`);
    assert.equal(
      state.appointments[0].status,
      from,
      `${from} -> ${to} must not change anything`,
    );
    assert.equal(state.transactions.length, 0);
  }
});

test("staff can cancel from any open state", async () => {
  for (const from of ["Pending", "Confirmed", "In Progress"]) {
    const { service, seed } = createWorld();
    const row = seed({ status: from });
    const result = await service.changeAppointmentStatus(
      row.id,
      { status: "Cancelled" },
      STAFF,
    );
    assert.equal(result.ok, true, from);
    assert.equal(result.appointment.status, "Cancelled");
  }
});

test("a customer can cancel their own Pending or Confirmed appointment, and nothing else", async () => {
  for (const [from, ok] of [
    ["Pending", true],
    ["Confirmed", true],
    ["In Progress", false],
    ["Completed", false],
    ["Cancelled", false],
  ]) {
    const { service, seed } = createWorld();
    const row = seed({ status: from, petId: 1 });
    const result = await service.changeAppointmentStatus(
      row.id,
      { status: "Cancelled" },
      CUSTOMER_30,
    );
    assert.equal(result.ok, ok, from);
    if (!ok) assert.equal(result.type, "conflict", from);
  }
});

test("a customer can NEVER Confirm, Start or Complete (even their own appointment) or set Pending: forbidden", async () => {
  for (const [from, to] of [
    ["Pending", "Confirmed"],
    ["Confirmed", "In Progress"],
    ["In Progress", "Completed"],
    ["Pending", "Completed"],
    ["Confirmed", "Pending"],
    ["Pending", "Pending"],
  ]) {
    const { service, seed, state } = createWorld();
    const row = seed({ status: from, petId: 1 });
    assert.deepEqual(
      await service.changeAppointmentStatus(
        row.id,
        { status: to },
        CUSTOMER_30,
      ),
      FORBIDDEN,
      `${from} -> ${to}`,
    );
    assert.equal(state.appointments[0].status, from);
    assert.equal(state.transactions.length, 0);
  }
});

test("a customer cannot change or cancel someone else's appointment, a missing one, or use a malformed id: all the same forbidden", async () => {
  const { service, seed, state } = createWorld();
  const theirs = seed({ petId: 3 });
  for (const id of [theirs.id, 999, "abc", "0", "1.5", "", undefined]) {
    assert.deepEqual(
      await service.changeAppointmentStatus(
        id,
        { status: "Cancelled" },
        CUSTOMER_30,
      ),
      FORBIDDEN,
      String(id),
    );
    assert.deepEqual(
      await service.changeAppointmentStatus(
        id,
        { status: "Confirmed" },
        CUSTOMER_30,
      ),
      FORBIDDEN,
      String(id),
    );
  }
  assert.equal(state.appointments[0].status, "Pending");
});

test("an invalid status body is a validation result; staff get not found / validation for a missing / malformed id", async () => {
  const { service, seed } = createWorld();
  const row = seed({});
  for (const body of [
    {},
    undefined,
    { status: "Finished" },
    { status: "confirmed" },
    { status: 5 },
  ]) {
    assert.equal(
      (await service.changeAppointmentStatus(row.id, body, STAFF)).type,
      "validation",
      JSON.stringify(body),
    );
  }
  assert.equal(
    (await service.changeAppointmentStatus(999, { status: "Confirmed" }, STAFF))
      .type,
    "notFound",
  );
  assert.equal(
    (
      await service.changeAppointmentStatus(
        "abc",
        { status: "Confirmed" },
        STAFF,
      )
    ).type,
    "validation",
  );
});

test("RACE: the move is checked again on the locked row (a second click on a stale page is refused)", async () => {
  const { service, seed, hooks, state } = createWorld();
  const row = seed({ status: "Pending" });
  hooks.onLock = (id) => {
    state.appointments.find((a) => a.id === id).status = "Confirmed"; // someone else confirmed it first
  };
  const result = await service.changeAppointmentStatus(
    row.id,
    { status: "Confirmed" },
    STAFF,
  ); // Confirmed -> Confirmed is not a move
  assert.equal(result.type, "conflict");
  assert.equal(state.appointments[0].status, "Confirmed");
});

// ---------------------------------------------------------------------------
// Completing: the payment record
// ---------------------------------------------------------------------------

test("completing creates one Pending payment record with the booked price and the service name", async () => {
  const { service, seed, state } = createWorld();
  const row = seed({ status: "In Progress", serviceId: 1, price: 600 });
  const result = await service.changeAppointmentStatus(
    row.id,
    { status: "Completed" },
    STAFF,
  );
  assert.equal(result.ok, true);
  assert.equal(result.appointment.status, "Completed");
  assert.equal(state.transactions.length, 1);
  assert.deepEqual(state.transactions[0], {
    id: 1,
    appointmentId: row.id,
    serviceName: "Full Groom",
    amount: 600, // the appointment's own price, not the catalog's
    status: "Pending",
    paymentMethod: null,
    paidDate: null,
  });
});

test("only Completed creates a payment record (Confirm, Start and Cancel do not)", async () => {
  const { service, seed, state } = createWorld();
  const row = seed({ status: "Pending" });
  await service.changeAppointmentStatus(row.id, { status: "Confirmed" }, STAFF);
  await service.changeAppointmentStatus(
    row.id,
    { status: "In Progress" },
    STAFF,
  );
  assert.equal(state.transactions.length, 0);
  const other = seed({ status: "Confirmed", petId: 3, date: "2026-12-20" });
  await service.changeAppointmentStatus(
    other.id,
    { status: "Cancelled" },
    STAFF,
  );
  assert.equal(state.transactions.length, 0);
});

test("the payment record keeps its snapshot even if the service is renamed or re-priced later", async () => {
  const { service, seed, state, serviceData } = createWorld();
  const row = seed({ status: "In Progress", serviceId: 2, price: 350 });
  await service.changeAppointmentStatus(row.id, { status: "Completed" }, STAFF);
  serviceData[2].name = "Renamed";
  serviceData[2].price = 9999;
  assert.equal(state.transactions[0].serviceName, "Basic Bath");
  assert.equal(state.transactions[0].amount, 350);
});

test("ATOMIC: if creating the payment record fails, the appointment does NOT stay Completed and the error is re-thrown", async () => {
  const { service, seed, state, hooks, log } = createWorld();
  const row = seed({ status: "In Progress" });
  hooks.failInsertTransaction = new Error("transactions table is down");
  await assert.rejects(
    service.changeAppointmentStatus(row.id, { status: "Completed" }, STAFF),
    /transactions table is down/,
  );
  assert.equal(state.appointments[0].status, "In Progress"); // rolled back
  assert.equal(state.transactions.length, 0);
  assert.ok(log.includes("tx rollback"));
  assert.ok(!log.includes("tx commit"));
});

test("ATOMIC: a duplicate payment record (UNIQUE appointment_id) is a conflict and the status change is undone too", async () => {
  const { service, seed, state } = createWorld();
  const row = seed({ status: "In Progress" });
  state.transactions.push({
    id: 1,
    appointmentId: row.id,
    serviceName: "x",
    amount: 1,
    status: "Pending",
  }); // already exists
  const result = await service.changeAppointmentStatus(
    row.id,
    { status: "Completed" },
    STAFF,
  );
  assert.equal(result.type, "conflict");
  assert.equal(state.appointments[0].status, "In Progress");
  assert.equal(state.transactions.length, 1);
});

test("the status change and the payment record happen in ONE transaction: begin, commit once", async () => {
  const { service, seed, log } = createWorld();
  const row = seed({ status: "In Progress" });
  await service.changeAppointmentStatus(row.id, { status: "Completed" }, STAFF);
  assert.deepEqual(log, ["tx begin", "tx commit"]);
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

test("staff and admin list everything, with the filters; invalid filters are a validation result", async () => {
  const { service, seed } = createWorld();
  seed({ petId: 1, date: "2026-12-10", time: "08:00", status: "Pending" });
  seed({ petId: 3, date: "2026-12-10", time: "10:00", status: "Confirmed" });
  seed({ petId: 4, date: "2026-12-11", time: "08:00", status: "Pending" });
  for (const actor of [STAFF, ADMIN]) {
    assert.equal(
      (await service.getAppointmentList({}, actor)).appointments.length,
      3,
    );
    assert.equal(
      (await service.getAppointmentList({ status: "Pending" }, actor))
        .appointments.length,
      2,
    );
    assert.equal(
      (await service.getAppointmentList({ date: "2026-12-10" }, actor))
        .appointments.length,
      2,
    );
    assert.equal(
      (await service.getAppointmentList({ customerId: "50" }, actor))
        .appointments.length,
      1,
    );
    assert.equal(
      (await service.getAppointmentList({ petId: "4" }, actor)).appointments
        .length,
      1,
    );
  }
  const bad = await service.getAppointmentList(
    { status: "x", petId: "0" },
    STAFF,
  );
  assert.equal(bad.type, "validation");
});

test("a customer's list contains only their own appointments, whatever filters they send", async () => {
  const { service, seed } = createWorld();
  seed({ petId: 1, date: "2026-12-10", time: "08:00" });
  seed({ petId: 2, date: "2026-12-10", time: "10:00" });
  seed({ petId: 3, date: "2026-12-10", time: "12:00" }); // customer 50
  seed({ petId: 4, date: "2026-12-10", time: "14:00" }); // walk-in 90
  const own = await service.getAppointmentList({}, CUSTOMER_30);
  assert.deepEqual(
    own.appointments.map((a) => a.customerId),
    [30, 30],
  );
  for (const query of [
    { customerId: "50" },
    { customerId: "90" },
    { petId: "3" },
  ]) {
    const result = await service.getAppointmentList(query, CUSTOMER_30);
    assert.ok(
      result.appointments.every((a) => a.customerId === 30),
      JSON.stringify(query),
    );
  }
  assert.equal(
    (await service.getAppointmentList({ customerId: "50" }, CUSTOMER_30))
      .appointments.length,
    2,
  ); // replaced by their own id
});

test("a customer's appointments stay with them after a pet is transferred (the owner is the booking-time snapshot)", async () => {
  const { service, seed, petData } = createWorld();
  seed({ petId: 1 });
  petData[1].customerId = 50; // the pet now belongs to customer 50
  assert.equal(
    (await service.getAppointmentList({}, CUSTOMER_30)).appointments.length,
    1,
  );
  assert.equal(
    (await service.getAppointmentList({}, CUSTOMER_50)).appointments.length,
    0,
  );
});

test("get one appointment: staff see any (404 / 400 for missing / malformed); a customer sees only their own", async () => {
  const { service, seed } = createWorld();
  const mine = seed({ petId: 1 });
  const theirs = seed({ petId: 3, date: "2026-12-11" });
  assert.equal((await service.getAppointment(theirs.id, STAFF)).ok, true);
  assert.equal((await service.getAppointment(String(mine.id), ADMIN)).ok, true);
  assert.equal((await service.getAppointment(999, STAFF)).type, "notFound");
  assert.equal((await service.getAppointment("abc", STAFF)).type, "validation");
  assert.equal((await service.getAppointment(mine.id, CUSTOMER_30)).ok, true);
  for (const id of [theirs.id, 999, "abc", "0", "", undefined, "-1", "1.5"]) {
    assert.deepEqual(
      await service.getAppointment(id, CUSTOMER_30),
      FORBIDDEN,
      String(id),
    );
  }
});

test("the forbidden answer is identical for someone else's appointment and one that does not exist", async () => {
  const { service, seed } = createWorld();
  const theirs = seed({ petId: 3 });
  assert.deepEqual(
    await service.getAppointment(theirs.id, CUSTOMER_30),
    await service.getAppointment(98765, CUSTOMER_30),
  );
});
