// Tests for the "own customer profile" middleware (no Express, no MySQL: fake req/res objects).
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireOwnCustomerOrRole } from "../src/middleware/requireOwnCustomerOrRole.js";

// Runs the middleware once. Returns { status, body, nextCalled }.
function run(middleware, user, id) {
  const outcome = { status: null, body: null, nextCalled: false };
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
  middleware(req, res, () => {
    outcome.nextCalled = true;
  });
  return outcome;
}

const middleware = requireOwnCustomerOrRole("admin", "staff");
const customer = (customerId) => ({ id: 3, role: "customer", customerId });
const FORBIDDEN = {
  status: "error",
  message: "You do not have permission to do this.",
};

test("setup: a typo or an empty list throws when the route is set up", () => {
  assert.throws(() => requireOwnCustomerOrRole(), /needs one or more of/);
  assert.throws(
    () => requireOwnCustomerOrRole("amdin"),
    /needs one or more of/,
  );
  assert.throws(
    () => requireOwnCustomerOrRole("admin", "owner"),
    /needs one or more of/,
  );
});

test("no logged-in user: 401", () => {
  const result = run(middleware, undefined, "5");
  assert.equal(result.status, 401);
  assert.equal(result.body.message, "Authentication required. Please log in.");
  assert.equal(result.nextCalled, false);
});

test("admin and staff pass for any id, even ones the controller will later reject", () => {
  for (const role of ["admin", "staff"]) {
    for (const id of ["1", "999999", "abc", "0", "-1", "1.5", ""]) {
      const result = run(middleware, { id: 1, role, customerId: null }, id);
      assert.equal(result.nextCalled, true, `${role} ${id}`);
      assert.equal(result.status, null, `${role} ${id}`);
    }
  }
});

test("a customer passes on their own id", () => {
  const result = run(middleware, customer(30), "30");
  assert.equal(result.nextCalled, true);
  assert.equal(result.status, null);
});

test("a customer gets 403 on another customer's id", () => {
  for (const id of ["1", "29", "31", "300", "3"]) {
    const result = run(middleware, customer(30), id);
    assert.equal(result.status, 403, id);
    assert.deepEqual(result.body, FORBIDDEN, id);
    assert.equal(result.nextCalled, false, id);
  }
});

test("a customer gets the SAME 403 for nonexistent and malformed ids (nothing is revealed)", () => {
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
    " 30",
    "30 ",
    "30abc",
    "0x1E",   
    "3e1",
 "+30",
    "",
    "null",
    "undefined",
    "NaN",
    "30\n",
  ];
  for (const id of ids) {
    const result = run(middleware, customer(30), id);
    assert.equal(result.status, 403, JSON.stringify(id));
    assert.deepEqual(result.body, FORBIDDEN, JSON.stringify(id));
    assert.equal(result.nextCalled, false, JSON.stringify(id));
  }
});

test("a missing id parameter is refused for a customer", () => {
  for (const params of [{}, { id: undefined }, { id: null }]) {
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
    assert.equal(outcome.status, 403);
    assert.equal(outcome.nextCalled, false);
  }
});

test("a customer account with no customer profile (customerId null/undefined/odd) is refused on every id", () => {
  for (const customerId of [null, undefined, 0, -1, "30", 30.5, NaN]) {
    for (const id of ["30", "0", "1", "null", "undefined", "NaN", ""]) {
      const result = run(middleware, customer(customerId), id);
      assert.equal(result.status, 403, `${String(customerId)} / ${id}`);
      assert.equal(result.nextCalled, false, `${String(customerId)} / ${id}`);
    }
  }
});

test("an unknown or missing role is refused, and a role list without 'customer' never lets customers in by id", () => {
  for (const role of ["owner", "", undefined, null, "ADMIN"]) {
    const result = run(middleware, { id: 9, role, customerId: 30 }, "30");
    assert.equal(result.status, 403, String(role));
    assert.equal(result.nextCalled, false, String(role));
  }
});

test("only the roles you list get full access (staff-less list: staff is refused)", () => {
  const adminOnly = requireOwnCustomerOrRole("admin");
  assert.equal(
    run(adminOnly, { role: "admin", customerId: null }, "7").nextCalled,
    true,
  );
  assert.equal(
    run(adminOnly, { role: "staff", customerId: null }, "7").status,
    403,
  );
});

test("the middleware does not change req.params or req.user", () => {
  const user = customer(30);
  const req = { user, params: { id: "30" } };
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
    () => {},
  );
  assert.deepEqual(req.params, { id: "30" });
  assert.equal(req.user, user);
});
