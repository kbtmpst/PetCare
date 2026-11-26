// Tests for the "own pet" middleware (no Express, no MySQL: fake req/res objects and a FAKE pet lookup).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequireOwnPetOrRole } from "../src/middleware/createRequireOwnPetOrRole.js";

// A fake pets table: pet id -> owner (customer id). Pets 101 and 102 belong to customer 30, pet 103 to customer 50.
function setup({ lookupError = null } = {}) {
  const owners = { 101: 30, 102: 30, 103: 50 };
  const lookups = [];
  const findPetOwnerId = async (petId) => {
    lookups.push(petId);
    if (lookupError) throw lookupError;
    return owners[petId] ?? null;
  };
  return {
    lookups,
    middleware: createRequireOwnPetOrRole({ findPetOwnerId })("admin", "staff"),
    factory: createRequireOwnPetOrRole({ findPetOwnerId }),
  };
}

// Runs the middleware once and waits until it answers or calls next().
async function run(middleware, user, id) {
  const outcome = { status: null, body: null, nextCalled: false, error: null };
  const req = { user, params: { id } };
  const res = {
    status(code) {
      outcome.status = code;
      return this;
    },
    json(body) {
      outcome.body = body;
      return this;
    },
  };
  await new Promise((resolve) => {
    middleware(req, res, (error) => {
      outcome.nextCalled = !error;
      outcome.error = error ?? null;
      resolve();
    });
    // answered without next(): wait a tick so async handlers can finish
    setTimeout(resolve, 20);
  });
  return outcome;
}

const customer = (customerId) => ({ id: 3, role: "customer", customerId });
const FORBIDDEN = {
  status: "error",
  message: "You do not have permission to do this.",
};

test("setup: a typo or an empty list throws when the route is set up", () => {
  const { factory } = setup();
  assert.throws(() => factory(), /needs one or more of/);
  assert.throws(() => factory("amdin"), /needs one or more of/);
  assert.throws(() => factory("admin", "owner"), /needs one or more of/);
});

test("no logged-in user: 401, and no database lookup", async () => {
  const { middleware, lookups } = setup();
  const result = await run(middleware, undefined, "101");
  assert.equal(result.status, 401);
  assert.equal(result.body.message, "Authentication required. Please log in.");
  assert.equal(result.nextCalled, false);
  assert.equal(lookups.length, 0);
});

test("admin and staff pass for any id with NO database lookup (the controller keeps its 400/404)", async () => {
  for (const role of ["admin", "staff"]) {
    for (const id of ["101", "999999", "abc", "0", "-1", "1.5", ""]) {
      const { middleware, lookups } = setup();
      const result = await run(
        middleware,
        { id: 1, role, customerId: null },
        id,
      );
      assert.equal(result.nextCalled, true, `${role} ${id}`);
      assert.equal(result.status, null, `${role} ${id}`);
      assert.equal(lookups.length, 0, `${role} ${id}`);
    }
  }
});

test("a customer passes on a pet they own (looked up through the pet's owner)", async () => {
  for (const id of ["101", "102"]) {
    const { middleware, lookups } = setup();
    const result = await run(middleware, customer(30), id);
    assert.equal(result.nextCalled, true, id);
    assert.deepEqual(lookups, [Number(id)], id);
  }
});

test("a customer gets 403 on a pet that belongs to someone else", async () => {
  const { middleware } = setup();
  const result = await run(middleware, customer(30), "103"); // owned by customer 50
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, FORBIDDEN);
  assert.equal(result.nextCalled, false);
  assert.equal((await run(middleware, customer(50), "101")).status, 403); // and the other way round
});

test("a customer gets the SAME 403 for nonexistent pets (nothing is revealed)", async () => {
  const { middleware } = setup();
  const existing = await run(middleware, customer(30), "103"); // exists, not theirs
  const missing = await run(middleware, customer(30), "99999"); // does not exist
  assert.equal(missing.status, 403);
  assert.deepEqual(missing.body, existing.body);
  assert.equal(missing.nextCalled, false);
});

test("a customer gets the same 403 for malformed ids, and no database lookup happens", async () => {
  const ids = [
    "abc",
    "0",
    "-101",
    "1.5",
    "101.0",
    "0101",
    " 101",
    "101 ",
    "101abc",
    "0x65",
    "+101",
    "",
    "null",
    "undefined",
    "NaN",
    "4294967296",
  ];
  for (const id of ids) {
    const { middleware, lookups } = setup();
    const result = await run(middleware, customer(30), id);
    assert.equal(result.status, 403, JSON.stringify(id));
    assert.deepEqual(result.body, FORBIDDEN, JSON.stringify(id));
    assert.equal(result.nextCalled, false, JSON.stringify(id));
    assert.equal(lookups.length, 0, JSON.stringify(id));
  }
});

test("a missing id parameter is refused for a customer", async () => {
  for (const params of [{}, { id: undefined }, { id: null }]) {
    const { middleware } = setup();
    const outcome = { status: null, nextCalled: false };
    const res = {
      status(c) {
        outcome.status = c;
        return this;
      },
      json() {
        return this;
      },
    };
    middleware(
      { user: customer(30), params },
      res,
      () => (outcome.nextCalled = true),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(outcome.status, 403);
    assert.equal(outcome.nextCalled, false);
  }
});

test("a customer account with no customer profile is refused, with no lookup", async () => {
  for (const customerId of [null, undefined, 0, -1, "30", 30.5, NaN]) {
    const { middleware, lookups } = setup();
    const result = await run(middleware, customer(customerId), "101");
    assert.equal(result.status, 403, String(customerId));
    assert.equal(result.nextCalled, false, String(customerId));
    assert.equal(lookups.length, 0, String(customerId));
  }
});

test("an unknown or missing role is refused", async () => {
  for (const role of ["owner", "", undefined, null, "ADMIN"]) {
    const { middleware } = setup();
    const result = await run(
      middleware,
      { id: 9, role, customerId: 30 },
      "101",
    );
    assert.equal(result.status, 403, String(role));
    assert.equal(result.nextCalled, false, String(role));
  }
});

test("only the roles you list get full access (admin-only list: staff is refused on a pet it does not own)", async () => {
  const { factory } = setup();
  const adminOnly = factory("admin");
  assert.equal(
    (await run(adminOnly, { role: "admin", customerId: null }, "101"))
      .nextCalled,
    true,
  );
  assert.equal(
    (await run(adminOnly, { role: "staff", customerId: null }, "101")).status,
    403,
  );
});

test("a database error in the pet lookup goes to next(error) and NEVER grants access", async () => {
  const failure = new Error("database is down");
  const { middleware } = setup({ lookupError: failure });
  const result = await run(middleware, customer(30), "101");
  assert.equal(result.error, failure);
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, null);
});

test("the middleware does not change req.params or req.user", async () => {
  const { middleware } = setup();
  const user = customer(30);
  const req = { user, params: { id: "101" } };
  await new Promise((resolve) =>
    middleware(
      req,
      {
        status() {
          return this;
        },
        json() {
          return this;
        },
      },
      resolve,
    ),
  );
  assert.deepEqual(req.params, { id: "101" });
  assert.equal(req.user, user);
});
