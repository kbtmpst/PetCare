// Tests for the payment-record SQL helper, using a FAKE connection (no MySQL).
// They prove the SQL text and the parameters. They do not prove MySQL accepts the statement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPendingTransaction } from "../src/data/repositories/transactionRepository.js";

function fakeConnection(insertId = 7) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [{ insertId }];
    },
  };
}

test("creates a Pending payment record with the appointment id, service name snapshot and amount snapshot", async () => {
  const connection = fakeConnection(7);
  const id = await createPendingTransaction(connection, {
    appointmentId: 12,
    serviceName: "Full Groom",
    amount: 650,
  });
  assert.equal(id, 7);
  assert.equal(connection.calls.length, 1);
  const { sql, params } = connection.calls[0];
  assert.match(
    sql,
    /INSERT INTO transactions \(appointment_id, service_name, amount, status\) VALUES \(\?, \?, \?, 'Pending'\)/,
  );
  assert.deepEqual(params, [12, "Full Groom", 650]);
});

test("values go into placeholders, never into the SQL text (SQL injection safe)", async () => {
  const connection = fakeConnection();
  await createPendingTransaction(connection, {
    appointmentId: 1,
    serviceName: "x'); DROP TABLE transactions;--",
    amount: 1,
  });
  assert.equal(connection.calls[0].sql.includes("DROP"), false);
  assert.equal(
    connection.calls[0].params[1],
    "x'); DROP TABLE transactions;--",
  );
});

test("a Pending record sets no payment method and no paid date (the table's CHECK rule)", async () => {
  const connection = fakeConnection();
  await createPendingTransaction(connection, {
    appointmentId: 1,
    serviceName: "x",
    amount: 1,
  });
  assert.equal(/payment_method|paid_date/.test(connection.calls[0].sql), false);
});

test("a database error (for example a duplicate appointment_id) is not swallowed", async () => {
  const failure = Object.assign(new Error("Duplicate entry"), {
    code: "ER_DUP_ENTRY",
  });
  const connection = {
    query: async () => {
      throw failure;
    },
  };
  await assert.rejects(
    createPendingTransaction(connection, {
      appointmentId: 1,
      serviceName: "x",
      amount: 1,
    }),
    (error) => error === failure,
  );
});
