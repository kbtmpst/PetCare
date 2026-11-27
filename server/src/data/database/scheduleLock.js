// DATA LAYER: stops two people from booking overlapping appointments at the same moment.
//
// THE PROBLEM: "check that the time is free, then insert" is two steps. If two requests do the check at the
// same moment, both see "free" and both insert, so the shop is double-booked. The shop has ONE groomer, so
// every booking and every reschedule competes for the same schedule.
//
// THE FIX: one named MySQL lock (GET_LOCK) that the whole shop shares. Only one request at a time can hold it,
// the others wait (up to LOCK_TIMEOUT_SECONDS). The order is what makes it work:
//
//   1. GET_LOCK        wait for our turn
//   2. BEGIN           start the transaction (so its first read happens AFTER the previous holder committed)
//   3. work(...)       check for a conflict, then insert / update
//   4. COMMIT          (or ROLLBACK if something threw)
//   5. RELEASE_LOCK    only now can the next request start, and it will see what we saved
//   6. give the connection back to the pool
//
// A GET_LOCK belongs to ONE database connection, so every step above runs on the SAME connection.
// If the lock cannot be released (a broken connection) the connection is destroyed instead of being
// reused, because MySQL frees the lock when the connection closes.
//
// "pool" is handed in so the tests can use a fake (no MySQL). repositories import the real pool.
import { withTransaction } from "./transaction.js";

export const SCHEDULE_LOCK_NAME = "petcare_appointment_schedule";
export const LOCK_TIMEOUT_SECONDS = 10;

// The error thrown when the lock could not be taken in time. The business service turns it into a 409.
export function createLockTimeoutError() {
  const error = new Error(
    "The appointment schedule is busy. Please try again.",
  );
  error.code = "SCHEDULE_LOCK_TIMEOUT";
  return error;
}

// work(connection) runs inside the lock AND inside a transaction. Returns whatever work returns.
export async function withScheduleLock(pool, work) {
  const connection = await pool.getConnection();
  let hasLock = false;
  let lockReleaseFailed = false;

  try {
    const [rows] = await connection.query("SELECT GET_LOCK(?, ?) AS got_lock", [
      SCHEDULE_LOCK_NAME,
      LOCK_TIMEOUT_SECONDS,
    ]);
    // GET_LOCK answers 1 (got it), 0 (timed out) or NULL (error).
    if (Number(rows[0].got_lock) !== 1) throw createLockTimeoutError();
    hasLock = true;

    // withTransaction expects a pool. This tiny "pool" lends out the connection that already holds the lock,
    // and its release does nothing (we give the connection back ourselves, AFTER the lock is released).
    const sameConnectionPool = {
      getConnection: async () => ({
        beginTransaction: () => connection.beginTransaction(),
        commit: () => connection.commit(),
        rollback: () => connection.rollback(),
        query: (...args) => connection.query(...args),
        release: () => {},
      }),
    };
    return await withTransaction(sameConnectionPool, work);
  } finally {
    if (hasLock) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [SCHEDULE_LOCK_NAME]);
      } catch (releaseError) {
        lockReleaseFailed = true;
        console.error("Could not release the schedule lock:", releaseError);
      }
    }
    if (lockReleaseFailed)
      connection.destroy(); // closing the connection frees the lock
    else connection.release();
  }
}
