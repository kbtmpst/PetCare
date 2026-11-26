// Tests for the PROTECTION of the Customers API (who may call which endpoint, and whose record).
//
// What is real here:  createCustomerRoutes (the rules), createAuthenticate, requireRole and
//                     requireOwnCustomerOrRole (the real middleware).
// What is fake here:  the Express router (tests/helpers/fakeRouter.js), the token check, the user lookup
//                     (no MySQL) and the controller.
// So this proves the protection RULES. It does not use real Express, real JWT or a real database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCustomerRoutes } from "../src/routes/createCustomerRoutes.js";
import { createAuthenticate } from "../src/middleware/createAuthenticate.js";
import { requireRole } from "../src/middleware/requireRole.js";
import { requireOwnCustomerOrRole } from "../src/middleware/requireOwnCustomerOrRole.js";
import { createFakeRouter, sendRequest } from "./helpers/fakeRouter.js";

// A fake "users" table. Customer 3 owns customer profile 30; customer 5 owns profile 50.
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
  };
}

const TOKENS = {
  "admin-token": { ok: true, userId: 1 },
  "staff-token": { ok: true, userId: 2 },
  "customer-token": { ok: true, userId: 3 }, // owns profile 30
  "customer2-token": { ok: true, userId: 5 }, // owns profile 50
  "orphan-token": { ok: true, userId: 6 },
  "deactivated-customer-token": { ok: true, userId: 7 },
  "unknown-user-token": { ok: true, userId: 99 },
  "claims-admin-token": { ok: true, userId: 3, role: "admin", customerId: 1 }, // user 3 is a CUSTOMER; the token "claims" more
  "expired-token": { ok: false, reason: "expired" },
  "forged-token": { ok: false, reason: "invalid" },
};

function setup() {
  const users = createUsers();
  const controllerCalls = [];

  const authenticate = createAuthenticate({
    verifyToken: (token) => TOKENS[token] ?? { ok: false, reason: "invalid" },
    findUserById: async (id) => users[id] ?? null,
  });

  const fakeHandler = (name) => (req, res) => {
    controllerCalls.push({ name, params: req.params, body: req.body });
    res.status(200).json({ status: "ok", reached: name });
  };
  const controller = {
    listCustomers: fakeHandler("listCustomers"),
    getCustomer: fakeHandler("getCustomer"),
    createCustomer: fakeHandler("createCustomer"),
    updateCustomer: fakeHandler("updateCustomer"),
  };

  const router = createCustomerRoutes({
    router: createFakeRouter(),
    authenticate,
    requireRole,
    requireOwnCustomerOrRole,
    controller,
  });
  const call = (method, path, token, body) =>
    sendRequest(router, method, path, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
    });

  return { router, users, controllerCalls, call };
}

const LIST = {
  label: "GET /",
  method: "GET",
  path: "/",
  controller: "listCustomers",
};
const CREATE = {
  label: "POST /",
  method: "POST",
  path: "/",
  controller: "createCustomer",
};
const GET_ONE = (id) => ({
  label: `GET /${id}`,
  method: "GET",
  path: `/${id}`,
  controller: "getCustomer",
});
const PUT_ONE = (id) => ({
  label: `PUT /${id}`,
  method: "PUT",
  path: `/${id}`,
  controller: "updateCustomer",
});
const ALL = [LIST, CREATE, GET_ONE(30), PUT_ONE(30)];

const FORBIDDEN_BODY = {
  status: "error",
  message: "You do not have permission to do this.",
};
const NOT_LOGGED_IN_BODY = {
  status: "error",
  message: "Authentication required. Please log in.",
};

// ---------------------------------------------------------------------------
// The route table
// ---------------------------------------------------------------------------

test("the Customers API has exactly 4 endpoints and no DELETE", () => {
  const { router } = setup();
  const routes = router.stack
    .filter((e) => e.method !== null)
    .map((e) => `${e.method} ${e.path}`);
  assert.deepEqual(routes, ["GET /", "GET /:id", "POST /", "PUT /:id"]);
});

test("the login check is registered first, before every endpoint", () => {
  const { router } = setup();
  assert.equal(router.stack[0].method, null);
  assert.equal(router.stack[0].handlers.length, 1);
  assert.ok(router.stack.slice(1).every((e) => e.method !== null));
});

test("every endpoint has a protection step before its controller (no unprotected route)", () => {
  const { router } = setup();
  for (const entry of router.stack.filter((e) => e.method !== null)) {
    assert.equal(
      entry.handlers.length,
      2,
      `${entry.method} ${entry.path}: [rule, controller]`,
    );
  }
});

// ---------------------------------------------------------------------------
// 1. Not logged in -> 401
// ---------------------------------------------------------------------------

test("no token: every endpoint gets 401 and the controller is never reached", async () => {
  for (const endpoint of ALL) {
    const { call, controllerCalls } = setup();
    const result = await call(endpoint.method, endpoint.path, null, {
      firstName: "x",
    });
    assert.equal(result.status, 401, endpoint.label);
    assert.deepEqual(result.body, NOT_LOGGED_IN_BODY, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

test("bad, forged, expired, unknown-user tokens: 401 on every endpoint", async () => {
  for (const token of [
    "forged-token",
    "expired-token",
    "unknown-user-token",
    "not-a-token",
  ]) {
    for (const endpoint of ALL) {
      const { call, controllerCalls } = setup();
      const result = await call(endpoint.method, endpoint.path, token);
      assert.equal(result.status, 401, `${token} ${endpoint.label}`);
      assert.equal(controllerCalls.length, 0, `${token} ${endpoint.label}`);
    }
  }
});

test("a malformed Authorization header: 401", async () => {
  for (const authorization of [
    "",
    "Bearer",
    "Basic dXNlcjpwYXNz",
    "admin-token",
    "Bearer admin-token extra",
  ]) {
    const { router, controllerCalls } = setup();
    const result = await sendRequest(router, "GET", "/30", {
      headers: { authorization },
    });
    assert.equal(result.status, 401, authorization);
    assert.equal(controllerCalls.length, 0, authorization);
  }
});

test("a deactivated customer is refused with 403 even on their own profile", async () => {
  for (const endpoint of [LIST, CREATE, GET_ONE(70), PUT_ONE(70)]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "deactivated-customer-token",
    );
    assert.equal(result.status, 403, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

// ---------------------------------------------------------------------------
// 2. Admin and staff: everything allowed, for any id (existing behaviour kept)
// ---------------------------------------------------------------------------

test("admin and staff reach the right controller on every endpoint", async () => {
  for (const token of ["admin-token", "staff-token"]) {
    for (const endpoint of [
      LIST,
      CREATE,
      GET_ONE(30),
      GET_ONE(50),
      PUT_ONE(30),
      PUT_ONE(50),
    ]) {
      const { call, controllerCalls } = setup();
      const result = await call(endpoint.method, endpoint.path, token, {
        firstName: "Maria",
      });
      assert.equal(result.status, 200, `${token} ${endpoint.label}`);
      assert.deepEqual(
        controllerCalls.map((c) => c.name),
        [endpoint.controller],
        `${token} ${endpoint.label}`,
      );
    }
  }
});

test("admin and staff are NOT blocked by id checks: malformed and nonexistent ids reach the controller (it answers 400/404 as before)", async () => {
  for (const token of ["admin-token", "staff-token"]) {
    for (const id of ["abc", "0", "-1", "1.5", "99999", "4294967296"]) {
      for (const make of [GET_ONE, PUT_ONE]) {
        const { call, controllerCalls } = setup();
        const endpoint = make(id);
        const result = await call(endpoint.method, endpoint.path, token, {});
        assert.equal(result.status, 200, `${token} ${endpoint.label}`);
        assert.equal(controllerCalls.length, 1, `${token} ${endpoint.label}`);
        assert.equal(
          controllerCalls[0].params.id,
          id,
          `${token} ${endpoint.label}`,
        ); // passed on unchanged
      }
    }
  }
});

test("the request body and query reach the controller unchanged for admin and staff", async () => {
  const { call, controllerCalls } = setup();
  const body = {
    firstName: "Maria",
    lastName: "Santos",
    contactNumber: "09171234567",
  };
  await call("POST", "/", "staff-token", body);
  assert.deepEqual(controllerCalls[0].body, body);
});

// ---------------------------------------------------------------------------
// 3. Customer: list and create are forbidden
// ---------------------------------------------------------------------------

test("a customer gets 403 on list and create, and the controller is never reached", async () => {
  for (const endpoint of [LIST, CREATE]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "customer-token",
      { firstName: "x" },
    );
    assert.equal(result.status, 403, endpoint.label);
    assert.deepEqual(result.body, FORBIDDEN_BODY, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

// ---------------------------------------------------------------------------
// 4. Customer ownership
// ---------------------------------------------------------------------------

test("a customer can read and update their OWN profile (id 30)", async () => {
  for (const endpoint of [GET_ONE(30), PUT_ONE(30)]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "customer-token",
      { firstName: "New" },
    );
    assert.equal(result.status, 200, endpoint.label);
    assert.deepEqual(
      controllerCalls.map((c) => c.name),
      [endpoint.controller],
      endpoint.label,
    );
    assert.deepEqual(controllerCalls[0].params, { id: "30" });
  }
});

test("a customer cannot read or update ANOTHER customer's profile: 403, controller never reached", async () => {
  for (const id of ["1", "29", "31", "50", "300"]) {
    for (const make of [GET_ONE, PUT_ONE]) {
      const { call, controllerCalls } = setup();
      const endpoint = make(id);
      const result = await call(
        endpoint.method,
        endpoint.path,
        "customer-token",
        { firstName: "Hacked" },
      );
      assert.equal(result.status, 403, endpoint.label);
      assert.deepEqual(result.body, FORBIDDEN_BODY, endpoint.label);
      assert.equal(controllerCalls.length, 0, endpoint.label);
    }
  }
});

test("two customers cannot reach each other's profile", async () => {
  const first = setup();
  assert.equal((await first.call("GET", "/50", "customer-token")).status, 403); // customer 3 -> profile 50
  assert.equal((await first.call("GET", "/50", "customer2-token")).status, 200); // customer 5 -> profile 50
  assert.equal(
    (await first.call("PUT", "/30", "customer2-token", {})).status,
    403,
  );
  assert.equal(
    (await first.call("PUT", "/30", "customer-token", {})).status,
    200,
  );
});

test("malformed and nonexistent ids give a customer the same uniform 403 (never 400 or 404)", async () => {
  const ids = [
    "99999",
    "4294967295",
    "4294967296",
    "abc",
    "0",
    "-30",
    "1.5",
    "30.0",
    "030",
    "30abc",
    "0x1E",
    "+30",
    "%20",
    "null",
    "undefined",
  ];
  for (const id of ids) {
    for (const make of [GET_ONE, PUT_ONE]) {
      const { call, controllerCalls } = setup();
      const endpoint = make(id);
      const result = await call(
        endpoint.method,
        endpoint.path,
        "customer-token",
        {},
      );
      assert.equal(result.status, 403, endpoint.label);
      assert.deepEqual(result.body, FORBIDDEN_BODY, endpoint.label);
      assert.equal(controllerCalls.length, 0, endpoint.label);
    }
  }
});

test("the 403 for a customer is identical whether the other id exists or not", async () => {
  const { call } = setup();
  const existing = await call("GET", "/50", "customer-token"); // pretend 50 exists
  const missing = await call("GET", "/987654", "customer-token"); // pretend it does not
  assert.equal(existing.status, missing.status);
  assert.deepEqual(existing.body, missing.body);
});

test("a customer account with no customer profile is refused on every endpoint", async () => {
  for (const endpoint of [
    LIST,
    CREATE,
    GET_ONE(30),
    GET_ONE(1),
    GET_ONE("abc"),
    GET_ONE("null"),
    PUT_ONE(30),
    PUT_ONE("0"),
  ]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "orphan-token",
      {},
    );
    assert.equal(result.status, 403, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

// ---------------------------------------------------------------------------
// 5. The database decides the role and the profile, not the token or the request
// ---------------------------------------------------------------------------

test("a token that 'claims' admin or another customerId does not help: the database user is used", async () => {
  for (const endpoint of [LIST, CREATE, GET_ONE(1), PUT_ONE(1)]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "claims-admin-token",
      {},
    );
    assert.equal(result.status, 403, endpoint.label); // user 3 is a customer owning profile 30, not 1
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

test("a customer cannot pick their ownership through the request body, query or headers", async () => {
  const { router, controllerCalls } = setup();
  const result = await sendRequest(router, "PUT", "/50", {
    headers: { authorization: "Bearer customer-token", "x-customer-id": "50" },
    body: { id: 30, customerId: 30, userId: 3, role: "admin" },
  });
  assert.equal(result.status, 403);
  assert.equal(controllerCalls.length, 0);
});

test("role changes in the database take effect immediately (same token)", async () => {
  const { call, users } = setup();
  assert.equal((await call("GET", "/", "customer-token")).status, 403);
  users[3].role = "staff"; // an admin promotes the user
  assert.equal((await call("GET", "/", "customer-token")).status, 200);
  assert.equal((await call("GET", "/50", "customer-token")).status, 200); // staff may read any id
  users[3].role = "customer"; // ...and demotes them again
  assert.equal((await call("GET", "/50", "customer-token")).status, 403);
});

test("if the user's profile link changes in the database, access follows it immediately", async () => {
  const { call, users } = setup();
  assert.equal((await call("GET", "/30", "customer-token")).status, 200);
  users[3].customerId = 31;
  assert.equal((await call("GET", "/30", "customer-token")).status, 403);
  assert.equal((await call("GET", "/31", "customer-token")).status, 200);
});

// ---------------------------------------------------------------------------
// 6. Unsupported methods stay unsupported
// ---------------------------------------------------------------------------

test("DELETE and PATCH are not routes (an admin falls through to the 404 handler)", async () => {
  for (const [method, path] of [
    ["DELETE", "/30"],
    ["PATCH", "/30"],
    ["DELETE", "/"],
  ]) {
    const { call, controllerCalls } = setup();
    const result = await call(method, path, "admin-token");
    assert.equal(result.fellThrough, true, `${method} ${path}`);
    assert.equal(controllerCalls.length, 0, `${method} ${path}`);
  }
});
