// Tests for the authenticate middleware logic. The token check and the database lookup are FAKES here,
// so this checks the middleware's decisions only (not real JWT signing, not real MySQL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthenticate } from "../src/middleware/createAuthenticate.js";

const activeUser = {
  id: 7,
  email: "a@b.com",
  role: "staff",
  fullName: "A",
  active: true,
  customerId: null,
};

// Builds the middleware with fake dependencies and records what they were called with.
function setup({
  tokenResult = { ok: true, userId: 7 },
  user = activeUser,
  lookupError = null,
} = {}) {
  const calls = { verified: [], lookedUp: [] };
  const middleware = createAuthenticate({
    verifyToken: (token) => {
      calls.verified.push(token);
      return tokenResult;
    },
    findUserById: async (id) => {
      calls.lookedUp.push(id);
      if (lookupError) throw lookupError;
      return user;
    },
  });
  return { middleware, calls };
}

// Runs the middleware once and waits until it has either answered or called next().
function run(middleware, headers) {
  return new Promise((resolve) => {
    const req = { headers };
    const res = {
      statusCode: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({
          req,
          status: this.statusCode,
          body,
          nextCalled: false,
          error: null,
        });
        return this;
      },
    };
    middleware(req, res, (error) =>
      resolve({
        req,
        status: null,
        body: null,
        nextCalled: !error,
        error: error ?? null,
      }),
    );
  });
}

test("a good token loads the user into req.user and continues", async () => {
  const { middleware, calls } = setup();
  const outcome = await run(middleware, {
    authorization: "Bearer good.token.here",
  });
  assert.equal(outcome.nextCalled, true);
  assert.deepEqual(outcome.req.user, activeUser);
  assert.deepEqual(calls.verified, ["good.token.here"]);
  assert.deepEqual(calls.lookedUp, [7]);
});

test("'Bearer' is accepted in any letter case", async () => {
  const { middleware } = setup();
  assert.equal(
    (await run(middleware, { authorization: "bearer abc" })).nextCalled,
    true,
  );
  assert.equal(
    (await run(middleware, { authorization: "BEARER abc" })).nextCalled,
    true,
  );
});

test("a missing or malformed Authorization header gets 401 and nothing is checked", async () => {
  for (const headers of [
    {},
    { authorization: "" },
    { authorization: "Bearer" },
    { authorization: "Bearer " },
    { authorization: "Basic dXNlcjpwYXNz" },
    { authorization: "abc.def.ghi" },
    { authorization: "Bearer two tokens" },
  ]) {
    const { middleware, calls } = setup();
    const outcome = await run(middleware, headers);
    assert.equal(outcome.status, 401, JSON.stringify(headers));
    assert.equal(
      outcome.body.message,
      "Authentication required. Please log in.",
    );
    assert.equal(outcome.nextCalled, false);
    assert.equal(calls.verified.length, 0);
    assert.equal(calls.lookedUp.length, 0);
  }
});

test("an expired token gets 401 with a clear message", async () => {
  const { middleware, calls } = setup({
    tokenResult: { ok: false, reason: "expired" },
  });
  const outcome = await run(middleware, { authorization: "Bearer old" });
  assert.equal(outcome.status, 401);
  assert.equal(
    outcome.body.message,
    "Your session has expired. Please log in again.",
  );
  assert.equal(calls.lookedUp.length, 0);
});

test("an invalid token gets 401", async () => {
  const { middleware } = setup({
    tokenResult: { ok: false, reason: "invalid" },
  });
  const outcome = await run(middleware, { authorization: "Bearer forged" });
  assert.equal(outcome.status, 401);
  assert.equal(
    outcome.body.message,
    "Invalid login token. Please log in again.",
  );
});

test("a token for a user that no longer exists gets 401", async () => {
  const { middleware } = setup({ user: null });
  const outcome = await run(middleware, { authorization: "Bearer good" });
  assert.equal(outcome.status, 401);
  assert.equal(outcome.nextCalled, false);
});

test("a deactivated account is blocked right away with 403, even with a valid token", async () => {
  const { middleware } = setup({ user: { ...activeUser, active: false } });
  const outcome = await run(middleware, { authorization: "Bearer good" });
  assert.equal(outcome.status, 403);
  assert.equal(outcome.nextCalled, false);
  assert.equal(outcome.req.user, undefined);
});

test("the role comes from the database, never from the token", async () => {
  const { middleware } = setup({ user: { ...activeUser, role: "customer" } });
  const outcome = await run(middleware, { authorization: "Bearer good" });
  assert.equal(outcome.req.user.role, "customer");
});

test("a database error is passed to the error handler (not swallowed, not a crash)", async () => {
  const boom = new Error("database down");
  const { middleware } = setup({ lookupError: boom });
  const outcome = await run(middleware, { authorization: "Bearer good" });
  assert.equal(outcome.error, boom);
  assert.equal(outcome.status, null);
});
