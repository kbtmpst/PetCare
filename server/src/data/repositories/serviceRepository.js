// DATA LAYER: every SQL query for the "services" table lives here.
// Nothing in this file decides rules. It only reads and writes rows.
// Values always go into the "?" placeholders (never glued into the SQL text), which protects
// against SQL injection.
import { pool } from "../database/pool.js";

const COLUMNS = "id, name, description, price, duration_minutes, is_active";

// Turns a database row into the object the rest of the app uses.
// MySQL sends DECIMAL as text ("650.00") and TINYINT as 1/0, so convert them here.
function toService(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    durationMinutes: row.duration_minutes,
    active: row.is_active === 1,
  };
}

// All services, A-Z by name. Pass true or false to get only active or only inactive services.
// Pass nothing (undefined) to get all of them.
export async function getServices(active) {
  let sql = `SELECT ${COLUMNS} FROM services`;
  const params = [];

  if (active !== undefined) {
    sql += " WHERE is_active = ?";
    params.push(active ? 1 : 0);
  }
  sql += " ORDER BY name";

  const [rows] = await pool.query(sql, params);
  return rows.map(toService);
}

// One service, or null when there is no service with this id.
export async function getServiceById(id) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM services WHERE id = ?`,
    [id],
  );
  return rows.length > 0 ? toService(rows[0]) : null;
}

// The id of the service with this name, or null. MySQL ignores capital letters when comparing,
// the same way the UNIQUE rule on services.name does.
export async function findServiceIdByName(name) {
  const [rows] = await pool.query("SELECT id FROM services WHERE name = ?", [
    name,
  ]);
  return rows.length > 0 ? rows[0].id : null;
}

// Adds a service and returns it (with the new id the database created).
export async function createService(service) {
  const [result] = await pool.query(
    "INSERT INTO services (name, description, price, duration_minutes, is_active) VALUES (?, ?, ?, ?, ?)",
    [
      service.name,
      service.description,
      service.price,
      service.durationMinutes,
      service.active ? 1 : 0,
    ],
  );
  return getServiceById(result.insertId);
}

// Replaces the details of one service and returns the updated service.
export async function updateService(id, service) {
  await pool.query(
    "UPDATE services SET name = ?, description = ?, price = ?, duration_minutes = ?, is_active = ? WHERE id = ?",
    [
      service.name,
      service.description,
      service.price,
      service.durationMinutes,
      service.active ? 1 : 0,
      id,
    ],
  );
  return getServiceById(id);
}

// Changes only the active flag and returns the updated service.
export async function setServiceActive(id, active) {
  await pool.query("UPDATE services SET is_active = ? WHERE id = ?", [
    active ? 1 : 0,
    id,
  ]);
  return getServiceById(id);
}
