// Tests for the middleware that keeps a customer inside their own pets (list filter and owner in the body).
// No Express, no MySQL: fake req/res objects.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scopePetListToOwner,
  requireOwnerInBody,
} from "../src/middleware/scopePetsToOwner.js";

function run(middleware, req) {
  const outcome = { status: null, body: null, nextCalled: false };
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
  middleware(req, res, () => {
    outcome.nextCalled = true;
  });
  return outcome;
}

const customer = (customerId) => ({ id: 3, role: "customer", customerId });
const FORBIDDEN = {
  status: "error",
  message: "You do not have permission to do this.",
};

// ---------------------------------------------------------------------------
// scopePetListToOwner (GET /api/pets)
// ---------------------------------------------------------------------------

test("setup: both middleware throw on a typo or an empty role list", () => {
  for (const make of [scopePetListToOwner, requireOwnerInBody]) {
    assert.throws(() => make(), /needs one or more of/);
    assert.throws(() => make("amdin"), /needs one or more of/);
  }
});

test("list: no logged-in user gets 401", () => {
  const result = run(scopePetListToOwner("admin", "staff"), { query: {} });
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
});

test("list: admin and staff keep their query exactly as it was (any ?customerId, or none)", () => {
  for (const role of ["admin", "staff"]) {
    for (const query of [
      {},
      { customerId: "50" },
      { customerId: "abc" },
      { search: "mo" },
    ]) {
      const original = { ...query };
      const req = { user: { role, customerId: null }, query };
      const result = run(scopePetListToOwner("admin", "staff"), req);
      assert.equal(result.nextCalled, true);
      assert.equal(req.query, query); // the very same object, untouched
      assert.deepEqual(req.query, original);
    }
  }
});

test("list: a customer's ?customerId is forced to their own id", () => {
  const req = { user: customer(30), query: {} };
  assert.equal(
    run(scopePetListToOwner("admin", "staff"), req).nextCalled,
    true,
  );
  assert.deepEqual(req.query, { customerId: "30" });
});

test("list: a customer asking for ANOTHER owner's pets gets their own list instead (the value is replaced)", () => {
  for (const asked of ["50", "1", "abc", "0", "30abc", "-5"]) {
    const req = { user: customer(30), query: { customerId: asked } };
    const result = run(scopePetListToOwner("admin", "staff"), req);
    assert.equal(result.nextCalled, true, asked);
    assert.equal(req.query.customerId, "30", asked);
  }
});

test("list: other query values such as ?search= are kept", () => {
  const req = {
    user: customer(30),
    query: { customerId: "50", search: "mochi" },
  };
  run(scopePetListToOwner("admin", "staff"), req);
  assert.deepEqual(req.query, { customerId: "30", search: "mochi" });
});

test("list: tricks such as an array or object customerId are replaced too", () => {
  for (const asked of [["50", "30"], { $ne: 1 }, ["30"]]) {
    const req = { user: customer(30), query: { customerId: asked } };
    run(scopePetListToOwner("admin", "staff"), req);
    assert.equal(req.query.customerId, "30");
  }
});

test("list: works when req.query is a read-only getter on the prototype (like Express 5)", () => {
  const proto = {
    get query() {
      return { customerId: "50", search: "mo" }; // a fresh object every time; assigning to it would be lost
    },
  };
  const req = Object.create(proto);
  req.user = customer(30);
  const result = run(scopePetListToOwner("admin", "staff"), req);
  assert.equal(result.nextCalled, true);
  assert.deepEqual(req.query, { customerId: "30", search: "mo" });
  assert.deepEqual(req.query, req.query); // and it stays that way on every read
});

test("list: a customer with no customer profile gets 403", () => {
  for (const customerId of [null, undefined, 0, "30", 30.5, NaN]) {
    const req = { user: customer(customerId), query: {} };
    const result = run(scopePetListToOwner("admin", "staff"), req);
    assert.equal(result.status, 403, String(customerId));
    assert.deepEqual(result.body, FORBIDDEN);
    assert.equal(result.nextCalled, false);
  }
});

test("list: an unknown role gets 403", () => {
  const result = run(scopePetListToOwner("admin", "staff"), {
    user: { role: "owner", customerId: 30 },
    query: {},
  });
  assert.equal(result.status, 403);
});

// ---------------------------------------------------------------------------
// requireOwnerInBody (POST /api/pets and PUT /api/pets/:id)
// ---------------------------------------------------------------------------

test("body: no logged-in user gets 401", () => {
  const result = run(requireOwnerInBody("admin", "staff"), {
    body: { customerId: 30 },
  });
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
});

test("body: admin and staff may name any owner, or none (the validator answers later)", () => {
  for (const role of ["admin", "staff"]) {
    for (const body of [
      { customerId: 50 },
      { customerId: "50" },
      { customerId: "abc" },
      {},
      undefined,
    ]) {
      const result = run(requireOwnerInBody("admin", "staff"), {
        user: { role, customerId: null },
        body,
      });
      assert.equal(result.nextCalled, true);
      assert.equal(result.status, null);
    }
  }
});

test("body: a customer may name themselves (number or text)", () => {
  for (const customerId of [30, "30"]) {
    const result = run(requireOwnerInBody("admin", "staff"), {
      user: customer(30),
      body: { customerId, name: "Mochi" },
    });
    assert.equal(result.nextCalled, true, String(customerId));
  }
});

test("body: a customer naming ANOTHER valid owner gets 403 (no planting pets, no giving a pet away)", () => {
  for (const customerId of [50, "50", 1, "1", 31, "4294967295"]) {
    const result = run(requireOwnerInBody("admin", "staff"), {
      user: customer(30),
      body: { customerId },
    });
    assert.equal(result.status, 403, String(customerId));
    assert.deepEqual(result.body, FORBIDDEN);
    assert.equal(result.nextCalled, false);
  }
});

test("body: a missing or invalid customerId is passed on, so the existing validator gives its normal 400", () => {
  for (const body of [
    {},
    undefined,
    null,
    { customerId: undefined },
    { customerId: null },
    { customerId: "" },
    { customerId: "abc" },
    { customerId: 0 },
    { customerId: -3 },
    { customerId: 1.5 },
    { customerId: true },
    { customerId: [30] },
    { customerId: {} },
    "text",
  ]) {
    const result = run(requireOwnerInBody("admin", "staff"), {
      user: customer(30),
      body,
    });
    assert.equal(result.nextCalled, true, JSON.stringify(body));
    assert.equal(result.status, null, JSON.stringify(body));
  }
});

test("body: a customer with no customer profile gets 403 even with a valid-looking body", () => {
  for (const customerId of [null, undefined, 0, "30", 30.5, NaN]) {
    const result = run(requireOwnerInBody("admin", "staff"), {
      user: customer(customerId),
      body: { customerId: 30 },
    });
    assert.equal(result.status, 403, String(customerId));
    assert.equal(result.nextCalled, false);
  }
});

test("body: the middleware never changes the body", () => {
  const body = { customerId: 30, name: "Mochi" };
  const req = { user: customer(30), body };
  run(requireOwnerInBody("admin", "staff"), req);
  assert.equal(req.body, body);
  assert.deepEqual(req.body, { customerId: 30, name: "Mochi" });
});
