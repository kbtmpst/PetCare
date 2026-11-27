// Tests for the schedule lock helper, using a FAKE pool and connection (no MySQL).
// They prove the ORDER of the steps (lock, begin, work, commit, release the lock, give the connection back) and the
// error handling. They do NOT prove that MySQL's GET_LOCK really makes two requests wait: that needs the real database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withScheduleLock,
  SCHEDULE_LOCK_NAME,
  LOCK_TIMEOUT_SECONDS,
} from "../src/data/database/scheduleLock.js";

function fakePool({
  lockAnswer = 1,
  releaseFails = false,
  rollbackFails = false,
  beginFails = false,
} = {}) {
  const log = [];
  const connection = {
    query: async (sql, params) => {
      if (sql.includes("GET_LOCK")) {
        log.push(`get_lock:${params[0]}:${params[1]}`);
        return [[{ got_lock: lockAnswer }]];
      }
      if (sql.includes("RELEASE_LOCK")) {
        log.push(`release_lock:${params[0]}`);
        if (releaseFails) throw new Error("connection lost");
        return [[{ released: 1 }]];
      }
      log.push(`query:${sql}`);
      return [[]];
    },
    beginTransaction: async () => {
      log.push("begin");
      if (beginFails) throw new Error("cannot begin");
    },
    commit: async () => log.push("commit"),
    rollback: async () => {
      log.push("rollback");
      if (rollbackFails) throw new Error("rollback failed");
    },
    release: () => log.push("connection_release"),
    destroy: () => log.push("connection_destroy"),
  };
  return { log, connection, pool: { getConnection: async () => connection } };
}

test("success: lock, begin, work, commit, release the lock, then give the connection back", async () => {
  const { pool, log } = fakePool();
  const result = await withScheduleLock(pool, async (connection) => {
    await connection.query("INSERT appointment");
    return { saved: true };
  });
  assert.deepEqual(result, { saved: true });
  assert.deepEqual(log, [
    `get_lock:${SCHEDULE_LOCK_NAME}:${LOCK_TIMEOUT_SECONDS}`,
    "begin",
    "query:INSERT appointment",
    "commit",
    `release_lock:${SCHEDULE_LOCK_NAME}`,
    "connection_release",
  ]);
});

test("the lock is released only AFTER the commit (so the next request sees the saved booking)", async () => {
  const { pool, log } = fakePool();
  await withScheduleLock(pool, async () => {});
  assert.ok(
    log.indexOf("commit") < log.indexOf(`release_lock:${SCHEDULE_LOCK_NAME}`),
  );
  assert.ok(
    log.indexOf("get_lock:" + SCHEDULE_LOCK_NAME + ":" + LOCK_TIMEOUT_SECONDS) <
      log.indexOf("begin"),
  );
});

test("the connection is given back exactly once (the inner transaction helper does not release it early)", async () => {
  const { pool, log } = fakePool();
  await withScheduleLock(pool, async () => {});
  assert.equal(log.filter((entry) => entry === "connection_release").length, 1);
  assert.equal(log[log.length - 1], "connection_release");
});

test("the work uses the SAME connection that holds the lock", async () => {
  const { pool, connection } = fakePool();
  let seen = null;
  await withScheduleLock(pool, async (c) => {
    seen = c;
  });
  // the work receives a wrapper around the lock's connection: a query on it reaches that connection
  const queries = [];
  const original = connection.query;
  connection.query = async (...args) => {
    queries.push(args[0]);
    return original(...args);
  };
  await withScheduleLock(pool, async (c) => c.query("SELECT 1"));
  assert.ok(queries.includes("SELECT 1"));
  assert.equal(typeof seen.query, "function");
});

test("if the work throws: rollback, THEN release the lock, then give the connection back, and the error is re-thrown", async () => {
  const { pool, log } = fakePool();
  const failure = new Error("insert failed");
  await assert.rejects(
    withScheduleLock(pool, async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.deepEqual(log, [
    `get_lock:${SCHEDULE_LOCK_NAME}:${LOCK_TIMEOUT_SECONDS}`,
    "begin",
    "rollback",
    `release_lock:${SCHEDULE_LOCK_NAME}`,
    "connection_release",
  ]);
  assert.ok(!log.includes("commit"));
});

test("a lock timeout (GET_LOCK answers 0 or NULL): no transaction, no work, error code SCHEDULE_LOCK_TIMEOUT, connection given back", async () => {
  for (const lockAnswer of [0, null, "0", "abc"]) {
    const { pool, log } = fakePool({ lockAnswer });
    let workRan = false;
    await assert.rejects(
      withScheduleLock(pool, async () => {
        workRan = true;
      }),
      (error) => error.code === "SCHEDULE_LOCK_TIMEOUT",
    );
    assert.equal(workRan, false, String(lockAnswer));
    assert.ok(!log.includes("begin"), String(lockAnswer));
    assert.ok(
      !log.some((entry) => entry.startsWith("release_lock")),
      String(lockAnswer),
    ); // we never held it
    assert.deepEqual(log.slice(-1), ["connection_release"], String(lockAnswer));
  }
});

test("the lock answer 1 (as a number or text) means we hold it", async () => {
  for (const lockAnswer of [1, "1"]) {
    const { pool, log } = fakePool({ lockAnswer });
    await withScheduleLock(pool, async () => {});
    assert.ok(log.includes("commit"), String(lockAnswer));
  }
});

test("if the lock cannot be released, the connection is destroyed (closing it frees the lock), not reused", async () => {
  const { pool, log } = fakePool({ releaseFails: true });
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await withScheduleLock(pool, async () => "done");
    assert.equal(result, "done"); // the work was already committed
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(log.includes("connection_destroy"));
  assert.ok(!log.includes("connection_release"));
});

test("if the transaction cannot begin, the lock is still released and the connection given back", async () => {
  const { pool, log } = fakePool({ beginFails: true });
  await assert.rejects(
    withScheduleLock(pool, async () => {}),
    /cannot begin/,
  );
  assert.ok(log.includes(`release_lock:${SCHEDULE_LOCK_NAME}`));
  assert.equal(log[log.length - 1], "connection_release");
});

test("the original error is kept even when the rollback fails, and the lock is still released", async () => {
  const { pool, log } = fakePool({ rollbackFails: true });
  const failure = new Error("original problem");
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      withScheduleLock(pool, async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(log.includes(`release_lock:${SCHEDULE_LOCK_NAME}`));
});

test("the lock name is short enough for MySQL (64 characters at most) and the wait is limited", () => {
  assert.ok(SCHEDULE_LOCK_NAME.length <= 64);
  assert.ok(LOCK_TIMEOUT_SECONDS > 0 && LOCK_TIMEOUT_SECONDS <= 60);
});
