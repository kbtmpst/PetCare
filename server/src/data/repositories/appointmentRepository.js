// DATA LAYER: every SQL query for the "appointments" table lives here.
// Nothing in this file decides rules. It only reads and writes rows.
// Values always go into the "?" placeholders (never glued into the SQL text), which protects
// against SQL injection.
//
// Two kinds of functions:
//   - plain reads (getAppointments, getAppointmentById) that use the shared pool;
//   - "inside a transaction" queries, handed to the business service through runInScheduleTransaction /
//     runInTransaction. They run on ONE connection, so a booking (or a status change plus its payment record)
//     is saved all together or not at all. See data/database/scheduleLock.js for the booking lock.
import { pool } from "../database/pool.js";
import { withTransaction } from "../database/transaction.js";
import { withScheduleLock } from "../database/scheduleLock.js";
import { createPendingTransaction } from "./transactionRepository.js";

// An appointment together with its service name (the service name is only read, never changed here).
const SELECT_APPOINTMENT = `
  SELECT a.id, a.pet_id, a.customer_id, a.service_id, s.name AS service_name, a.price, a.duration_minutes,
         a.appointment_date, a.start_time, a.notes, a.status
    FROM appointments a
    JOIN services s ON s.id = a.service_id`;

// Turns a database row into the object the rest of the app uses (the same field names as the frontend).
// MySQL sends DECIMAL as text ("650.00"), so convert it. start_time arrives as "08:30:00"; the app uses "08:30".
// appointment_date arrives as text like "2026-12-01" because the pool uses dateStrings: true.
function toAppointment(row) {
  return {
    id: row.id,
    petId: row.pet_id,
    customerId: row.customer_id,
    serviceId: row.service_id,
    service: row.service_name,
    price: Number(row.price),
    durationMinutes: row.duration_minutes,
    date: row.appointment_date,
    time: String(row.start_time).slice(0, 5),
    notes: row.notes ?? "",
    status: row.status,
  };
}

// ---------------------------------------------------------------------------
// Reading (outside a transaction)
// ---------------------------------------------------------------------------

// All appointments, oldest date first. Every filter is optional and they can be combined:
//   status, date ("YYYY-MM-DD"), petId, customerId
export async function getAppointments({
  status,
  date,
  petId,
  customerId,
} = {}) {
  let sql = SELECT_APPOINTMENT;
  const conditions = [];
  const params = [];

  if (status !== undefined) {
    conditions.push("a.status = ?");
    params.push(status);
  }
  if (date !== undefined) {
    conditions.push("a.appointment_date = ?");
    params.push(date);
  }
  if (petId !== undefined) {
    conditions.push("a.pet_id = ?");
    params.push(petId);
  }
  if (customerId !== undefined) {
    conditions.push("a.customer_id = ?");
    params.push(customerId);
  }
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY a.appointment_date, a.start_time, a.id";

  const [rows] = await pool.query(sql, params);
  return rows.map(toAppointment);
}

// One appointment, or null when there is no appointment with this id.
export async function getAppointmentById(id) {
  const [rows] = await pool.query(`${SELECT_APPOINTMENT} WHERE a.id = ?`, [id]);
  return rows.length > 0 ? toAppointment(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Inside a transaction
// ---------------------------------------------------------------------------

// The queries the business service may run inside a transaction. "connection" is the one connection of that
// transaction. (Exported so the tests can check the SQL with a fake connection, without MySQL.)
export function createTransactionQueries(connection) {
  async function getById(id) {
    const [rows] = await connection.query(
      `${SELECT_APPOINTMENT} WHERE a.id = ?`,
      [id],
    );
    return rows.length > 0 ? toAppointment(rows[0]) : null;
  }

  return {
    getAppointmentById: getById,

    // Reads one appointment AND locks its row until the transaction ends, so a second request that wants to
    // change the same appointment waits. "OF a" locks only the appointment row, not the service row.
    async getAppointmentForUpdate(id) {
      const [rows] = await connection.query(
        `${SELECT_APPOINTMENT} WHERE a.id = ? FOR UPDATE OF a`,
        [id],
      );
      return rows.length > 0 ? toAppointment(rows[0]) : null;
    },

    // Appointments that could overlap a booking on "date": the day before, the day itself and the day after
    // (an appointment can last up to 10 hours, so it can run into the next day). Cancelled ones never block.
    // excludeId is the appointment being edited, so it never conflicts with itself.
    async findScheduleCandidates({ date, excludeId }) {
      let sql = `SELECT id, appointment_date, start_time, duration_minutes
                   FROM appointments
                  WHERE appointment_date BETWEEN DATE_SUB(?, INTERVAL 1 DAY) AND DATE_ADD(?, INTERVAL 1 DAY)
                    AND status <> 'Cancelled'`;
      const params = [date, date];
      if (excludeId !== undefined) {
        sql += " AND id <> ?";
        params.push(excludeId);
      }
      const [rows] = await connection.query(sql, params);
      return rows.map((row) => ({
        id: row.id,
        date: row.appointment_date,
        time: String(row.start_time).slice(0, 5),
        durationMinutes: row.duration_minutes,
      }));
    },

    // Adds an appointment and returns it. The status is always set by the business service ("Pending").
    // An empty note is saved as NULL.
    async insertAppointment(appointment) {
      const [result] = await connection.query(
        `INSERT INTO appointments
           (pet_id, customer_id, service_id, price, duration_minutes, appointment_date, start_time, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          appointment.petId,
          appointment.customerId,
          appointment.serviceId,
          appointment.price,
          appointment.durationMinutes,
          appointment.date,
          appointment.time,
          appointment.notes || null,
          appointment.status,
        ],
      );
      return getById(result.insertId);
    },

    // Replaces the editable details of one appointment (never its status) and returns it.
    async updateAppointmentDetails(id, appointment) {
      await connection.query(
        `UPDATE appointments
            SET pet_id = ?, customer_id = ?, service_id = ?, price = ?, duration_minutes = ?,
                appointment_date = ?, start_time = ?, notes = ?
          WHERE id = ?`,
        [
          appointment.petId,
          appointment.customerId,
          appointment.serviceId,
          appointment.price,
          appointment.durationMinutes,
          appointment.date,
          appointment.time,
          appointment.notes || null,
          id,
        ],
      );
      return getById(id);
    },

    // Changes only the status.
    async setStatus(id, status) {
      await connection.query(
        "UPDATE appointments SET status = ? WHERE id = ?",
        [status, id],
      );
    },

    // Creates the Pending payment record of a completed appointment (same transaction as the status change).
    async insertTransaction({ appointmentId, serviceName, amount }) {
      return createPendingTransaction(connection, {
        appointmentId,
        serviceName,
        amount,
      });
    },
  };
}

// Runs work(tx) as one all-or-nothing transaction. If work throws, everything is undone.
export function runInTransaction(work) {
  return withTransaction(pool, (connection) =>
    work(createTransactionQueries(connection)),
  );
}

// Same, but FIRST takes the shop-wide schedule lock (see data/database/scheduleLock.js).
// Use it for anything that checks the schedule and then saves: booking and rescheduling.
export function runInScheduleTransaction(work) {
  return withScheduleLock(pool, (connection) =>
    work(createTransactionQueries(connection)),
  );
}
