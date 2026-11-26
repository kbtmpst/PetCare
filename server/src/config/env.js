// CONFIG: reads the settings from the server/.env file and checks them.
// Every other file imports "config" from here instead of reading process.env directly,
// so all settings live in one place.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Load server/.env no matter which folder the command is started from.
dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

// A setting that must exist. If it is missing, stop with a clear message.
function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing ${name}. Open server/.env (copy .env.example if you do not have it) and set ${name}.`,
    );
  }
  return value.trim();
}

const timezone = (process.env.DB_TIMEZONE || "+08:00").trim();
if (!/^[+-]\d{2}:\d{2}$/.test(timezone)) {
  throw new Error('DB_TIMEZONE must look like "+08:00".');
}

// --- Authentication settings -------------------------------------------------
// The secret signs the login tokens. Anyone who knows it can forge a login, so it must be long, random,
// private (only in server/.env) and never written in the code.
const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32 || jwtSecret.startsWith("replace_with")) {
  throw new Error(
    "JWT_SECRET in server/.env is too short or still the example text. Use a random value of at least 32 characters.",
  );
}

// How long a login lasts, for example 8h, 30m or 1d.
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || "8h").trim();
if (!/^[1-9]\d*[mhd]$/.test(jwtExpiresIn)) {
  throw new Error(
    'JWT_EXPIRES_IN must look like "8h" (a number followed by m, h or d).',
  );
}

// How much work bcrypt does per password. Higher is safer but slower. 10 is a good default.
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS || 10);
if (!Number.isInteger(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 15) {
  throw new Error("BCRYPT_ROUNDS must be a whole number from 4 to 15.");
}

export const config = {
  port: Number(process.env.PORT) || 5000,

  // Websites that are allowed to call this API (the Vite dev server). Separate several with commas.
  clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: required("DB_USER"),
    password: process.env.DB_PASSWORD ?? "",
    database: required("DB_NAME"),
    timezone,
  },

  auth: {
    jwtSecret,
    jwtExpiresIn,
    bcryptRounds,
  },
};
