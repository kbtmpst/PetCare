// DATA LAYER: the only place that talks to MySQL for the health check.
// It asks MySQL three simple questions. If MySQL cannot be reached, pool.query throws an error.
import { pool } from "../database/pool.js";

export async function pingDatabase() {
  const [rows] = await pool.query(
    "SELECT DATABASE() AS name, VERSION() AS version, @@session.time_zone AS timeZone",
  );
  return rows[0];
}
