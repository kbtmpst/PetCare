// Tests for the appointment controller logic, using a FAKE business service and FAKE request/response objects.
// No Express, no MySQL, no login. They prove: who the actor is, which status code each result gets, and the response shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppointmentController } from "../src/controllers/createAppointmentController.js";

const STAFF_USER = { id: 1, role: "staff", customerId: null };
const CUSTOMER_USER = { id: 2, role: "customer", customerId: 30 };
const APPOINTMENT = { id: 7, petId: 1, customerId: 30, status: "Pending" };

// A fake service that records every call and answers with whatever "answer" holds.
function fakeService(answer) {
  const calls = [];
  const record =
    (name) =>
    async (...args) => {
      calls.push({ name, args });
      if (answer instanceof Error) throw answer;
      return answer;
    };
  return {
    calls,
    service: {
      getAppointmentList: record("getAppointmentList"),
      getAppointment: record("getAppointment"),
      createAppointment: record("createAppointment"),
      updateAppointment: record("updateAppointment"),
      changeAppointmentStatus: record("changeAppointmentStatus"),
    },
  };
}

// Runs a handler with a fake request and waits until it answered (res.json) or passed an error on (next).
function run(handler, { user, params = {}, query = {}, body } = {}) {
  return new Promise((resolve) => {
    const out = { status: 200, headers: {}, body: null, error: null };
    const res = {
      status(code) {
        out.status = code;
        return this;
      },
      location(url) {
        out.headers.location = url;
        return this;
      },
      json(payload) {
        out.body = payload;
        resolve(out);
        return this;
      },
    };
    handler({ user, params, query, body }, res, (error) => {
      out.error = error ?? null;
      resolve(out);
    });
  });
}

const ok = (extra) => ({ ok: true, ...extra });

test("list: calls the service with the query and the actor, answers 200 with count and data", async () => {
  const { service, calls } = fakeService(
    ok({ appointments: [APPOINTMENT, APPOINTMENT] }),
  );
  const controller = createAppointmentController({ service });
  const out = await run(controller.listAppointments, {
    user: STAFF_USER,
    query: { status: "Pending" },
  });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, {
    status: "ok",
    count: 2,
    data: [APPOINTMENT, APPOINTMENT],
  });
  assert.deepEqual(calls[0], {
    name: "getAppointmentList",
    args: [{ status: "Pending" }, { role: "staff", customerId: null }],
  });
});

test("get one: passes the URL id and the actor, answers 200 with data", async () => {
  const { service, calls } = fakeService(ok({ appointment: APPOINTMENT }));
  const out = await run(
    createAppointmentController({ service }).getAppointment,
    { user: CUSTOMER_USER, params: { id: "7" } },
  );
  assert.deepEqual(out.body, { status: "ok", data: APPOINTMENT });
  assert.deepEqual(calls[0], {
    name: "getAppointment",
    args: ["7", { role: "customer", customerId: 30 }],
  });
});

test("create: passes the body and the actor, answers 201 with a Location header", async () => {
  const { service, calls } = fakeService(ok({ appointment: APPOINTMENT }));
  const body = { petId: 1, serviceId: 2, date: "2026-12-10", time: "10:00" };
  const out = await run(
    createAppointmentController({ service }).createAppointment,
    { user: CUSTOMER_USER, body },
  );
  assert.equal(out.status, 201);
  assert.equal(out.headers.location, "/api/appointments/7");
  assert.deepEqual(out.body, { status: "ok", data: APPOINTMENT });
  assert.deepEqual(calls[0], {
    name: "createAppointment",
    args: [body, { role: "customer", customerId: 30 }],
  });
});

test("update: passes the URL id, the body and the actor, answers 200", async () => {
  const { service, calls } = fakeService(ok({ appointment: APPOINTMENT }));
  const body = { petId: 1, serviceId: 2, date: "2026-12-11", time: "09:00" };
  const out = await run(
    createAppointmentController({ service }).updateAppointment,
    { user: STAFF_USER, params: { id: "7" }, body },
  );
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { status: "ok", data: APPOINTMENT });
  assert.deepEqual(calls[0], {
    name: "updateAppointment",
    args: ["7", body, { role: "staff", customerId: null }],
  });
});

test("status change: passes the URL id, the body and the actor, answers 200", async () => {
  const { service, calls } = fakeService(
    ok({ appointment: { ...APPOINTMENT, status: "Confirmed" } }),
  );
  const out = await run(
    createAppointmentController({ service }).changeAppointmentStatus,
    {
      user: STAFF_USER,
      params: { id: "7" },
      body: { status: "Confirmed" },
    },
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.data.status, "Confirmed");
  assert.deepEqual(calls[0], {
    name: "changeAppointmentStatus",
    args: ["7", { status: "Confirmed" }, { role: "staff", customerId: null }],
  });
});

test("each failure type gets its own HTTP status: 400, 403, 404, 409 (and 401 if a service ever answers it)", async () => {
  const cases = [
    ["validation", 400],
    ["forbidden", 403],
    ["notFound", 404],
    ["conflict", 409],
    ["unauthorized", 401],
  ];
  for (const [type, expectedStatus] of cases) {
    const { service } = fakeService({
      ok: false,
      type,
      message: `msg ${type}`,
      errors: { x: "bad" },
    });
    const controller = createAppointmentController({ service });
    for (const [name, options] of [
      ["listAppointments", {}],
      ["getAppointment", { params: { id: "1" } }],
      ["createAppointment", { body: {} }],
      ["updateAppointment", { params: { id: "1" }, body: {} }],
      ["changeAppointmentStatus", { params: { id: "1" }, body: {} }],
    ]) {
      const out = await run(controller[name], { user: STAFF_USER, ...options });
      assert.equal(out.status, expectedStatus, `${name} ${type}`);
      assert.deepEqual(
        out.body,
        { status: "error", message: `msg ${type}`, errors: { x: "bad" } },
        `${name} ${type}`,
      );
    }
  }
});

test("a failure without field errors has no errors key in the JSON", async () => {
  const { service } = fakeService({
    ok: false,
    type: "forbidden",
    message: "You do not have permission to do this.",
  });
  const out = await run(
    createAppointmentController({ service }).getAppointment,
    { user: CUSTOMER_USER, params: { id: "9" } },
  );
  assert.equal(out.status, 403);
  assert.equal(JSON.parse(JSON.stringify(out.body)).errors, undefined);
});

test("the actor comes ONLY from req.user: a role or customerId in the body, query or URL is ignored", async () => {
  const { service, calls } = fakeService(ok({ appointment: APPOINTMENT }));
  const controller = createAppointmentController({ service });
  const sneaky = {
    role: "admin",
    customerId: 999,
    actor: { role: "admin" },
    user: { role: "admin" },
  };
  await run(controller.createAppointment, {
    user: CUSTOMER_USER,
    body: { petId: 1, ...sneaky },
    query: sneaky,
    params: sneaky,
  });
  assert.deepEqual(calls[0].args[1], { role: "customer", customerId: 30 });
});

test("a user without a customer profile reaches the service with customerId null (the service then answers forbidden)", async () => {
  const { service, calls } = fakeService(ok({ appointments: [] }));
  const controller = createAppointmentController({ service });
  await run(controller.listAppointments, { user: { role: "customer" } }); // customerId missing
  await run(controller.listAppointments, {
    user: { role: "customer", customerId: null },
  });
  assert.deepEqual(
    calls.map((c) => c.args[1]),
    [
      { role: "customer", customerId: null },
      { role: "customer", customerId: null },
    ],
  );
});

test("no logged-in user: 401 and the service is never called (a second lock behind the routes' authenticate)", async () => {
  const { service, calls } = fakeService(ok({ appointments: [] }));
  const controller = createAppointmentController({ service });
  for (const name of [
    "listAppointments",
    "getAppointment",
    "createAppointment",
    "updateAppointment",
    "changeAppointmentStatus",
  ]) {
    const out = await run(controller[name], {
      user: undefined,
      params: { id: "1" },
      body: {},
    });
    assert.equal(out.status, 401, name);
    assert.equal(out.body.status, "error", name);
  }
  assert.equal(calls.length, 0);
});

test("an unexpected error from the service goes to next(error) (the error handler answers 500), not to the client", async () => {
  const boom = new Error("database is down");
  const { service } = fakeService(boom);
  const controller = createAppointmentController({ service });
  for (const name of [
    "listAppointments",
    "getAppointment",
    "createAppointment",
    "updateAppointment",
    "changeAppointmentStatus",
  ]) {
    const out = await run(controller[name], {
      user: STAFF_USER,
      params: { id: "1" },
      body: {},
    });
    assert.equal(out.error, boom, name);
    assert.equal(out.body, null, name);
  }
});

test("a failure type nobody planned for is treated as a bug: next(error), never a made-up status code", async () => {
  const { service } = fakeService({ ok: false, type: "teapot", message: "x" });
  const out = await run(
    createAppointmentController({ service }).getAppointment,
    { user: STAFF_USER, params: { id: "1" } },
  );
  assert.match(out.error.message, /Unknown appointment failure type: teapot/);
  assert.equal(out.body, null);
});

test("the controller exposes exactly the five handlers the routes need", () => {
  const controller = createAppointmentController({
    service: fakeService(ok({})).service,
  });
  assert.deepEqual(Object.keys(controller).sort(), [
    "changeAppointmentStatus",
    "createAppointment",
    "getAppointment",
    "listAppointments",
    "updateAppointment",
  ]);
});
