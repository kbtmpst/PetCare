// Tests for the PROTECTION of the Appointments API (who may call which endpoint, and whose appointments).
//
// Two parts:
//  A) The route table, with a FAKE controller: which endpoints exist, and that login and role are checked first.
//  B) The whole chain, with the REAL controller logic and the REAL business service, over a tiny in-memory data store:
//     proves customers cannot reach other people's appointments through the routes.
//
// What is real here:  createAppointmentRoutes, createAuthenticate, requireRole, createAppointmentController,
//                     createAppointmentService and the appointment validator.
// What is fake here:  the Express router (tests/helpers/fakeRouter.js), the token check, the user lookup and ALL repositories
//                     (no MySQL). The fake response has no Location header, so a successful POST is not tested here
//                     (the controller test covers it).
// So this proves the protection RULES. It does not use real Express, real JWT or a real database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppointmentRoutes } from "../src/routes/createAppointmentRoutes.js";
import { createAuthenticate } from "../src/middleware/createAuthenticate.js";
import { requireRole } from "../src/middleware/requireRole.js";
import { createAppointmentController } from "../src/controllers/createAppointmentController.js";
import { createAppointmentService } from "../src/business/services/createAppointmentService.js";
import { createFakeRouter, sendRequest } from "./helpers/fakeRouter.js";

// A fake "users" table. Customer user 3 owns profile 30; customer user 5 owns profile 50.
function createUsers() {
  const base = {
    email: "x@example.com",
    fullName: "X",
    active: true,
    customerId: null,
  };
  return {
    1: { ...base, id: 1, role: "admin" },
    2: { ...base, id: 2, role: "staff" },
    3: { ...base, id: 3, role: "customer", customerId: 30 },
    5: { ...base, id: 5, role: "customer", customerId: 50 },
    6: { ...base, id: 6, role: "customer", customerId: null }, // a customer account with no profile
    7: { ...base, id: 7, role: "customer", customerId: 70, active: false }, // deactivated customer
    8: { ...base, id: 8, role: "owner" }, // a role the system does not know
  };
}

const TOKENS = {
  "admin-token": { ok: true, userId: 1 },
  "staff-token": { ok: true, userId: 2 },
  "customer-token": { ok: true, userId: 3 }, // owns profile 30
  "customer2-token": { ok: true, userId: 5 }, // owns profile 50
  "orphan-token": { ok: true, userId: 6 },
  "deactivated-customer-token": { ok: true, userId: 7 },
  "unknown-role-token": { ok: true, userId: 8 },
  "unknown-user-token": { ok: true, userId: 99 },
  "claims-admin-token": { ok: true, userId: 3, role: "admin", customerId: 50 }, // user 3 is a CUSTOMER; the token "claims" more
  "expired-token": { ok: false, reason: "expired" },
  "forged-token": { ok: false, reason: "invalid" },
};

const FORBIDDEN_BODY = {
  status: "error",
  message: "You do not have permission to do this.",
};

// The fake response only records a status when status() is called, and Express answers 200 when it is not.
const statusOf = (out) => out.status ?? 200;
// Compares a body the way a client would receive it as JSON (a missing "errors" key and errors: undefined are the same).
const asJson = (body) => JSON.parse(JSON.stringify(body));

// Builds the routes. "makeController(users)" lets each part plug in its own controller.
function buildRouter(makeController) {
  const users = createUsers();
  const authenticate = createAuthenticate({
    verifyToken: (token) => TOKENS[token] ?? { ok: false, reason: "invalid" },
    findUserById: async (id) => users[id] ?? null,
  });
  let pendingQuery = {}; // the fake "?query" of the next request (the fake router has no query string)
  const fakeRouter = createFakeRouter();
  fakeRouter.use((req, res, next) => {
    // test-only first step
    req.query = { ...pendingQuery };
    next();
  });
  const router = createAppointmentRoutes({
    router: fakeRouter,
    authenticate,
    requireRole,
    controller: makeController(),
  });
  const call = (method, path, token, body, query = {}) => {
    pendingQuery = query;
    return sendRequest(router, method, path, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
    });
  };
  return { router, call };
}

// ---------------------------------------------------------------------------
// Part A: the route table (fake controller)
// ---------------------------------------------------------------------------

function setupFakeController() {
  const reached = [];
  const handler = (name) => (req, res) => {
    reached.push({
      name,
      params: req.params,
      body: req.body,
      query: req.query,
      user: req.user,
    });
    res.status(200).json({ status: "ok", reached: name });
  };
  const built = buildRouter(() => ({
    listAppointments: handler("listAppointments"),
    getAppointment: handler("getAppointment"),
    createAppointment: handler("createAppointment"),
    updateAppointment: handler("updateAppointment"),
    changeAppointmentStatus: handler("changeAppointmentStatus"),
  }));
  return { ...built, reached };
}

const ENDPOINTS = [
  { label: "GET /", method: "GET", path: "/", controller: "listAppointments" },
  { label: "GET /7", method: "GET", path: "/7", controller: "getAppointment" },
  {
    label: "POST /",
    method: "POST",
    path: "/",
    controller: "createAppointment",
  },
  {
    label: "PUT /7",
    method: "PUT",
    path: "/7",
    controller: "updateAppointment",
  },
  {
    label: "PATCH /7/status",
    method: "PATCH",
    path: "/7/status",
    controller: "changeAppointmentStatus",
  },
];

test("the Appointments API has exactly 5 endpoints and no DELETE", () => {
  const { router } = setupFakeController();
  const routes = router.stack
    .filter((e) => e.method !== null)
    .map((e) => `${e.method} ${e.path}`);
  assert.deepEqual(routes, [
    "GET /",
    "GET /:id",
    "POST /",
    "PUT /:id",
    "PATCH /:id/status",
  ]);
});

test("the login check is registered before every endpoint, and every endpoint also checks the role", () => {
  const { router } = setupFakeController();
  assert.equal(router.stack[0].method, null); // the test-only query step
  assert.equal(router.stack[1].method, null); // router.use(authenticate)
  assert.equal(router.stack[1].handlers.length, 1);
  const endpoints = router.stack.slice(2);
  assert.ok(endpoints.every((e) => e.method !== null));
  assert.ok(
    endpoints.every((e) => e.handlers.length === 2),
    "role check, then controller",
  );
});

test("no login: every endpoint answers 401 and the controller is never reached", async () => {
  const { call, reached } = setupFakeController();
  for (const endpoint of ENDPOINTS) {
    for (const token of [
      undefined,
      "forged-token",
      "expired-token",
      "unknown-user-token",
    ]) {
      const out = await call(endpoint.method, endpoint.path, token, {});
      assert.equal(out.status, 401, `${endpoint.label} ${token}`);
      assert.equal(out.body.status, "error", `${endpoint.label} ${token}`);
      assert.equal(typeof out.body.message, "string");
    }
  }
  assert.equal(reached.length, 0);
});

test("a deactivated account is refused with 403 on every endpoint and never reaches the controller", async () => {
  const { call, reached } = setupFakeController();
  for (const endpoint of ENDPOINTS) {
    const out = await call(
      endpoint.method,
      endpoint.path,
      "deactivated-customer-token",
      {},
    );
    assert.equal(out.status, 403, endpoint.label);
  }
  assert.equal(reached.length, 0);
});

test("a logged-in user whose role the system does not know gets 403 and never reaches the controller", async () => {
  const { call, reached } = setupFakeController();
  for (const endpoint of ENDPOINTS) {
    const out = await call(
      endpoint.method,
      endpoint.path,
      "unknown-role-token",
      {},
    );
    assert.equal(out.status, 403, endpoint.label);
    assert.deepEqual(asJson(out.body), FORBIDDEN_BODY);
  }
  assert.equal(reached.length, 0);
});

test("admin, staff and customers all reach the right controller function on every endpoint", async () => {
  for (const token of [
    "admin-token",
    "staff-token",
    "customer-token",
    "orphan-token",
  ]) {
    const { call, reached } = setupFakeController();
    for (const endpoint of ENDPOINTS) {
      const out = await call(endpoint.method, endpoint.path, token, {});
      assert.equal(statusOf(out), 200, `${endpoint.label} ${token}`);
      assert.equal(
        out.body.reached,
        endpoint.controller,
        `${endpoint.label} ${token}`,
      );
    }
    assert.equal(reached.length, ENDPOINTS.length);
  }
});

test("the controller receives the URL id, the body and the logged-in user taken from the DATABASE, not from the token", async () => {
  const { call, reached } = setupFakeController();
  await call("PATCH", "/7/status", "claims-admin-token", {
    status: "Cancelled",
  });
  assert.deepEqual(reached[0].params, { id: "7" });
  assert.deepEqual(reached[0].body, { status: "Cancelled" });
  assert.equal(reached[0].user.role, "customer"); // the token claimed admin; the database says customer
  assert.equal(reached[0].user.customerId, 30);
});

test("unknown paths and methods are not handled by this router (they fall through to the 404 handler)", async () => {
  const { call } = setupFakeController();
  for (const [method, path] of [
    ["DELETE", "/7"],
    ["PATCH", "/7"],
    ["PUT", "/7/status"],
    ["GET", "/7/status"],
    ["POST", "/7"],
  ]) {
    const out = await call(method, path, "admin-token", {});
    assert.equal(out.fellThrough, true, `${method} ${path}`);
  }
});

// ---------------------------------------------------------------------------
// Part B: the whole chain (real controller logic + real business service + in-memory data)
// ---------------------------------------------------------------------------

function setupRealChain() {
  const rows = [
    {
      id: 1,
      petId: 101,
      customerId: 30,
      serviceId: 1,
      service: "Full Groom",
      price: 650,
      durationMinutes: 120,
      date: "2099-12-10",
      time: "09:00",
      notes: "",
      status: "Pending",
    },
    {
      id: 2,
      petId: 103,
      customerId: 50,
      serviceId: 1,
      service: "Full Groom",
      price: 650,
      durationMinutes: 120,
      date: "2099-12-10",
      time: "13:00",
      notes: "secret",
      status: "Pending",
    },
  ];
  const pets = {
    101: { id: 101, customerId: 30 },
    103: { id: 103, customerId: 50 },
  };
  const calls = { transactions: 0, reads: 0 };
  const service = createAppointmentService({
    appointments: {
      getAppointments: async (filters = {}) => {
        calls.reads++;
        return rows
          .filter(
            (a) =>
              filters.customerId === undefined ||
              a.customerId === filters.customerId,
          )
          .map((a) => ({ ...a }));
      },
      getAppointmentById: async (id) => {
        calls.reads++;
        const found = rows.find((a) => a.id === id);
        return found ? { ...found } : null;
      },
      // Anything that would WRITE goes through a transaction. The tests below expect these never to be reached.
      runInTransaction: async () => {
        calls.transactions++;
        throw new Error("a transaction was started");
      },
      runInScheduleTransaction: async () => {
        calls.transactions++;
        throw new Error("a transaction was started");
      },
    },
    pets: { getPetById: async (id) => pets[id] ?? null },
    services: {
      getServiceById: async (id) =>
        id === 1
          ? {
              id: 1,
              name: "Full Groom",
              price: 650,
              durationMinutes: 120,
              active: true,
            }
          : null,
    },
    today: () => "2026-12-01",
  });
  const built = buildRouter(() => createAppointmentController({ service }));
  return { ...built, calls };
}

test("CHAIN: a customer reads their own appointment", async () => {
  const { call } = setupRealChain();
  const out = await call("GET", "/1", "customer-token");
  assert.equal(statusOf(out), 200);
  assert.equal(out.body.data.id, 1);
});

test("CHAIN: a customer gets the SAME 403 for someone else's appointment, a missing one, and a malformed id", async () => {
  const { call } = setupRealChain();
  const theirs = await call("GET", "/2", "customer-token");
  const missing = await call("GET", "/999", "customer-token");
  const malformed = await call("GET", "/abc", "customer-token");
  for (const out of [theirs, missing, malformed]) {
    assert.equal(out.status, 403);
    assert.deepEqual(asJson(out.body), FORBIDDEN_BODY);
  }
  assert.equal(JSON.stringify(theirs.body).includes("secret"), false);
});

test("CHAIN: a customer's list holds only their own appointments, even with a customerId filter for someone else", async () => {
  const { call } = setupRealChain();
  for (const query of [{}, { customerId: "50" }, { petId: "103" }]) {
    const out = await call("GET", "/", "customer-token", undefined, query);
    assert.equal(statusOf(out), 200, JSON.stringify(query));
    assert.ok(
      out.body.data.every((a) => a.customerId === 30),
      JSON.stringify(query),
    );
    assert.equal(JSON.stringify(out.body).includes("secret"), false);
  }
});

test("CHAIN: staff and admin read any appointment and the full list", async () => {
  const { call } = setupRealChain();
  for (const token of ["staff-token", "admin-token"]) {
    assert.equal(statusOf(await call("GET", "/2", token)), 200);
    assert.equal((await call("GET", "/", token)).body.count, 2);
  }
});

test("CHAIN: staff get 404 for a missing appointment and 400 for a malformed id (only customers get the uniform 403)", async () => {
  const { call } = setupRealChain();
  assert.equal((await call("GET", "/999", "staff-token")).status, 404);
  assert.equal((await call("GET", "/abc", "staff-token")).status, 400);
});

test("CHAIN: a customer cannot edit, cancel or change the status of someone else's appointment (403, no transaction started)", async () => {
  const { call, calls } = setupRealChain();
  const edit = { petId: 103, serviceId: 1, date: "2099-12-12", time: "10:00" };
  for (const [method, path, body] of [
    ["PUT", "/2", edit],
    ["PATCH", "/2/status", { status: "Cancelled" }],
    ["PATCH", "/2/status", { status: "Confirmed" }],
    ["PATCH", "/999/status", { status: "Cancelled" }],
    ["PATCH", "/abc/status", { status: "Cancelled" }],
  ]) {
    const out = await call(method, path, "customer-token", body);
    assert.equal(out.status, 403, `${method} ${path} ${body.status ?? ""}`);
    assert.deepEqual(asJson(out.body), FORBIDDEN_BODY);
  }
  assert.equal(calls.transactions, 0);
});

test("CHAIN: a customer cannot book for another owner's pet or a missing pet (403, no transaction started)", async () => {
  const { call, calls } = setupRealChain();
  for (const petId of [103, 999]) {
    const out = await call("POST", "/", "customer-token", {
      petId,
      serviceId: 1,
      date: "2099-12-20",
      time: "09:00",
    });
    assert.equal(out.status, 403, `pet ${petId}`);
    assert.deepEqual(asJson(out.body), FORBIDDEN_BODY);
  }
  assert.equal(calls.transactions, 0);
});

test("CHAIN: a customer can never Confirm, Start or Complete their own appointment (403, no transaction started)", async () => {
  const { call, calls } = setupRealChain();
  for (const status of ["Confirmed", "In Progress", "Completed"]) {
    const out = await call("PATCH", "/1/status", "customer-token", { status });
    assert.equal(out.status, 403, status);
  }
  assert.equal(calls.transactions, 0);
});

test("CHAIN: a customer account with no customer profile is refused everywhere (403)", async () => {
  const { call } = setupRealChain();
  for (const [method, path, body] of [
    ["GET", "/", undefined],
    ["GET", "/1", undefined],
    [
      "POST",
      "/",
      { petId: 101, serviceId: 1, date: "2099-12-20", time: "09:00" },
    ],
    [
      "PUT",
      "/1",
      { petId: 101, serviceId: 1, date: "2099-12-20", time: "09:00" },
    ],
    ["PATCH", "/1/status", { status: "Cancelled" }],
  ]) {
    const out = await call(method, path, "orphan-token", body);
    assert.equal(out.status, 403, `${method} ${path}`);
    assert.deepEqual(asJson(out.body), FORBIDDEN_BODY);
  }
});

test("CHAIN: a token that CLAIMS admin does not make a customer an admin (the database role wins)", async () => {
  const { call } = setupRealChain();
  // user 3 is customer 30; the token claims admin and customer 50
  assert.equal((await call("GET", "/2", "claims-admin-token")).status, 403);
  assert.equal(statusOf(await call("GET", "/1", "claims-admin-token")), 200);
  assert.ok(
    (await call("GET", "/", "claims-admin-token")).body.data.every(
      (a) => a.customerId === 30,
    ),
  );
});

test("CHAIN: a role or customerId smuggled in the request body does not change who the caller is", async () => {
  const { call, calls } = setupRealChain();
  const out = await call("PATCH", "/2/status", "customer-token", {
    status: "Cancelled",
    role: "admin",
    customerId: 50,
  });
  assert.equal(out.status, 403);
  assert.equal(calls.transactions, 0);
});

test("CHAIN: without a login nothing reaches the business layer at all", async () => {
  const { call, calls } = setupRealChain();
  for (const endpoint of ENDPOINTS)
    await call(endpoint.method, endpoint.path, undefined, {});
  assert.equal(calls.reads, 0);
  assert.equal(calls.transactions, 0);
});
