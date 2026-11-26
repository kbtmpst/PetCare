// Tests for the PROTECTION of the Services API (who may call which endpoint).
//
// What is real here:  createServiceRoutes (the rules), createAuthenticate and requireRole (the real middleware).
// What is fake here:  the Express router (a small stand-in that records the routes and runs them in the
//                     same order Express would), the token check, the user lookup (no MySQL) and the controller.
// So this proves the protection RULES. It does not use real Express, real JWT or a real database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServiceRoutes } from "../src/routes/createServiceRoutes.js";
import { createAuthenticate } from "../src/middleware/createAuthenticate.js";
import { requireRole } from "../src/middleware/requireRole.js";

// ---------------------------------------------------------------------------
// A tiny fake Express router
// ---------------------------------------------------------------------------

// Records every router.use(...) and router.get/post/put/patch/delete(...) call, in order.
function createFakeRouter() {
  const stack = [];
  const addRoute =
    (method) =>
    (path, ...handlers) =>
      stack.push({ method, path, handlers });
  return {
    stack,
    use: (...handlers) => stack.push({ method: null, path: null, handlers }), // method null = runs for every request
    get: addRoute("GET"),
    post: addRoute("POST"),
    put: addRoute("PUT"),
    patch: addRoute("PATCH"),
    delete: addRoute("DELETE"),
  };
}

// "/:id/status" matches "/5/status". Returns the params ({ id: "5" }) or null when it does not match.
function matchPath(routePath, requestPath) {
  const routeParts = routePath.split("/");
  const requestParts = requestPath.split("/");
  if (routeParts.length !== requestParts.length) return null;
  const params = {};
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(":"))
      params[routeParts[i].slice(1)] = requestParts[i];
    else if (routeParts[i] !== requestParts[i]) return null;
  }
  return params;
}

// Sends one fake request through the recorded routes, like Express does:
// each matching entry runs its handlers in order, and the request stops as soon as something answers.
// Returns { status, body, error, fellThrough }. fellThrough = true means no route answered (Express would use notFound).
async function sendRequest(router, method, path, { headers = {}, body } = {}) {
  const req = { method, headers, body, query: {}, params: {} };
  const outcome = { status: null, body: null, error: null, fellThrough: false };

  for (const entry of router.stack) {
    let params = {};
    if (entry.method !== null) {
      if (entry.method !== method) continue;
      params = matchPath(entry.path, path);
      if (params === null) continue;
    }
    req.params = params;

    for (const handler of entry.handlers) {
      const step = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error("a handler neither answered nor called next()")),
          1000,
        );
        const done = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        const res = {
          status(code) {
            outcome.status = code;
            return this;
          },
          json(responseBody) {
            outcome.body = responseBody;
            done({ answered: true });
            return this;
          },
        };
        handler(req, res, (error) => done({ error: error ?? null }));
      });

      if (step.answered) return outcome;
      if (step.error) {
        outcome.error = step.error;
        return outcome;
      }
    }
  }

  outcome.fellThrough = true;
  return outcome;
}

// ---------------------------------------------------------------------------
// The test setup: real middleware + fake token check, fake users, fake controller
// ---------------------------------------------------------------------------

// A fake "users" table. The tests may change a role here, like an admin editing the database.
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
    4: { ...base, id: 4, role: "admin", active: false }, // a deactivated admin
  };
}

// Fake tokens: the text of the token decides what the fake token check answers.
const TOKENS = {
  "admin-token": { ok: true, userId: 1 },
  "staff-token": { ok: true, userId: 2 },
  "customer-token": { ok: true, userId: 3 },
  "deactivated-admin-token": { ok: true, userId: 4 },
  "unknown-user-token": { ok: true, userId: 99 }, // a valid token for a user that does not exist
  "claims-admin-token": { ok: true, userId: 2, role: "admin" }, // user 2 is STAFF; the token "claims" admin
  "expired-token": { ok: false, reason: "expired" },
  "forged-token": { ok: false, reason: "invalid" },
};

function setup({ lookupError = null } = {}) {
  const users = createUsers();
  const controllerCalls = []; // the names of the controller functions that were reached, with params and body

  const authenticate = createAuthenticate({
    verifyToken: (token) => TOKENS[token] ?? { ok: false, reason: "invalid" },
    findUserById: async (id) => {
      if (lookupError) throw lookupError;
      return users[id] ?? null;
    },
  });

  // A fake controller: it only records that it was reached and answers 200.
  const fakeHandler = (name) => (req, res) => {
    controllerCalls.push({ name, params: req.params, body: req.body });
    res.status(200).json({ status: "ok", reached: name });
  };
  const controller = {
    listServices: fakeHandler("listServices"),
    getService: fakeHandler("getService"),
    createService: fakeHandler("createService"),
    updateService: fakeHandler("updateService"),
    updateServiceStatus: fakeHandler("updateServiceStatus"),
  };

  const router = createServiceRoutes({
    router: createFakeRouter(),
    authenticate,
    requireRole,
    controller,
  });
  const call = (method, path, token, body) =>
    sendRequest(router, method, path, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
    });

  return { router, users, controllerCalls, call };
}

// Every endpoint of the Services API. "expectedController" is the controller function it must reach.
const READ_ENDPOINTS = [
  {
    label: "GET /",
    method: "GET",
    path: "/",
    expectedController: "listServices",
  },
  {
    label: "GET /:id",
    method: "GET",
    path: "/5",
    expectedController: "getService",
  },
];
const WRITE_ENDPOINTS = [
  {
    label: "POST /",
    method: "POST",
    path: "/",
    expectedController: "createService",
  },
  {
    label: "PUT /:id",
    method: "PUT",
    path: "/5",
    expectedController: "updateService",
  },
  {
    label: "PATCH /:id/status",
    method: "PATCH",
    path: "/5/status",
    expectedController: "updateServiceStatus",
  },
];
const ALL_ENDPOINTS = [...READ_ENDPOINTS, ...WRITE_ENDPOINTS];

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

test("the Services API has exactly 5 endpoints and no DELETE", () => {
  const { router } = setup();
  const routes = router.stack
    .filter((entry) => entry.method !== null)
    .map((entry) => `${entry.method} ${entry.path}`);
  assert.deepEqual(routes, [
    "GET /",
    "GET /:id",
    "POST /",
    "PUT /:id",
    "PATCH /:id/status",
  ]);
});

test("the login check is registered first, before every endpoint", () => {
  const { router } = setup();
  assert.equal(router.stack[0].method, null); // the router.use(authenticate) entry
  assert.equal(router.stack[0].handlers.length, 1);
  assert.ok(router.stack.slice(1).every((entry) => entry.method !== null));
});

// ---------------------------------------------------------------------------
// 1. Not logged in -> 401
// ---------------------------------------------------------------------------

test("no token: every endpoint gets 401 and the controller is never reached", async () => {
  for (const endpoint of ALL_ENDPOINTS) {
    const { call, controllerCalls } = setup();
    const result = await call(endpoint.method, endpoint.path, null, {
      name: "x",
    });
    assert.equal(result.status, 401, endpoint.label);
    assert.deepEqual(result.body, NOT_LOGGED_IN_BODY, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

test("a malformed Authorization header: every endpoint gets 401", async () => {
  for (const authorization of [
    "",
    "Bearer",
    "Basic dXNlcjpwYXNz",
    "admin-token",
    "Bearer admin-token extra",
  ]) {
    for (const endpoint of ALL_ENDPOINTS) {
      const { router, controllerCalls } = setup();
      const result = await sendRequest(router, endpoint.method, endpoint.path, {
        headers: { authorization },
      });
      assert.equal(
        result.status,
        401,
        `${endpoint.label} with "${authorization}"`,
      );
      assert.equal(controllerCalls.length, 0);
    }
  }
});

test("a forged, unknown or expired token: every endpoint gets 401", async () => {
  for (const token of [
    "forged-token",
    "not-a-real-token",
    "expired-token",
    "unknown-user-token",
  ]) {
    for (const endpoint of ALL_ENDPOINTS) {
      const { call, controllerCalls } = setup();
      const result = await call(endpoint.method, endpoint.path, token);
      assert.equal(result.status, 401, `${endpoint.label} with ${token}`);
      assert.equal(controllerCalls.length, 0);
    }
  }
});

test("an expired token gets the 'session expired' message", async () => {
  const { call } = setup();
  const result = await call("GET", "/", "expired-token");
  assert.equal(
    result.body.message,
    "Your session has expired. Please log in again.",
  );
});

// ---------------------------------------------------------------------------
// 2-4. Reading: admin, staff and customer are all allowed
// ---------------------------------------------------------------------------

test("admin, staff and customer can read the list and a single service", async () => {
  for (const token of ["admin-token", "staff-token", "customer-token"]) {
    for (const endpoint of READ_ENDPOINTS) {
      const { call, controllerCalls } = setup();
      const result = await call(endpoint.method, endpoint.path, token);
      assert.equal(result.status, 200, `${endpoint.label} with ${token}`);
      assert.deepEqual(result.body, {
        status: "ok",
        reached: endpoint.expectedController,
      });
      assert.equal(controllerCalls.length, 1);
      assert.equal(controllerCalls[0].name, endpoint.expectedController);
    }
  }
});

test("the :id from the URL reaches the controller", async () => {
  const { call, controllerCalls } = setup();
  await call("GET", "/42", "customer-token");
  assert.deepEqual(controllerCalls[0].params, { id: "42" });
});

// ---------------------------------------------------------------------------
// 5, 8, 10. Writing: admin is allowed
// ---------------------------------------------------------------------------

test("admin can create, update and change the status of a service", async () => {
  for (const endpoint of WRITE_ENDPOINTS) {
    const { call, controllerCalls } = setup();
    const body = { name: "Spa Day", price: 800, durationMinutes: 90 };
    const result = await call(
      endpoint.method,
      endpoint.path,
      "admin-token",
      body,
    );
    assert.equal(result.status, 200, endpoint.label);
    assert.deepEqual(result.body, {
      status: "ok",
      reached: endpoint.expectedController,
    });
    assert.equal(controllerCalls.length, 1);
    assert.equal(controllerCalls[0].name, endpoint.expectedController);
    assert.deepEqual(controllerCalls[0].body, body); // the body arrives untouched
  }
});

// ---------------------------------------------------------------------------
// 6, 7, 9, 11. Writing: staff and customers get 403
// ---------------------------------------------------------------------------

test("staff and customer cannot create, update or change the status of a service (403)", async () => {
  for (const token of ["staff-token", "customer-token"]) {
    for (const endpoint of WRITE_ENDPOINTS) {
      const { call, controllerCalls } = setup();
      const result = await call(endpoint.method, endpoint.path, token, {
        name: "Spa Day",
        price: 800,
        durationMinutes: 90,
      });
      assert.equal(result.status, 403, `${endpoint.label} with ${token}`);
      assert.deepEqual(result.body, FORBIDDEN_BODY);
      assert.equal(
        controllerCalls.length,
        0,
        `${endpoint.label} with ${token} must not reach the controller`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 12. Existing validation is untouched: the protection only decides who gets IN
// ---------------------------------------------------------------------------

test("an admin with an invalid body still reaches the controller (validation stays in the service)", async () => {
  const { call, controllerCalls } = setup();
  const result = await call("POST", "/", "admin-token", {
    name: "",
    price: -5,
    durationMinutes: 0,
  });
  assert.equal(result.status, 200); // the fake controller answered; the real one would answer 400
  assert.equal(controllerCalls.length, 1);
  assert.deepEqual(controllerCalls[0].body, {
    name: "",
    price: -5,
    durationMinutes: 0,
  });
});

test("a staff member with an invalid body gets 403, not 400", async () => {
  const { call, controllerCalls } = setup();
  const result = await call("POST", "/", "staff-token", {
    name: "",
    price: -5,
    durationMinutes: 0,
  });
  assert.equal(result.status, 403);
  assert.equal(controllerCalls.length, 0);
});

test("a request that is not logged in gets 401 even with a bad id or a bad body (nothing is revealed)", async () => {
  const { call, controllerCalls } = setup();
  assert.equal((await call("GET", "/abc", null)).status, 401);
  assert.equal((await call("GET", "/999999", null)).status, 401);
  assert.equal((await call("PUT", "/abc", null, {})).status, 401);
  assert.equal(controllerCalls.length, 0);
});

test("a logged-in user with a bad id still reaches the controller (the service answers 400/404 as before)", async () => {
  const { call, controllerCalls } = setup();
  assert.equal((await call("GET", "/abc", "customer-token")).status, 200); // fake controller
  assert.equal(controllerCalls[0].name, "getService");
  assert.deepEqual(controllerCalls[0].params, { id: "abc" });
});

// ---------------------------------------------------------------------------
// The role always comes from the database user, never from the token
// ---------------------------------------------------------------------------

test("a role claimed inside the token is ignored: the database role (staff) decides", async () => {
  for (const endpoint of WRITE_ENDPOINTS) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "claims-admin-token",
      {},
    );
    assert.equal(result.status, 403, endpoint.label);
    assert.equal(controllerCalls.length, 0);
  }
});

test("when a role changes in the database, the SAME token follows the new role on the next request", async () => {
  const { call, users, controllerCalls } = setup();

  assert.equal((await call("POST", "/", "admin-token", {})).status, 200); // admin: allowed
  users[1].role = "staff"; // someone changes this user to staff in the database
  assert.equal((await call("POST", "/", "admin-token", {})).status, 403); // same token, now refused
  assert.equal((await call("GET", "/", "admin-token")).status, 200); // reading is still allowed
  assert.equal(
    controllerCalls.filter((c) => c.name === "createService").length,
    1,
  );

  users[2].role = "admin"; // and a staff member becomes admin
  assert.equal((await call("POST", "/", "staff-token", {})).status, 200);
});

test("a deactivated admin is blocked everywhere with 403, even with a valid token", async () => {
  for (const endpoint of ALL_ENDPOINTS) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "deactivated-admin-token",
      {},
    );
    assert.equal(result.status, 403, endpoint.label);
    assert.equal(
      result.body.message,
      "This account has been deactivated. Please contact the clinic.",
    );
    assert.equal(controllerCalls.length, 0);
  }
});

test("a deactivated account becomes blocked right away", async () => {
  const { call, users } = setup();
  assert.equal((await call("GET", "/", "admin-token")).status, 200);
  users[1].active = false;
  assert.equal((await call("GET", "/", "admin-token")).status, 403);
});

// ---------------------------------------------------------------------------
// Errors and unknown routes
// ---------------------------------------------------------------------------

test("a database error during the login check is passed on, and the controller is not reached", async () => {
  const boom = new Error("database down");
  const { call, controllerCalls } = setup({ lookupError: boom });
  const result = await call("GET", "/", "admin-token");
  assert.equal(result.error, boom); // Express would hand this to errorHandler (a JSON 500)
  assert.equal(result.status, null);
  assert.equal(controllerCalls.length, 0);
});

test("DELETE is not an endpoint: without a token 401, with a token it falls through to 'route not found'", async () => {
  const { call, controllerCalls } = setup();
  assert.equal((await call("DELETE", "/5", null)).status, 401);
  const loggedIn = await call("DELETE", "/5", "admin-token");
  assert.equal(loggedIn.fellThrough, true); // no route matched, so Express would answer with notFound (404)
  assert.equal(controllerCalls.length, 0);
});

// ---------------------------------------------------------------------------
// The fake router itself (so a mistake in the test tools cannot hide a real problem)
// ---------------------------------------------------------------------------

test("the test tools: a route without protection WOULD let an anonymous request through", async () => {
  const router = createFakeRouter();
  const reached = [];
  router.get("/", (req, res) => {
    reached.push("open");
    res.json({ ok: true });
  });
  const result = await sendRequest(router, "GET", "/");
  assert.equal(result.status, null);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(reached, ["open"]);
});

test("the test tools: path matching handles :id and rejects other shapes", () => {
  assert.deepEqual(matchPath("/:id", "/7"), { id: "7" });
  assert.deepEqual(matchPath("/:id/status", "/7/status"), { id: "7" });
  assert.equal(matchPath("/:id", "/7/status"), null);
  assert.equal(matchPath("/", "/7"), null);
});
