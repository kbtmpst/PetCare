// DATA LAYER: every SQL query for the "customers" table lives here.
// Nothing in this file decides rules. It only reads and writes rows.
// Values always go into the "?" placeholders (never glued into the SQL text), which protects
// against SQL injection.
import { pool } from "../database/pool.js";

const COLUMNS =
  "id, first_name, last_name, contact_number, email, address, date_registered";

// The phone number with spaces, dashes, dots and brackets removed, so a search for "0917123"
// finds a customer stored as "0917 123 4567" (the number is stored exactly as typed).
const PLAIN_PHONE_SQL =
  "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(contact_number, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')";

// Turns a database row into the object the rest of the app uses.
// The database stores "no email" / "no address" as NULL; the app (like the frontend) uses "".
// date_registered arrives as text like "2026-11-26" because the pool uses dateStrings: true.
function toCustomer(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    contactNumber: row.contact_number,
    email: row.email ?? "",
    address: row.address ?? "",
    dateRegistered: row.date_registered,
  };
}

// In a LIKE pattern, % and _ are wildcards. This makes them (and the backslash) match themselves,
// so searching for "50%" does not match everything.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

// All customers, A-Z by last name then first name.
// "search" (optional) matches part of the full name, the email, or the phone number.
export async function getCustomers(search) {
  let sql = `SELECT ${COLUMNS} FROM customers`;
  const params = [];

  if (search !== undefined) {
    const pattern = `%${escapeLike(search)}%`;
    const conditions = [
      "CONCAT(first_name, ' ', last_name) LIKE ?",
      "email LIKE ?",
    ];
    params.push(pattern, pattern);

    // If the search looks like a phone number, also compare it with the phone digits only.
    const looksLikePhone = /^[\d\s+\-().]+$/.test(search);
    const phoneDigits = search.replace(/[^\d+]/g, "");
    if (looksLikePhone && phoneDigits !== "") {
      conditions.push(`${PLAIN_PHONE_SQL} LIKE ?`);
      params.push(`%${escapeLike(phoneDigits)}%`);
    }

    sql += ` WHERE ${conditions.join(" OR ")}`;
  }
  sql += " ORDER BY last_name, first_name, id";

  const [rows] = await pool.query(sql, params);
  return rows.map(toCustomer);
}

// One customer, or null when there is no customer with this id.
export async function getCustomerById(id) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM customers WHERE id = ?`,
    [id],
  );
  return rows.length > 0 ? toCustomer(rows[0]) : null;
}

// Adds a customer and returns it (with the new id and registration date the database created).
// date_registered is not sent: the table fills in today's date by itself.
// An empty email or address is saved as NULL.
export async function createCustomer(customer) {
  const [result] = await pool.query(
    "INSERT INTO customers (first_name, last_name, contact_number, email, address) VALUES (?, ?, ?, ?, ?)",
    [
      customer.firstName,
      customer.lastName,
      customer.contactNumber,
      customer.email || null,
      customer.address || null,
    ],
  );
  return getCustomerById(result.insertId);
}

// Replaces the details of one customer and returns the updated customer.
// The registration date and the linked login account (user_id) are never changed here.
export async function updateCustomer(id, customer) {
  await pool.query(
    "UPDATE customers SET first_name = ?, last_name = ?, contact_number = ?, email = ?, address = ? WHERE id = ?",
    [
      customer.firstName,
      customer.lastName,
      customer.contactNumber,
      customer.email || null,
      customer.address || null,
      id,
    ],
  );
  return getCustomerById(id);
}
