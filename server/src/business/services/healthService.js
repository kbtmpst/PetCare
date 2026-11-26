// BUSINESS LAYER: decides what the health check answers.
// It asks the data layer to ping MySQL, then builds a clear answer. It never throws:
// a database problem becomes an "error" answer that the controller sends to the browser.
import { pingDatabase } from "../../data/repositories/healthRepository.js";

// Turns a technical MySQL error into a short hint for the developer.
// (The full error is only printed in the server terminal, never sent to the browser.)
function explainDatabaseError(error) {
  switch (error.code) {
    case "ECONNREFUSED":
      return "Cannot reach MySQL. Is the MySQL service running? Check DB_HOST and DB_PORT in server/.env.";
    case "ENOTFOUND":
      return "The DB_HOST in server/.env was not found.";
    case "ETIMEDOUT":
      return "Connecting to MySQL timed out. Check DB_HOST and DB_PORT in server/.env.";
    case "ER_ACCESS_DENIED_ERROR":
      return "MySQL refused the login. Check DB_USER and DB_PASSWORD in server/.env.";
    case "ER_BAD_DB_ERROR":
      return "The database was not found. Check DB_NAME in server/.env and run the schema script.";
    default:
      return "Could not use the database. Look at the server terminal for details.";
  }
}

// Returns { ok: true, body } when MySQL answers, or { ok: false, body } when it does not.
export async function getHealth() {
  const timestamp = new Date().toISOString();

  try {
    const db = await pingDatabase();
    return {
      ok: true,
      body: {
        status: "ok",
        server: "running",
        database: {
          status: "connected",
          name: db.name,
          version: db.version,
          timeZone: db.timeZone,
        },
        timestamp,
      },
    };
  } catch (error) {
    console.error(
      "Database health check failed:",
      error.code || "",
      error.message,
    );
    return {
      ok: false,
      body: {
        status: "error",
        server: "running",
        database: {
          status: "unreachable",
          code: error.code || "UNKNOWN",
          message: explainDatabaseError(error),
        },
        timestamp,
      },
    };
  }
}
