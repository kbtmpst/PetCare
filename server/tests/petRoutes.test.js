// Tests for the PROTECTION of the Pets API (who may call which endpoint, and whose pets).
//
// What is real here:  createPetRoutes (the rules), createAuthenticate, createRequireOwnPetOrRole,
//                     scopePetListToOwner and requireOwnerInBody (the real middleware).
// What is fake here:  the Express router (tests/helpers/fakeRouter.js), the token check, the user lookup,
//                     the pet-owner lookup (no MySQL) and the controller.
// So this proves the protection RULES. It does not use real Express, real JWT or a real database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPetRoutes } from "../src/routes/createPetRoutes.js";
import { createAuthenticate } from "../src/middleware/createAuthenticate.js";
import { createRequireOwnPetOrRole } from "../src/middleware/createRequireOwnPetOrRole.js";
import {
  scopePetListToOwner,
  requireOwnerInBody,
} from "../src/middleware/scopePetsToOwner.js";
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
  };
}

// A fake pets table: pet id -> owner. Pets 101, 102 belong to customer 30; 103 to customer 50; 107 to customer 70.
const PET_OWNERS = { 101: 30, 102: 30, 103: 50, 107: 70 };

const TOKENS = {
  "admin-token": { ok: true, userId: 1 },
  "staff-token": { ok: true, userId: 2 },
  "customer-token": { ok: true, userId: 3 }, // owns profile 30
  "customer2-token": { ok: true, userId: 5 }, // owns profile 50
  "orphan-token": { ok: true, userId: 6 },
  "deactivated-customer-token": { ok: true, userId: 7 },
  "unknown-user-token": { ok: true, userId: 99 },
  "claims-admin-token": { ok: true, userId: 3, role: "admin", customerId: 50 }, // user 3 is a CUSTOMER; the token "claims" more
  "expired-token": { ok: false, reason: "expired" },
  "forged-token": { ok: false, reason: "invalid" },
};

function setup({ petLookupError = null } = {}) {
  const users = createUsers();
  const owners = { ...PET_OWNERS };
  const controllerCalls = [];
  const lookups = [];
  let pendingQuery = {}; // the fake "?query" of the next request (the fake router always sends an empty one)

  const authenticate = createAuthenticate({
    verifyToken: (token) => TOKENS[token] ?? { ok: false, reason: "invalid" },
    findUserById: async (id) => users[id] ?? null,
  });
  const requireOwnPetOrRole = createRequireOwnPetOrRole({
    findPetOwnerId: async (petId) => {
      lookups.push(petId);
      if (petLookupError) throw petLookupError;
      return owners[petId] ?? null;
    },
  });

  const fakeHandler = (name) => (req, res) => {
    controllerCalls.push({
      name,
      params: req.params,
      body: req.body,
      query: req.query,
    });
    res.status(200).json({ status: "ok", reached: name });
  };
  const controller = {
    listPets: fakeHandler("listPets"),
    getPet: fakeHandler("getPet"),
    createPet: fakeHandler("createPet"),
    updatePet: fakeHandler("updatePet"),
  };

  const fakeRouter = createFakeRouter();
  // Test-only first step: gives the next request its "?query" (the fake router has no query string).
  fakeRouter.use((req, res, next) => {
    req.query = { ...pendingQuery };
    next();
  });
  const router = createPetRoutes({
    router: fakeRouter,
    authenticate,
    requireOwnPetOrRole,
    scopePetListToOwner,
    requireOwnerInBody,
    controller,
  });
  const call = (method, path, token, body, query = {}) => {
    pendingQuery = query;
    return sendRequest(router, method, path, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
    });
  };

  return { router, users, owners, controllerCalls, lookups, call };
}

const LIST = {
  label: "GET /",
  method: "GET",
  path: "/",
  controller: "listPets",
};
const CREATE = {
  label: "POST /",
  method: "POST",
  path: "/",
  controller: "createPet",
};
const GET_ONE = (id) => ({
  label: `GET /${id}`,
  method: "GET",
  path: `/${id}`,
  controller: "getPet",
});
const PUT_ONE = (id) => ({
  label: `PUT /${id}`,
  method: "PUT",
  path: `/${id}`,
  controller: "updatePet",
});
const ALL = [LIST, CREATE, GET_ONE(101), PUT_ONE(101)];

const petBody = (customerId) => ({
  customerId,
  name: "Mochi",
  species: "Dog",
  breed: "Poodle",
  sex: "Male",
});
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

test("the Pets API has exactly 4 endpoints and no DELETE", () => {
  const { router } = setup();
  const routes = router.stack
    .filter((e) => e.method !== null)
    .map((e) => `${e.method} ${e.path}`);
  assert.deepEqual(routes, ["GET /", "GET /:id", "POST /", "PUT /:id"]);
});

test("the login check is registered before every endpoint", () => {
  const { router } = setup();
  assert.equal(router.stack[0].method, null); // the test-only query step
  assert.equal(router.stack[1].method, null); // the router.use(authenticate) entry
  assert.equal(router.stack[1].handlers.length, 1);
  assert.ok(router.stack.slice(2).every((e) => e.method !== null));
});

test("every endpoint has a protection step before its controller (no unprotected route)", () => {
  const { router } = setup();
  for (const entry of router.stack.filter((e) => e.method !== null)) {
    assert.ok(
      entry.handlers.length >= 2,
      `${entry.method} ${entry.path}: [rules..., controller]`,
    );
  }
});

// ---------------------------------------------------------------------------
// 1. Not logged in -> 401
// ---------------------------------------------------------------------------

test("no token: every endpoint gets 401 and neither the controller nor the database is reached", async () => {
  for (const endpoint of ALL) {
    const { call, controllerCalls, lookups } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      null,
      petBody(30),
    );
    assert.equal(result.status, 401, endpoint.label);
    assert.deepEqual(result.body, NOT_LOGGED_IN_BODY, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
    assert.equal(lookups.length, 0, endpoint.label);
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
      const result = await call(
        endpoint.method,
        endpoint.path,
        token,
        petBody(30),
      );
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
    const result = await sendRequest(router, "GET", "/101", {
      headers: { authorization },
    });
    assert.equal(result.status, 401, authorization);
    assert.equal(controllerCalls.length, 0, authorization);
  }
});

test("a deactivated customer is refused with 403 on every endpoint, even on their own pet", async () => {
  for (const endpoint of [LIST, CREATE, GET_ONE(107), PUT_ONE(107)]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "deactivated-customer-token",
      petBody(70),
    );
    assert.equal(result.status, 403, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

// ---------------------------------------------------------------------------
// 2. Admin and staff: everything allowed, existing behaviour kept
// ---------------------------------------------------------------------------

test("admin and staff reach the right controller on every endpoint, for any owner", async () => {
  for (const token of ["admin-token", "staff-token"]) {
    for (const endpoint of [
      LIST,
      CREATE,
      GET_ONE(101),
      GET_ONE(103),
      PUT_ONE(101),
      PUT_ONE(103),
    ]) {
      const { call, controllerCalls, lookups } = setup();
      const result = await call(
        endpoint.method,
        endpoint.path,
        token,
        petBody(50),
      );
      assert.equal(result.status, 200, `${token} ${endpoint.label}`);
      assert.deepEqual(
        controllerCalls.map((c) => c.name),
        [endpoint.controller],
        `${token} ${endpoint.label}`,
      );
      assert.equal(lookups.length, 0, `${token} ${endpoint.label}`); // no ownership lookup for them
    }
  }
});

test("admin and staff are NOT blocked by id checks: malformed and nonexistent ids reach the controller (it answers 400/404 as before)", async () => {
  for (const token of ["admin-token", "staff-token"]) {
    for (const id of ["abc", "0", "-1", "1.5", "99999", "4294967296"]) {
      for (const make of [GET_ONE, PUT_ONE]) {
        const { call, controllerCalls } = setup();
        const endpoint = make(id);
        const result = await call(
          endpoint.method,
          endpoint.path,
          token,
          petBody(30),
        );
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

test("admin and staff list with their own ?customerId and ?search exactly as before", async () => {
  for (const token of ["admin-token", "staff-token"]) {
    const { call, controllerCalls } = setup();
    await call("GET", "/", token, undefined, {
      customerId: "50",
      search: "mo",
    });
    assert.deepEqual(controllerCalls[0].query, {
      customerId: "50",
      search: "mo",
    });
    await call("GET", "/", token, undefined, {});
    assert.deepEqual(controllerCalls[1].query, {}); // no filter added: they see all pets
    await call("GET", "/", token, undefined, { customerId: "abc" });
    assert.deepEqual(controllerCalls[2].query, { customerId: "abc" }); // the validator will answer 400 as before
  }
});

test("admin and staff may create and move pets between ANY owners (the body reaches the controller unchanged)", async () => {
  for (const token of ["admin-token", "staff-token"]) {
    const { call, controllerCalls } = setup();
    await call("POST", "/", token, petBody(50));
    await call("PUT", "/101", token, petBody(50)); // pet 101 belongs to 30: moving it to 50 is fine for staff/admin
    assert.deepEqual(controllerCalls[0].body, petBody(50));
    assert.deepEqual(controllerCalls[1].body, petBody(50));
  }
});

// ---------------------------------------------------------------------------
// 3. Customer: listing
// ---------------------------------------------------------------------------

test("a customer's list is forced to their own pets", async () => {
  const { call, controllerCalls } = setup();
  const result = await call("GET", "/", "customer-token", undefined, {});
  assert.equal(result.status, 200);
  assert.deepEqual(controllerCalls[0].query, { customerId: "30" });
});

test("a customer cannot list another owner's pets with ?customerId (it is replaced by their own id)", async () => {
  for (const asked of ["50", "1", "abc", "0", "30abc"]) {
    const { call, controllerCalls } = setup();
    const result = await call("GET", "/", "customer-token", undefined, {
      customerId: asked,
    });
    assert.equal(result.status, 200, asked);
    assert.equal(controllerCalls[0].query.customerId, "30", asked);
  }
});

test("a customer's ?search is kept inside their own pets", async () => {
  const { call, controllerCalls } = setup();
  await call("GET", "/", "customer-token", undefined, {
    customerId: "50",
    search: "mochi",
  });
  assert.deepEqual(controllerCalls[0].query, {
    customerId: "30",
    search: "mochi",
  });
});

test("a customer account with no profile is refused on the list", async () => {
  const { call, controllerCalls } = setup();
  const result = await call("GET", "/", "orphan-token");
  assert.equal(result.status, 403);
  assert.equal(controllerCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 4. Customer: reading and updating a pet by id
// ---------------------------------------------------------------------------

test("a customer can read and update their OWN pets (101 and 102)", async () => {
  for (const id of ["101", "102"]) {
    for (const make of [GET_ONE, PUT_ONE]) {
      const { call, controllerCalls } = setup();
      const endpoint = make(id);
      const result = await call(
        endpoint.method,
        endpoint.path,
        "customer-token",
        petBody(30),
      );
      assert.equal(result.status, 200, endpoint.label);
      assert.deepEqual(
        controllerCalls.map((c) => c.name),
        [endpoint.controller],
        endpoint.label,
      );
      assert.deepEqual(controllerCalls[0].params, { id });
    }
  }
});

test("a customer cannot read or update ANOTHER customer's pet: 403, controller never reached", async () => {
  for (const make of [GET_ONE, PUT_ONE]) {
    const { call, controllerCalls } = setup();
    const endpoint = make(103); // belongs to customer 50
    const result = await call(
      endpoint.method,
      endpoint.path,
      "customer-token",
      petBody(30),
    );
    assert.equal(result.status, 403, endpoint.label);
    assert.deepEqual(result.body, FORBIDDEN_BODY, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

test("two customers cannot reach each other's pets", async () => {
  const t = setup();
  assert.equal((await t.call("GET", "/103", "customer-token")).status, 403); // customer 30 -> pet of 50
  assert.equal((await t.call("GET", "/103", "customer2-token")).status, 200); // customer 50 -> own pet
  assert.equal(
    (await t.call("PUT", "/101", "customer2-token", petBody(50))).status,
    403,
  );
  assert.equal(
    (await t.call("PUT", "/101", "customer-token", petBody(30))).status,
    200,
  );
});

test("nonexistent and malformed pet ids give a customer the same uniform 403 (never 400 or 404)", async () => {
  const ids = [
    "99999",
    "4294967295",
    "4294967296",
    "abc",
    "0",
    "-101",
    "1.5",
    "101.0",
    "0101",
    "101abc",
    "0x65",
    "+101",
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
        petBody(30),
      );
      assert.equal(result.status, 403, endpoint.label);
      assert.deepEqual(result.body, FORBIDDEN_BODY, endpoint.label);
      assert.equal(controllerCalls.length, 0, endpoint.label);
    }
  }
});

test("the 403 is identical for a pet that exists (someone else's) and one that does not", async () => {
  const { call } = setup();
  const existing = await call("GET", "/103", "customer-token");
  const missing = await call("GET", "/987654", "customer-token");
  assert.equal(existing.status, missing.status);
  assert.deepEqual(existing.body, missing.body);
});

test("a customer account with no profile is refused on every endpoint", async () => {
  for (const endpoint of [
    LIST,
    CREATE,
    GET_ONE(101),
    GET_ONE("abc"),
    PUT_ONE(101),
    PUT_ONE("0"),
  ]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "orphan-token",
      petBody(30),
    );
    assert.equal(result.status, 403, endpoint.label);
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

// ---------------------------------------------------------------------------
// 5. Customer: creating pets, and no transfers
// ---------------------------------------------------------------------------

test("a customer can create a pet for themselves", async () => {
  const { call, controllerCalls } = setup();
  const result = await call("POST", "/", "customer-token", petBody(30));
  assert.equal(result.status, 200);
  assert.deepEqual(controllerCalls[0].body, petBody(30));
});

test("a customer cannot create a pet for another customer: 403", async () => {
  for (const customerId of [50, "50", 1, 31]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      "POST",
      "/",
      "customer-token",
      petBody(customerId),
    );
    assert.equal(result.status, 403, String(customerId));
    assert.deepEqual(result.body, FORBIDDEN_BODY);
    assert.equal(controllerCalls.length, 0);
  }
});

test("a customer cannot transfer their pet to another owner: 403, even on their own pet", async () => {
  for (const newOwner of [50, "50", 1]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      "PUT",
      "/101",
      "customer-token",
      petBody(newOwner),
    );
    assert.equal(result.status, 403, String(newOwner));
    assert.deepEqual(result.body, FORBIDDEN_BODY);
    assert.equal(controllerCalls.length, 0);
  }
});

test("a customer cannot take someone else's pet by naming themselves as the new owner: 403 (not their pet)", async () => {
  const { call, controllerCalls } = setup();
  const result = await call("PUT", "/103", "customer-token", petBody(30)); // pet 103 belongs to 50
  assert.equal(result.status, 403);
  assert.equal(controllerCalls.length, 0);
});

test("a missing or invalid customerId from a customer reaches the controller, so the existing validator answers 400", async () => {
  for (const body of [
    { name: "Mochi" },
    { ...petBody(30), customerId: "abc" },
    { ...petBody(30), customerId: "" },
    { ...petBody(30), customerId: null },
    {},
  ]) {
    for (const endpoint of [CREATE, PUT_ONE(101)]) {
      const { call, controllerCalls } = setup();
      const result = await call(
        endpoint.method,
        endpoint.path,
        "customer-token",
        body,
      );
      assert.equal(
        result.status,
        200,
        `${endpoint.label} ${JSON.stringify(body)}`,
      ); // the fake controller answers; the real one validates
      assert.equal(
        controllerCalls.length,
        1,
        `${endpoint.label} ${JSON.stringify(body)}`,
      );
    }
  }
});

test("on PUT the pet-ownership check comes before the body check (not your pet = 403 either way)", async () => {
  const { call, lookups } = setup();
  const result = await call("PUT", "/103", "customer-token", {
    name: "no owner at all",
  });
  assert.equal(result.status, 403);
  assert.deepEqual(lookups, [103]);
});

// ---------------------------------------------------------------------------
// 6. The database decides the role and the profile, not the token or the request
// ---------------------------------------------------------------------------

test("a token that 'claims' admin or another customerId does not help: the database user is used", async () => {
  for (const endpoint of [GET_ONE(103), PUT_ONE(103)]) {
    const { call, controllerCalls } = setup();
    const result = await call(
      endpoint.method,
      endpoint.path,
      "claims-admin-token",
      petBody(50),
    );
    assert.equal(result.status, 403, endpoint.label); // user 3 is a customer owning profile 30
    assert.equal(controllerCalls.length, 0, endpoint.label);
  }
});

test("a customer cannot claim ownership through the request body, query or headers", async () => {
  const { router, controllerCalls } = setup();
  const result = await sendRequest(router, "PUT", "/103", {
    headers: { authorization: "Bearer customer-token", "x-customer-id": "50" },
    body: { ...petBody(50), id: 103, userId: 5, role: "admin" },
  });
  assert.equal(result.status, 403);
  assert.equal(controllerCalls.length, 0);
});

test("role changes in the database take effect immediately (same token)", async () => {
  const { call, users, controllerCalls } = setup();
  assert.equal((await call("GET", "/103", "customer-token")).status, 403);
  users[3].role = "staff"; // an admin promotes the user
  assert.equal((await call("GET", "/103", "customer-token")).status, 200);
  await call("GET", "/", "customer-token", undefined, {});
  assert.deepEqual(controllerCalls[controllerCalls.length - 1].query, {}); // staff list everything
  users[3].role = "customer"; // ...and demotes them again
  assert.equal((await call("GET", "/103", "customer-token")).status, 403);
});

test("if the pet's owner changes in the database (a staff transfer), access follows it immediately", async () => {
  const { call, owners } = setup();
  assert.equal((await call("GET", "/101", "customer-token")).status, 200);
  owners[101] = 50; // staff moved the pet to customer 50
  assert.equal((await call("GET", "/101", "customer-token")).status, 403);
  assert.equal((await call("GET", "/101", "customer2-token")).status, 200);
});

test("a database error while checking ownership is NOT an access grant: the request ends in an error, not in the controller", async () => {
  const failure = new Error("database is down");
  const { call, controllerCalls } = setup({ petLookupError: failure });
  const result = await call("GET", "/101", "customer-token");
  assert.equal(result.error, failure);
  assert.equal(controllerCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 7. Unsupported methods stay unsupported
// ---------------------------------------------------------------------------

test("DELETE and PATCH are not routes (an admin falls through to the 404 handler)", async () => {
  for (const [method, path] of [
    ["DELETE", "/101"],
    ["PATCH", "/101"],
    ["DELETE", "/"],
  ]) {
    const { call, controllerCalls } = setup();
    const result = await call(method, path, "admin-token");
    assert.equal(result.fellThrough, true, `${method} ${path}`);
    assert.equal(controllerCalls.length, 0, `${method} ${path}`);
  }
});
