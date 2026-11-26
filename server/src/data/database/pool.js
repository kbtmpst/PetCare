// DATA LAYER: the MySQL connection pool.
// A pool keeps a few connections open and lends them out, so each request does not have to
// open a new connection. Repositories import "pool" from here and call pool.query(...).
import mysql from "mysql2/promise";
import { config } from "../../config/env.js";

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,

  waitForConnections: true, // when all connections are busy, wait instead of failing
  connectionLimit: 10,
  connectTimeout: 10000, // give up after 10 seconds if MySQL cannot be reached

  timezone: config.db.timezone, // how JavaScript dates are converted
  dateStrings: true, // return DATE/DATETIME as text ("2026-11-26"), like the frontend uses
});

// Make every new connection use Philippine time, so CURDATE() and the created_at defaults match
// the database scripts. (The health check reports the value so you can see that it worked.)
pool.pool.on("connection", (connection) => {
  connection.query("SET time_zone = ?", [config.db.timezone]);
});
