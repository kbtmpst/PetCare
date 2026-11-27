// DATA LAYER: SQL for the "transactions" (payments) table.
// Only what the Appointments business layer needs: creating the payment record when an appointment is Completed.
// It takes the CONNECTION of a running database transaction, so the payment is saved (or undone) together with
// the appointment's status change.
// Values always go into the "?" placeholders (never glued into the SQL text).

// Creates the Pending payment record of a completed appointment.
//   serviceName: the service name at this moment (a snapshot: renaming the service later does not change it)
//   amount:      the appointment's own price (a snapshot too)
// A Pending transaction has no payment method and no paid date (the table's CHECK rule). transaction_date is
// filled by the database. A second transaction for the same appointment throws "ER_DUP_ENTRY"
// (the appointment_id column is UNIQUE).
export async function createPendingTransaction(
  connection,
  { appointmentId, serviceName, amount },
) {
  const [result] = await connection.query(
    "INSERT INTO transactions (appointment_id, service_name, amount, status) VALUES (?, ?, ?, 'Pending')",
    [appointmentId, serviceName, amount],
  );
  return result.insertId;
}
