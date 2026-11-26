// Tests for the requireRole middleware, using fake request/response objects. No database, no Express.
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireRole } from "../src/middleware/requireRole.js";

// Runs a middleware once and reports what it did.
function run(middleware, req) {
  const outcome = { nextCalled: false, status: null, body: null };
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

test("an allowed role passes", () => {
  const outcome = run(requireRole("admin"), { user: { role: "admin" } });
  assert.equal(outcome.nextCalled, true);
  assert.equal(outcome.status, null);
});

test("a role that is not allowed gets 403", () => {
  const outcome = run(requireRole("admin"), { user: { role: "staff" } });
  assert.equal(outcome.nextCalled, false);
  assert.equal(outcome.status, 403);
  assert.deepEqual(outcome.body, {
    status: "error",
    message: "You do not have permission to do this.",
  });
});

test("several roles can be allowed", () => {
  const middleware = requireRole("admin", "staff");
  assert.equal(run(middleware, { user: { role: "admin" } }).nextCalled, true);
  assert.equal(run(middleware, { user: { role: "staff" } }).nextCalled, true);
  const customer = run(middleware, { user: { role: "customer" } });
  assert.equal(customer.nextCalled, false);
  assert.equal(customer.status, 403);
});

test("no logged-in user gets 401 (not 403)", () => {
  const outcome = run(requireRole("admin"), {});
  assert.equal(outcome.nextCalled, false);
  assert.equal(outcome.status, 401);
});

test("an unknown or missing role in req.user is refused", () => {
  assert.equal(
    run(requireRole("admin"), { user: { role: "superuser" } }).status,
    403,
  );
  assert.equal(run(requireRole("admin"), { user: {} }).status, 403);
});

test("role names are case-sensitive", () => {
  assert.equal(
    run(requireRole("admin"), { user: { role: "Admin" } }).status,
    403,
  );
});

test("a mistake in the route setup fails loudly", () => {
  assert.throws(() => requireRole(), /requireRole needs/);
  assert.throws(() => requireRole("amdin"), /requireRole needs/);
  assert.throws(() => requireRole("admin", "manager"), /requireRole needs/);
});
