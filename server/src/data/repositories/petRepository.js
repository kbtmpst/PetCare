// DATA LAYER: every SQL query for the "pets" table lives here.
// Nothing in this file decides rules. It only reads and writes rows.
// Values always go into the "?" placeholders (never glued into the SQL text), which protects
// against SQL injection.
import { pool } from "../database/pool.js";

const COLUMNS = "id, customer_id, name, species, breed, birth_date, sex, notes";

// Turns a database row into the object the rest of the app uses.
// The database stores "no birth date" / "no notes" as NULL; the app (like the frontend) uses "".
// birth_date arrives as text like "2024-03-15" because the pool uses dateStrings: true.
function toPet(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    species: row.species,
    breed: row.breed,
    birthDate: row.birth_date ?? "",
    sex: row.sex,
    notes: row.notes ?? "",
  };
}

// In a LIKE pattern, % and _ are wildcards. This makes them (and the backslash) match themselves,
// so searching for "50%" does not match everything.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

// All pets, A-Z by name. Both filters are optional and can be used together:
//   customerId  only the pets of this owner
//   search      part of the pet's name
export async function getPets({ customerId, search } = {}) {
  let sql = `SELECT ${COLUMNS} FROM pets`;
  const conditions = [];
  const params = [];

  if (customerId !== undefined) {
    conditions.push("customer_id = ?");
    params.push(customerId);
  }
  if (search !== undefined) {
    conditions.push("name LIKE ?");
    params.push(`%${escapeLike(search)}%`);
  }
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY name, id";

  const [rows] = await pool.query(sql, params);
  return rows.map(toPet);
}

// One pet, or null when there is no pet with this id.
export async function getPetById(id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM pets WHERE id = ?`, [
    id,
  ]);
  return rows.length > 0 ? toPet(rows[0]) : null;
}

// Adds a pet and returns it (with the new id the database created).
// An empty birth date or notes is saved as NULL.
export async function createPet(pet) {
  const [result] = await pool.query(
    "INSERT INTO pets (customer_id, name, species, breed, birth_date, sex, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      pet.customerId,
      pet.name,
      pet.species,
      pet.breed,
      pet.birthDate || null,
      pet.sex,
      pet.notes || null,
    ],
  );
  return getPetById(result.insertId);
}

// Replaces the details of one pet and returns the updated pet.
export async function updatePet(id, pet) {
  await pool.query(
    "UPDATE pets SET customer_id = ?, name = ?, species = ?, breed = ?, birth_date = ?, sex = ?, notes = ? WHERE id = ?",
    [
      pet.customerId,
      pet.name,
      pet.species,
      pet.breed,
      pet.birthDate || null,
      pet.sex,
      pet.notes || null,
      id,
    ],
  );
  return getPetById(id);
}
