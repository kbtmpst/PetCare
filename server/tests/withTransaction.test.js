// Tests for the transaction helper, using a FAKE pool and connection (no MySQL).
// They prove the commit / rollback / release logic. They do not prove MySQL behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withTransaction } from "../src/data/database/transaction.js";

function fakePool({ rollbackFails = false } = {}) {
  const log = [];
  const connection = {
    beginTransaction: async () => log.push("begin"),
    commit: async () => log.push("commit"),
    rollback: async () => {
      log.push("rollback");
      if (rollbackFails) throw new Error("rollback failed");
    },
    release: () => log.push("release"),
    query: async (sql) => log.push(`query:${sql}`),
  };
  return { log, pool: { getConnection: async () => connection } };
}

test("success: begin, queries, commit, release (no rollback)", async () => {
  const { pool, log } = fakePool();
  const result = await withTransaction(pool, async (connection) => {
    await connection.query("INSERT users");
    await connection.query("INSERT customers");
    return { done: true };
  });
  assert.deepEqual(result, { done: true });
  assert.deepEqual(log, [
    "begin",
    "query:INSERT users",
    "query:INSERT customers",
    "commit",
    "release",
  ]);
});

test("if the second insert fails, everything is rolled back and the error is re-thrown", async () => {
  const { pool, log } = fakePool();
  const failure = Object.assign(new Error("customers insert failed"), {
    code: "ER_BAD_FIELD_ERROR",
  });
  await assert.rejects(
    withTransaction(pool, async (connection) => {
      await connection.query("INSERT users");
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.deepEqual(log, ["begin", "query:INSERT users", "rollback", "release"]);
  assert.ok(!log.includes("commit"));
});

test("the original error is kept even when the rollback itself fails", async () => {
  const { pool, log } = fakePool({ rollbackFails: true });
  const failure = new Error("original problem");
  const originalConsoleError = console.error;
  console.error = () => {}; // hide the expected "Rollback failed" message
  try {
    await assert.rejects(
      withTransaction(pool, async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(log.includes("rollback"));
  assert.ok(log.includes("release"));
});

test("the connection is released even when it cannot begin", async () => {
  const log = [];
  const connection = {
    beginTransaction: async () => {
      throw new Error("cannot begin");
    },
    rollback: async () => log.push("rollback"),
    release: () => log.push("release"),
  };
  await assert.rejects(
    withTransaction({ getConnection: async () => connection }, async () => {}),
    /cannot begin/,
  );
  assert.ok(log.includes("release"));
});
