// DATA LAYER: every SQL query for the "users" table (login accounts) lives here.
// Nothing in this file decides rules. It only reads and writes rows.
// Values always go into the "?" placeholders (never glued into the SQL text).
import { pool } from "../database/pool.js";
import { withTransaction } from "../database/transaction.js";

// A user joined with their customer profile (only customer accounts have one).
const USER_SELECT = `
  SELECT u.id, u.email, u.password_hash, u.role, u.full_name, u.is_active,
         c.id AS customer_id, c.first_name AS customer_first_name, c.last_name AS customer_last_name
  FROM users u
  LEFT JOIN customers c ON c.user_id = u.id`;

// The safe version of a user: this is what the rest of the app and the API responses use.
// It never contains the password hash.
function toUser(row) {
  const customerName = row.customer_first_name
    ? `${row.customer_first_name} ${row.customer_last_name}`
    : "";
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.full_name ?? customerName, // admin/staff have full_name; customers use their profile name
    active: row.is_active === 1,
    customerId: row.customer_id ?? null,
  };
}

// The user PLUS the password hash. Only the login and change-password code may use this.
function toCredentials(row) {
  return { ...toUser(row), passwordHash: row.password_hash };
}

// The user with this id (no password hash), or null.
export async function findUserById(id) {
  const [rows] = await pool.query(`${USER_SELECT} WHERE u.id = ?`, [id]);
  return rows.length > 0 ? toUser(rows[0]) : null;
}

// The user + password hash for this email, or null. The email must already be lowercase.
export async function findCredentialsByEmail(email) {
  const [rows] = await pool.query(`${USER_SELECT} WHERE u.email = ?`, [email]);
  return rows.length > 0 ? toCredentials(rows[0]) : null;
}

// The user + password hash for this id, or null.
export async function findCredentialsById(id) {
  const [rows] = await pool.query(`${USER_SELECT} WHERE u.id = ?`, [id]);
  return rows.length > 0 ? toCredentials(rows[0]) : null;
}

// Registers a customer: creates the login account AND the customer profile in ONE transaction.
// If either INSERT fails, both are undone. The profile's email is the same as the account email.
// It is always a NEW profile: it is never linked to an existing walk-in customer.
// A duplicate account email throws an error with code "ER_DUP_ENTRY" (the service turns it into a 409).
export async function createCustomerAccount({
  email,
  passwordHash,
  firstName,
  lastName,
  contactNumber,
  address,
}) {
  return withTransaction(pool, async (connection) => {
    const [userResult] = await connection.query(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'customer')",
      [email, passwordHash],
    );
    const userId = userResult.insertId;

    const [customerResult] = await connection.query(
      "INSERT INTO customers (user_id, first_name, last_name, contact_number, email, address) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, firstName, lastName, contactNumber, email, address || null],
    );

    return { userId, customerId: customerResult.insertId };
  });
}

// Saves a new password hash for a user.
export async function updatePasswordHash(id, passwordHash) {
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [
    passwordHash,
    id,
  ]);
}

// How many admin accounts exist (used by the create-admin script).
export async function countAdmins() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'",
  );
  return Number(rows[0].total);
}

// True when a login account with this email already exists (email must be lowercase).
export async function emailExists(email) {
  const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [
    email,
  ]);
  return rows.length > 0;
}

// Creates an admin account and returns its id (used by the create-admin script).
export async function createAdmin({ email, passwordHash, fullName }) {
  const [result] = await pool.query(
    "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
    [email, passwordHash, fullName],
  );
  return result.insertId;
}
